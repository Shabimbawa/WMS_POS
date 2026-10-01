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

import type { InboundReportParams, ReceivingParams, ReceivingSource } from "../../../queries/types";
import {
  useInboundReport,
  useProductCategories,
  useReceivingReport,
  useSuppliers,
} from "../../../queries/useHooks";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import { printReport, type PrintableReport } from "./print-report";
import {
  buildGrids,
  fmtReportDate,
  granularityFor,
  gridPrintSection,
  groupBySupplier,
  receivingPrintSection,
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
import { SupplierReceivingTable, TimeframeGrid } from "./reports-table";

const { RangePicker } = DatePicker;

type ReportType = "stock" | "receiving";
type SourceFilter = "ALL" | ReceivingSource;

const REPORT_OPTIONS: { label: string; value: ReportType; description: string }[] = [
  {
    label: "Stock summary",
    value: "stock",
    description:
      "Inbound sacks per brand, by the day they arrived: containers on their unload date (counted sacks) and local deliveries on the date received.",
  },
  {
    label: "Receiving",
    value: "receiving",
    description: "Every line received in the date range, grouped by supplier, with declared vs counted sacks and value.",
  },
];

const SOURCE_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Shipments", value: "SHIPMENT" },
  { label: "Local", value: "LOCAL" },
];

const sourceLine = (source: SourceFilter) =>
  source === "ALL" ? null : `Source: ${source === "SHIPMENT" ? "shipments only" : "local deliveries only"}`;

