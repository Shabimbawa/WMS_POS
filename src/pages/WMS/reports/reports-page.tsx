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

import type { DailyReportKind, DailyReportParams, ReceivingSource } from "../../../queries/types";
import { useDailyReport, useProductCategories, useReportShipments } from "../../../queries/useHooks";
import { DateParser } from "../../../common/utils/util";
import { fmtInt, fmtProduct } from "../type-format/format";
import { printReport } from "./print-report";
import {
  buildGrids,
  granularityFor,
  gridPrintSection,
  REPORT_KIND_LABEL,
  type Granularity,
} from "./report-grid";
import {
  describePeriod,
  PERIOD_OPTIONS,
  resolvePeriod,
  today,
  toIsoDate,
  type PeriodKind,
} from "./report-period";
import { TimeframeGrid } from "./reports-table";

const { RangePicker } = DatePicker;

type SourceFilter = "ALL" | ReceivingSource;

const REPORT_DESCRIPTION: Record<DailyReportKind, string> = {
  purchase:
    "Sacks ordered in per day: shipments by packing-list date (declared sacks) and local deliveries by date received.",
  sales: "Sacks sold per day, from order slips. Slips in Trash are left out.",
};

/** What the last Generate press asked for; the grids show exactly this. */
type Applied = {
  params: DailyReportParams;
  granularity: Granularity;
  /** Products were picked by hand, so show them even with no sacks. */
  keepEmpty: boolean;
  subtitle: string[];
};

export default function ReportsPage() {
  const [kind, setKind] = useState<DailyReportKind>("purchase");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("weekly");
  const [anchor, setAnchor] = useState<Dayjs>(today);
  const [custom, setCustom] = useState<[Dayjs, Dayjs]>(() => [today().subtract(13, "day"), today()]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [shipmentId, setShipmentId] = useState<string | undefined>();
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [applied, setApplied] = useState<Applied | null>(null);

  const { data: products, isLoading: loadingProducts } = useProductCategories();
  const { data: shipments, isLoading: loadingShipments } = useReportShipments();

  const range = resolvePeriod(periodKind, anchor, custom);
  const shipmentOverridesPeriod = kind === "purchase" && Boolean(shipmentId);

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
    if (shipmentOverridesPeriod) {
      subtitle.push(`Shipment: ${shipmentOptions.find((o) => o.value === shipmentId)?.label ?? ""}`);
    } else {
      subtitle.push(`Period: ${describePeriod(periodKind, range)}`);
    }
    subtitle.push(
      productIds.length
        ? `Products: ${productIds.map((id) => productOptions.find((o) => o.value === id)?.label ?? id).join(", ")}`
        : "Products: all",
    );
    if (kind === "purchase" && !shipmentOverridesPeriod && source !== "ALL") {
      subtitle.push(`Source: ${source === "SHIPMENT" ? "shipments only" : "local deliveries only"}`);
    }
    setApplied({
      params: {
        kind,
        dateFrom: toIsoDate(range[0]),
        dateTo: toIsoDate(range[1]),
        productIds: productIds.length ? productIds.join(",") : undefined,
        shipmentId: kind === "purchase" ? shipmentId : undefined,
        source: kind === "purchase" && !shipmentOverridesPeriod ? source : undefined,
      },
      // A whole shipment can span any dates; give it day columns regardless.
      granularity: shipmentOverridesPeriod ? "day" : granularityFor(range),
      keepEmpty: productIds.length > 0,
      subtitle,
    });
  };

  const report = useDailyReport(applied?.params ?? null);
  const grids = useMemo(
    () => (applied && report.data ? buildGrids(report.data, applied.granularity, applied.keepEmpty) : []),
    [applied, report.data],
  );

  const exportPdf = () => {
    if (!applied) return;
    printReport({
      title: `${REPORT_KIND_LABEL[applied.params.kind]} Report`,
      subtitle: applied.subtitle,
      sections: grids.map((grid) => gridPrintSection(grid, applied.params.kind)),
    });
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

  const grandTotal = grids.reduce((n, g) => n + g.grandTotal, 0);
  const activeColumns = new Set(grids.flatMap((g) => g.columns.map((c) => c.key))).size;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>Generate Reports</Typography.Title>
        <Button
          icon={<FilePdfOutlined />}
          disabled={!report.data || report.isFetching || !grids.length}
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
          <Form.Item label="Report" style={{ marginBottom: 12 }} extra={REPORT_DESCRIPTION[kind]}>
            <Segmented
              value={kind}
              onChange={(value) => setKind(value as DailyReportKind)}
              options={(["purchase", "sales"] as const).map((value) => ({ label: REPORT_KIND_LABEL[value], value }))}
            />
          </Form.Item>

          <Flex wrap gap={16} align="end">
            <Form.Item
              label="Period"
              style={{ marginBottom: 0 }}
              extra={
                shipmentOverridesPeriod
                  ? "Ignored: a shipment is selected"
                  : `${describePeriod(periodKind, range)}${granularityFor(range) === "month" ? " · one column per month" : ""}`
              }
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

            {kind === "purchase" && (
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
      ) : report.isError ? (
        <Alert type="error" showIcon message="Could not generate report" description={(report.error as Error).message} />
      ) : report.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !grids.length ? (
        <Empty description={`No ${applied.params.kind === "sales" ? "sales" : "purchases"} for these filters`} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", opacity: report.isFetching ? 0.6 : 1 }}>
          <Card size="small">
            <Flex wrap gap={32} align="center">
              <Statistic title="Report" value={REPORT_KIND_LABEL[applied.params.kind]} />
              <Statistic title="Brands" value={grids.length} />
              <Statistic title={applied.granularity === "day" ? "Days with sacks" : "Months with sacks"} value={activeColumns} />
              <Statistic title="Total sacks" value={fmtInt(grandTotal)} />
              <Typography.Text type="secondary" style={{ marginLeft: "auto" }}>{applied.subtitle[0]}</Typography.Text>
            </Flex>
          </Card>
          {grids.map((grid) => (
            <Card key={grid.brand} size="small">
              <TimeframeGrid grid={grid} kind={applied.params.kind} />
            </Card>
          ))}
        </Space>
      )}
    </Space>
  );
}
