import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Segmented,
  Select,
  Skeleton,
  Space,
  Statistic,
  Typography,
} from "antd";
import { FilePdfOutlined, TableOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";

import type { ReceivingParams, ReceivingSource } from "../../../queries/types";
import {
  useProductCategories,
  useReceivingReport,
  useReportShipments,
  useStockSummaryReport,
} from "../../../queries/useHooks";
import { DateParser } from "../../../common/utils/util";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import { printReport } from "./print-report";
import {
  receivingPrintable,
  receivingTotals,
  stockSummaryPrintable,
  stockSummaryTotals,
} from "./report-export";
import {
  describePeriod,
  PERIOD_OPTIONS,
  resolvePeriod,
  today,
  toIsoDate,
  type PeriodKind,
} from "./report-period";
import { ReceivingTable, StockSummaryTable } from "./reports-table";

const { RangePicker } = DatePicker;

type ReportType = "stock" | "receiving";
type SourceFilter = "ALL" | ReceivingSource;

const REPORT_OPTIONS: { label: string; value: ReportType; description: string }[] = [
  {
    label: "Stock summary",
    value: "stock",
    description: "Per product: opening stock, what came in, what was sold or adjusted, and closing stock.",
  },
  {
    label: "Receiving",
    value: "receiving",
    description: "Every line received from shipments and local deliveries, with declared vs counted sacks and value.",
  },
];

/** What the last Generate press asked for; the table shows exactly this. */
type Applied =
  | { type: "stock"; params: { dateFrom: string; dateTo: string; productIds?: string }; subtitle: string[] }
  | { type: "receiving"; params: ReceivingParams; subtitle: string[] };

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("stock");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("monthly");
  const [anchor, setAnchor] = useState<Dayjs>(today);
  const [custom, setCustom] = useState<[Dayjs, Dayjs]>(() => [today().subtract(29, "day"), today()]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [shipmentId, setShipmentId] = useState<string | undefined>();
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [applied, setApplied] = useState<Applied | null>(null);

  const { data: products, isLoading: loadingProducts } = useProductCategories();
  const { data: shipments, isLoading: loadingShipments } = useReportShipments();

  const range = resolvePeriod(periodKind, anchor, custom);
  const shipmentOverridesPeriod = reportType === "receiving" && Boolean(shipmentId);

  const productOptions = useMemo(
    () => (products ?? []).map((p) => ({ label: fmtProduct(p), value: p.id })),
    [products],
  );
  const shipmentOptions = useMemo(
    () =>
      (shipments ?? []).map((s) => ({
        label: `${s.reference || "No reference"} · ${s.supplier} · ${DateParser(s.date_list_received)}`,
        value: s.id,
      })),
    [shipments],
  );

  const generate = () => {
    const subtitle: string[] = [];
    const shipment = shipments?.find((s) => s.id === shipmentId);
    if (shipmentOverridesPeriod && shipment) {
      subtitle.push(`Shipment: ${shipmentOptions.find((o) => o.value === shipment.id)?.label}`);
    } else {
      subtitle.push(`Period: ${describePeriod(periodKind, range)}`);
    }
    subtitle.push(
      productIds.length
        ? `Products: ${productIds.map((id) => productOptions.find((o) => o.value === id)?.label ?? id).join(", ")}`
        : "Products: all",
    );
    const base = {
      dateFrom: toIsoDate(range[0]),
      dateTo: toIsoDate(range[1]),
      productIds: productIds.length ? productIds.join(",") : undefined,
    };
    if (reportType === "stock") {
      setApplied({ type: "stock", params: base, subtitle });
    } else {
      if (!shipmentOverridesPeriod) {
        subtitle.push(`Source: ${source === "ALL" ? "shipments and local deliveries" : source === "SHIPMENT" ? "shipments" : "local deliveries"}`);
      }
      setApplied({
        type: "receiving",
        params: { ...base, shipmentId, source: shipmentOverridesPeriod ? undefined : source },
        subtitle,
      });
    }
  };

  const stockQuery = useStockSummaryReport(applied?.type === "stock" ? applied.params : null);
  const receivingQuery = useReceivingReport(applied?.type === "receiving" ? applied.params : null);
  const active = applied?.type === "receiving" ? receivingQuery : stockQuery;

  const exportPdf = () => {
    if (!applied) return;
    if (applied.type === "stock" && stockQuery.data) {
      printReport(stockSummaryPrintable(stockQuery.data, applied.subtitle));
    } else if (applied.type === "receiving" && receivingQuery.data) {
      printReport(receivingPrintable(receivingQuery.data, applied.subtitle));
    }
  };

  const periodPicker = (() => {
    switch (periodKind) {
      case "weekly":
        return <DatePicker picker="week" value={anchor} allowClear={false} onChange={(d) => d && setAnchor(d)} />;
      case "biweekly":
        return (
          <DatePicker
            value={anchor}
            allowClear={false}
            format="MMM D, YYYY"
            onChange={(d) => d && setAnchor(d)}
            placeholder="Start date"
          />
        );
      case "monthly":
        return <DatePicker picker="month" value={anchor} allowClear={false} format="MMMM YYYY" onChange={(d) => d && setAnchor(d)} />;
      case "yearly":
        return <DatePicker picker="year" value={anchor} allowClear={false} onChange={(d) => d && setAnchor(d)} />;
      case "custom":
        return (
          <RangePicker
            value={custom}
            allowClear={false}
            format="MMM D, YYYY"
            onChange={(v) => v?.[0] && v[1] && setCustom([v[0], v[1]])}
          />
        );
    }
  })();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>Generate Reports</Typography.Title>
        <Button
          icon={<FilePdfOutlined />}
          disabled={!active.data || active.isFetching}
          onClick={exportPdf}
        >
          Export PDF / Print
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        Pick a report and filters, then Generate. Export opens the print dialog; choose "Save as PDF" to save a file.
      </Typography.Text>

      <Card size="small">
        <Form layout="vertical">
          <Form.Item label="Report" style={{ marginBottom: 12 }} extra={REPORT_OPTIONS.find((o) => o.value === reportType)?.description}>
            <Segmented
              value={reportType}
              onChange={(value) => setReportType(value as ReportType)}
              options={REPORT_OPTIONS.map(({ label, value }) => ({ label, value }))}
            />
          </Form.Item>

          <Flex wrap gap={16} align="end">
            <Form.Item
              label="Period"
              style={{ marginBottom: 0 }}
              extra={shipmentOverridesPeriod ? "Ignored: a shipment is selected" : describePeriod(periodKind, range)}
            >
              <Flex wrap gap={8}>
                <Segmented
                  value={periodKind}
                  onChange={(value) => setPeriodKind(value as PeriodKind)}
                  options={PERIOD_OPTIONS}
                  disabled={shipmentOverridesPeriod}
                />
                <div style={{ opacity: shipmentOverridesPeriod ? 0.5 : 1, pointerEvents: shipmentOverridesPeriod ? "none" : undefined }}>
                  {periodPicker}
                </div>
              </Flex>
            </Form.Item>

            <Form.Item label="Products" style={{ marginBottom: 0, flex: 1, minWidth: 260 }}>
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                placeholder="All products"
                loading={loadingProducts}
                value={productIds}
                onChange={setProductIds}
                options={productOptions}
              />
            </Form.Item>

            {reportType === "receiving" && (
              <>
                <Form.Item label="Shipment" style={{ marginBottom: 0, minWidth: 280 }}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Any shipment in the period"
                    loading={loadingShipments}
                    value={shipmentId}
                    onChange={setShipmentId}
                    options={shipmentOptions}
                    popupMatchSelectWidth={false}
                  />
                </Form.Item>
                <Form.Item label="Source" style={{ marginBottom: 0 }}>
                  <Segmented
                    value={shipmentOverridesPeriod ? "SHIPMENT" : source}
                    disabled={shipmentOverridesPeriod}
                    onChange={(value) => setSource(value as SourceFilter)}
                    options={[
                      { label: "All", value: "ALL" },
                      { label: "Shipments", value: "SHIPMENT" },
                      { label: "Local", value: "LOCAL" },
                    ]}
                  />
                </Form.Item>
              </>
            )}

            <Button type="primary" icon={<TableOutlined />} onClick={generate}>
              Generate
            </Button>
          </Flex>
        </Form>
      </Card>

      {!applied ? (
        <Empty description="Choose filters and press Generate" />
      ) : active.isError ? (
        <Alert type="error" showIcon message="Could not generate report" description={(active.error as Error).message} />
      ) : active.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Card
          size="small"
          title={applied.type === "stock" ? "Stock summary" : "Receiving"}
          extra={<Typography.Text type="secondary">{applied.subtitle[0]}</Typography.Text>}
          style={{ opacity: active.isFetching ? 0.6 : 1 }}
        >
          {applied.type === "stock" && stockQuery.data ? (
            <StockSummaryResult rows={stockQuery.data} />
          ) : applied.type === "receiving" && receivingQuery.data ? (
            <ReceivingResult rows={receivingQuery.data} />
          ) : null}
        </Card>
      )}
    </Space>
  );
}