/** What the last Generate press asked for; the tables show exactly this. */
type Applied =
  | { type: "stock"; params: InboundReportParams; granularity: Granularity; keepEmpty: boolean; subtitle: string[] }
  | { type: "receiving"; params: ReceivingParams; subtitle: string[] };

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("stock");
  const [source, setSource] = useState<SourceFilter>("ALL");
  // Stock summary filters
  const [periodKind, setPeriodKind] = useState<PeriodKind>("weekly");
  const [anchor, setAnchor] = useState<Dayjs>(today);
  const [custom, setCustom] = useState<[Dayjs, Dayjs]>(() => [today().subtract(13, "day"), today()]);
  const [productIds, setProductIds] = useState<string[]>([]);
  // Receiving filters
  const [receivingRange, setReceivingRange] = useState<[Dayjs, Dayjs]>(() => [today().startOf("month"), today()]);
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [applied, setApplied] = useState<Applied | null>(null);

  const { data: products, isLoading: loadingProducts } = useProductCategories();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();

  const range = resolvePeriod(periodKind, anchor, custom);

  const productOptions = useMemo(
    () => (products ?? []).map((p) => ({ label: fmtProduct(p), value: p.id })),
    [products],
  );
  const supplierOptions = useMemo(
    () =>
      (suppliers ?? []).map((s) => ({
        label: `${s.name} (${s.kind === "LOCAL" ? "local" : "international"})`,
        value: s.id,
      })),
    [suppliers],
  );

  const generate = () => {
    if (reportType === "stock") {
      const subtitle = [
        `Period: ${describePeriod(periodKind, range)}`,
        productIds.length
          ? `Products: ${productIds.map((id) => productOptions.find((o) => o.value === id)?.label ?? id).join(", ")}`
          : "Products: all",
        sourceLine(source),
      ].filter((line): line is string => Boolean(line));
      setApplied({
        type: "stock",
        params: {
          dateFrom: toIsoDate(range[0]),
          dateTo: toIsoDate(range[1]),
          productIds: productIds.length ? productIds.join(",") : undefined,
          source,
        },
        granularity: granularityFor(range),
        keepEmpty: productIds.length > 0,
        subtitle,
      });
    } else {
      const [from, to] = receivingRange;
      const subtitle = [
        `Date range: ${fmtReportDate(toIsoDate(from))} – ${fmtReportDate(toIsoDate(to))}`,
        `Supplier: ${supplierId ? (suppliers?.find((s) => s.id === supplierId)?.name ?? "") : "all"}`,
        sourceLine(source),
      ].filter((line): line is string => Boolean(line));
      setApplied({
        type: "receiving",
        params: { dateFrom: toIsoDate(from), dateTo: toIsoDate(to), supplierId, source },
        subtitle,
      });
    }
  };

  const inbound = useInboundReport(applied?.type === "stock" ? applied.params : null);
  const receiving = useReceivingReport(applied?.type === "receiving" ? applied.params : null);
  const active = applied?.type === "receiving" ? receiving : inbound;

  const grids = useMemo(
    () =>
      applied?.type === "stock" && inbound.data
        ? buildGrids(inbound.data, applied.granularity, applied.keepEmpty)
        : [],
    [applied, inbound.data],
  );
  const supplierGroups = useMemo(
    () => (applied?.type === "receiving" && receiving.data ? groupBySupplier(receiving.data) : []),
    [applied, receiving.data],
  );
  const hasResults = applied?.type === "stock" ? grids.length > 0 : supplierGroups.length > 0;

  const exportPdf = () => {
    if (!applied) return;
    const report: PrintableReport =
      applied.type === "stock"
        ? {
          title: "Stock Summary (Inbound)",
          subtitle: applied.subtitle,
          sections: grids.map(gridPrintSection),
          pagePerSection: true,
        }
        : {
          title: "Receiving Report",
          subtitle: applied.subtitle,
          sections: supplierGroups.map(receivingPrintSection),
        };
    printReport(report);
  };

  const periodPicker = (() => {
    switch (periodKind) {
      case "weekly":
        return <DatePicker picker="week" showWeek={false} value={anchor} allowClear={false} onChange={(d) => d && setAnchor(d)} />;
      case "biweekly":
        return (
          <DatePicker
            value={anchor}
            allowClear={false}
            format="MM/DD/YYYY"
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
            format="MM/DD/YYYY"
            onChange={(v) => v?.[0] && v[1] && setCustom([v[0], v[1]])}
          />
        );
    }
  })();

  const grandTotal = grids.reduce((n, g) => n + g.grandTotal, 0);
  const activeColumns = new Set(grids.flatMap((g) => g.columns.map((c) => c.key))).size;
  const receivedTotals = supplierGroups.reduce(
    (t, g) => ({
      lines: t.lines + g.rows.length,
      counted: t.counted + g.counted,
      variance: t.variance + g.variance,
      value: t.value + g.value,
    }),
    { lines: 0, counted: 0, variance: 0, value: 0 },
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>Generate Reports</Typography.Title>
        <Button icon={<FilePdfOutlined />} disabled={!hasResults || active.isFetching} onClick={exportPdf}>
          Export PDF / Print
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        Pick a report and filters, then Generate. Export opens the print dialog; choose "Save as PDF" to save a file.
        Only received stock is counted: pending or cancelled containers and voided deliveries are left out.
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
            {reportType === "stock" ? (
              <>
                <Form.Item
                  label="Period"
                  style={{ marginBottom: 0 }}
                  extra={`${describePeriod(periodKind, range)}${granularityFor(range) === "month" ? " · one column per month" : ""}`}
                >
                  <Flex wrap gap={8}>
                    <Segmented
                      value={periodKind}
                      onChange={(value) => setPeriodKind(value as PeriodKind)}
                      options={PERIOD_OPTIONS}
                    />
                    {periodPicker}
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
              </>
            ) : (
              <>
                <Form.Item label="Date range" style={{ marginBottom: 0 }}>
                  <RangePicker
                    value={receivingRange}
                    allowClear={false}
                    format="MM/DD/YYYY"
                    onChange={(v) => v?.[0] && v[1] && setReceivingRange([v[0], v[1]])}
                  />
                </Form.Item>
                <Form.Item label="Supplier" style={{ marginBottom: 0, minWidth: 280, flex: 1 }}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="All suppliers"
                    loading={loadingSuppliers}
                    value={supplierId}
                    onChange={setSupplierId}
                    options={supplierOptions}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item label="Source" style={{ marginBottom: 0 }}>
              <Segmented value={source} onChange={(value) => setSource(value as SourceFilter)} options={SOURCE_OPTIONS} />
            </Form.Item>

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
      ) : !hasResults ? (
        <Empty description="Nothing was received for these filters" />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", opacity: active.isFetching ? 0.6 : 1 }}>
          <Card size="small">
            {applied.type === "stock" ? (
              <Flex wrap gap={32} align="center">
                <Statistic title="Brands" value={grids.length} />
                <Statistic title={applied.granularity === "day" ? "Days with arrivals" : "Months with arrivals"} value={activeColumns} />
                <Statistic title="Sacks received" value={fmtInt(grandTotal)} />
                <Typography.Text type="secondary" style={{ marginLeft: "auto" }}>{applied.subtitle[0]}</Typography.Text>
              </Flex>
            ) : (
              <Flex wrap gap={32} align="center">
                <Statistic title="Suppliers" value={supplierGroups.length} />
                <Statistic title="Lines" value={receivedTotals.lines} />
                <Statistic title="Sacks counted" value={fmtInt(receivedTotals.counted)} />
                <Statistic
                  title="Variance"
                  value={`${receivedTotals.variance > 0 ? "+" : ""}${fmtInt(receivedTotals.variance)}`}
                />
                <Statistic title="Value" value={fmtMoney(receivedTotals.value)} />
                <Typography.Text type="secondary" style={{ marginLeft: "auto" }}>{applied.subtitle[0]}</Typography.Text>
              </Flex>
            )}
          </Card>
          {applied.type === "stock"
            ? grids.map((grid) => (
              <Card key={grid.brand} size="small">
                <TimeframeGrid grid={grid} />
              </Card>
            ))
            : supplierGroups.map((group) => (
              <Card key={group.supplierId} size="small">
                <SupplierReceivingTable group={group} />
              </Card>
            ))}
        </Space>
      )}
    </Space>
  );
}