function StockSummaryResult({ rows }: { rows: Parameters<typeof stockSummaryTotals>[0] }) {
  if (!rows.length) return <Empty description="No stock activity for these filters" />;
  const t = stockSummaryTotals(rows);
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex wrap gap={32}>
        <Statistic title="Products" value={rows.length} />
        <Statistic title="Opening (sacks)" value={fmtInt(t.opening)} />
        <Statistic title="Received (sacks)" value={fmtInt(t.received_shipments + t.received_local)} />
        <Statistic title="Sold (sacks)" value={fmtInt(t.sold)} />
        <Statistic title="Adjustments" value={fmtInt(t.adjustments)} />
        <Statistic title="Closing (sacks)" value={fmtInt(t.closing)} />
      </Flex>
      <StockSummaryTable data={rows} />
    </Space>
  );
}

function ReceivingResult({ rows }: { rows: Parameters<typeof receivingTotals>[0] }) {
  if (!rows.length) return <Empty description="Nothing was received for these filters" />;
  const t = receivingTotals(rows);
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex wrap gap={32}>
        <Statistic title="Lines" value={t.lines} />
        <Statistic title="Declared (sacks)" value={fmtInt(t.declared)} />
        <Statistic title="Counted (sacks)" value={fmtInt(t.counted)} />
        <Statistic title="Variance" value={`${t.variance > 0 ? "+" : ""}${fmtInt(t.variance)}`} />
        <Statistic title="Value" value={fmtMoney(t.value)} />
        {t.pending > 0 && <Statistic title="Awaiting unload" value={`${t.pending} lines`} />}
      </Flex>
      <ReceivingTable data={rows} />
    </Space>
  );
}
