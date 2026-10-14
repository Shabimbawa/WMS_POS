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
import { FilePdfOutlined, ReloadOutlined, TableOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";

import type { InboundReportParams, ReceivingParams, ReportSource } from "../../../queries/types";
import {
  useInboundReport,
  useProductCategories,
  useReceivingReport,
  useReportShipmentOptions,
  useSuppliers,
} from "../../../queries/useHooks";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import { printReport, type PrintableReport } from "./print-report";
import {
  buildGrids,
  combineGrids,
  fmtReportDate,
  granularityFor,
  summaryGridPrintSection,
  groupBySupplier,
  receivingSummaryPrintSection,
  type Granularity,
} from "./report-grid";
import {
  today,
  toIsoDate,
} from "./report-period";
import { ReceivingSummaryTable, StockSummaryTable } from "./reports-table";
import { useLanguage } from "../../../common/context/language-context";

const { RangePicker } = DatePicker;

type ReportType = "stock" | "receiving";
type SourceFilter = ReportSource;

const REPORT_OPTIONS: { label: string; value: ReportType; description: string }[] = [
  {
    label: "Stock summary",
    value: "stock",
    description:
      "See how many sacks were received in the selected dates, grouped by brand and product size. Use this for stock trends and receiving totals.",
  },
  {
    label: "Receiving detail",
    value: "receiving",
    description: "Audit every received product line by supplier, including declared quantity, counted quantity, variance, price, and value.",
  },
];

const SOURCE_OPTIONS = [
  { label: "All inbound", value: "ALL" },
  { label: "International", value: "INTERNATIONAL" },
  { label: "National", value: "NATIONAL" },
  { label: "Local", value: "LOCAL" },
];

const sourceLine = (source: SourceFilter, t: (text: string) => string) =>
  `${t("Inbound route")}: ${t(SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? "All inbound")}`;

/** What the last Generate press asked for; the tables show exactly this. */
type Applied =
  | { type: "stock"; params: InboundReportParams; granularity: Granularity; keepEmpty: boolean; subtitle: string[] }
  | { type: "receiving"; params: ReceivingParams; subtitle: string[] };

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const [reportType, setReportType] = useState<ReportType>("stock");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [reportRange, setReportRange] = useState<[Dayjs, Dayjs]>(() => [today().startOf("month"), today()]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [shipmentIds, setShipmentIds] = useState<string[]>([]);
  const [applied, setApplied] = useState<Applied | null>(null);

  const { data: products, isLoading: loadingProducts } = useProductCategories();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();

  const reportOptionParams = useMemo(
    () => ({
      dateFrom: toIsoDate(reportRange[0]),
      dateTo: toIsoDate(reportRange[1]),
      source,
      supplierIds: supplierIds.length ? supplierIds.join(",") : undefined,
    }),
    [reportRange, source, supplierIds],
  );
  const { data: shipmentOptionsData, isLoading: loadingShipments } =
    useReportShipmentOptions(reportOptionParams);

  const productOptions = useMemo(
    () => (products ?? []).map((p) => ({ label: fmtProduct(p), value: p.id })),
    [products],
  );
  const supplierOptions = useMemo(
    () =>
      (suppliers ?? [])
        .filter((supplier) => source === "ALL" || source === "SHIPMENT" || supplier.kind === source)
        .map((s) => ({
        label: `${s.name} (${t(s.kind === "LOCAL" ? "Local" : s.kind === "NATIONAL" ? "National" : "International")})`,
        value: s.id,
      })),
    [source, suppliers, t],
  );
  const shipmentOptions = useMemo(
    () =>
      (shipmentOptionsData ?? []).map((shipment) => ({
        value: shipment.id,
        label: [
          shipment.reference || t("No reference"),
          shipment.supplier,
          fmtReportDate(shipment.date_list_received),
        ].join(" · "),
      })),
    [shipmentOptionsData, t],
  );

  const generate = () => {
    const [from, to] = reportRange;
    const dateLine = `${t("Date range")}: ${fmtReportDate(toIsoDate(from))} – ${fmtReportDate(toIsoDate(to))}`;
    if (reportType === "stock") {
      const subtitle = [
        dateLine,
        sourceLine(source, t),
        `${t("Suppliers")}: ${supplierIds.length ? supplierIds.map((id) => suppliers?.find((supplier) => supplier.id === id)?.name ?? id).join(", ") : t("All")}`,
        shipmentIds.length
          ? `${t("Shipments")}: ${shipmentIds.map((id) => shipmentOptions.find((option) => option.value === id)?.label ?? id).join(", ")}`
          : null,
        productIds.length
          ? `${t("Products")}: ${productIds.map((id) => productOptions.find((o) => o.value === id)?.label ?? id).join(", ")}`
          : `${t("Products")}: ${t("All")}`,
      ].filter((line): line is string => Boolean(line));
      setApplied({
        type: "stock",
        params: {
          dateFrom: toIsoDate(from),
          dateTo: toIsoDate(to),
          productIds: productIds.length ? productIds.join(",") : undefined,
          supplierIds: supplierIds.length ? supplierIds.join(",") : undefined,
          shipmentIds: shipmentIds.length ? shipmentIds.join(",") : undefined,
          source,
        },
        granularity: granularityFor(reportRange),
        keepEmpty: productIds.length > 0,
        subtitle,
      });
    } else {
      const subtitle = [
        dateLine,
        sourceLine(source, t),
        `${t("Suppliers")}: ${supplierIds.length ? supplierIds.map((id) => suppliers?.find((supplier) => supplier.id === id)?.name ?? id).join(", ") : t("All")}`,
        shipmentIds.length
          ? `${t("Shipments")}: ${shipmentIds.map((id) => shipmentOptions.find((option) => option.value === id)?.label ?? id).join(", ")}`
          : null,
        `${t("Products")}: ${productIds.length ? productIds.map((id) => productOptions.find((option) => option.value === id)?.label ?? id).join(", ") : t("All")}`,
      ].filter((line): line is string => Boolean(line));
      setApplied({
        type: "receiving",
        params: {
          dateFrom: toIsoDate(from),
          dateTo: toIsoDate(to),
          source,
          supplierIds: supplierIds.length ? supplierIds.join(",") : undefined,
          shipmentIds: shipmentIds.length ? shipmentIds.join(",") : undefined,
          productIds: productIds.length ? productIds.join(",") : undefined,
        },
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
  const summaryGrid = useMemo(() => combineGrids(grids), [grids]);
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
          title: t("Stock Summary (Inbound)"),
          subtitle: applied.subtitle,
          sections: [summaryGridPrintSection(summaryGrid, t)],
          pagePerSection: true,
          language,
        }
        : {
          title: t("Receiving Report"),
          subtitle: applied.subtitle,
          sections: [receivingSummaryPrintSection(supplierGroups, t)],
          language,
        };
    printReport(report);
  };

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

  const resetFilters = () => {
    setSource("ALL");
    setSupplierIds([]);
    setShipmentIds([]);
    setProductIds([]);
    setReportRange([today().startOf("month"), today()]);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>{t("Generate Reports")}</Typography.Title>
      <Typography.Text type="secondary">
        {t('Build stock, supplier, or movement reports for a selected period and set of filters. Generate the results before exporting them to print or PDF; pending and cancelled containers and voided deliveries are excluded from received-stock totals.')}
      </Typography.Text>

      <Alert
        type="info"
        showIcon
        message={t("How to generate a report")}
        description={t("Choose a report type and date range. The remaining filters are optional—leave them empty to include everything, then select Generate report.")}
      />

      <Card
        size="small"
        title={t("Report builder")}
        extra={
          <Button type="text" icon={<ReloadOutlined />} onClick={resetFilters}>
            {t("Reset filters")}
          </Button>
        }
      >
        <Form layout="vertical">
          <Form.Item label={t("Report type")} style={{ marginBottom: 18 }} extra={t(REPORT_OPTIONS.find((o) => o.value === reportType)?.description ?? "")}>
            <Segmented
              block
              value={reportType}
              onChange={(value) => {
                setReportType(value as ReportType);
                setApplied(null);
              }}
              options={REPORT_OPTIONS.map(({ label, value }) => ({ label: t(label), value }))}
            />
          </Form.Item>

          <div className="report-filter-grid">
            {reportType === "stock" ? (
              <>
                <Form.Item
                  label={t("Date range")}
                  style={{ marginBottom: 0 }}
                  extra={t("Only stock received inside these dates is included.")}
                >
                  <RangePicker
                    value={reportRange}
                    allowClear={false}
                    format="MM/DD/YYYY"
                    onChange={(value) => value?.[0] && value[1] && setReportRange([value[0], value[1]])}
                  />
                </Form.Item>
                <Form.Item label={t("Products")} extra={t("Optional · choose one or more products.")} style={{ marginBottom: 0, flex: 1, minWidth: 260 }}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    placeholder={t("All products")}
                    loading={loadingProducts}
                    value={productIds}
                    onChange={setProductIds}
                    options={productOptions}
                  />
                </Form.Item>
                <Form.Item label={t("Suppliers")} extra={t("Optional · choose one or more suppliers.")} style={{ marginBottom: 0, flex: 1, minWidth: 260 }}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    placeholder={t("All suppliers")}
                    loading={loadingSuppliers}
                    value={supplierIds}
                    onChange={(values) => {
                      setSupplierIds(values);
                      setShipmentIds([]);
                    }}
                    options={supplierOptions}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  label={t("Date range")}
                  style={{ marginBottom: 0 }}
                  extra={t("Only stock received inside these dates is included.")}
                >
                  <RangePicker
                    value={reportRange}
                    allowClear={false}
                    format="MM/DD/YYYY"
                    onChange={(value) => value?.[0] && value[1] && setReportRange([value[0], value[1]])}
                  />
                </Form.Item>
                <Form.Item label={t("Suppliers")} extra={t("Optional · choose one or more suppliers.")} style={{ marginBottom: 0, minWidth: 280, flex: 1 }}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    placeholder={t("All suppliers")}
                    loading={loadingSuppliers}
                    value={supplierIds}
                    onChange={(values) => {
                      setSupplierIds(values);
                      setShipmentIds([]);
                    }}
                    options={supplierOptions}
                  />
                </Form.Item>
                <Form.Item label={t("Products")} extra={t("Optional · choose one or more products.")} style={{ marginBottom: 0, minWidth: 260, flex: 1 }}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    maxTagCount="responsive"
                    placeholder={t("All products")}
                    loading={loadingProducts}
                    value={productIds}
                    onChange={setProductIds}
                    options={productOptions}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item label={t("Inbound route")} extra={t("Choose where the received stock came from.")} style={{ marginBottom: 0, minWidth: 220 }}>
              <Select
                value={source}
                onChange={(value) => {
                  setSource(value as SourceFilter);
                  setSupplierIds([]);
                  setShipmentIds([]);
                }}
                options={SOURCE_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
              />
            </Form.Item>

            <Form.Item
              label={t("Shipments")}
              style={{ marginBottom: 0, minWidth: 300, flex: 1 }}
              extra={t(source === "LOCAL" ? "Shipment filtering is unavailable for local deliveries." : "Only completed shipments in the selected period are listed.")}
            >
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                placeholder={t("All completed shipments")}
                loading={loadingShipments}
                disabled={source === "LOCAL"}
                value={shipmentIds}
                onChange={setShipmentIds}
                options={shipmentOptions}
              />
            </Form.Item>

            <div className="report-actions">
              <Button size="large" icon={<FilePdfOutlined />} disabled={!hasResults || active.isFetching} onClick={exportPdf}>
                {t("Export PDF / Print")}
              </Button>
              <Button className="report-generate-button" type="primary" size="large" icon={<TableOutlined />} onClick={generate} loading={active.isFetching}>
                {t("Generate report")}
              </Button>
            </div>
          </div>
        </Form>
      </Card>

      {!applied ? (
        <Empty description={t("Choose dates and optional filters, then select Generate report.")} />
      ) : active.isError ? (
        <Alert type="error" showIcon message={t("Could not generate report")} description={t((active.error as Error).message)} />
      ) : active.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !hasResults ? (
        <Empty description={t("Nothing was received for these filters")} />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%", opacity: active.isFetching ? 0.6 : 1 }}>
          <Card size="small">
            {applied.type === "stock" ? (
              <Flex wrap gap={32} align="center">
                <Statistic title={t("Brands")} value={grids.length} />
                <Statistic title={t(applied.granularity === "day" ? "Days with arrivals" : "Months with arrivals")} value={activeColumns} />
                <Statistic title={t("Sacks received")} value={fmtInt(grandTotal)} />
                <Typography.Text type="secondary" style={{ marginLeft: "auto" }}>{applied.subtitle[0]}</Typography.Text>
              </Flex>
            ) : (
              <Flex wrap gap={32} align="center">
                <Statistic title={t("Suppliers")} value={supplierGroups.length} />
                <Statistic title={t("Lines")} value={receivedTotals.lines} />
                <Statistic title={t("Sacks counted")} value={fmtInt(receivedTotals.counted)} />
                <Statistic
                  title={t("Variance")}
                  value={`${receivedTotals.variance > 0 ? "+" : ""}${fmtInt(receivedTotals.variance)}`}
                />
                <Statistic title={t("Value")} value={fmtMoney(receivedTotals.value)} />
                <Typography.Text type="secondary" style={{ marginLeft: "auto" }}>{applied.subtitle[0]}</Typography.Text>
              </Flex>
            )}
          </Card>
          {applied.type === "stock"
            ? <Card size="small"><StockSummaryTable grid={summaryGrid} /></Card>
            : <Card size="small"><ReceivingSummaryTable groups={supplierGroups} /></Card>}
        </Space>
      )}
    </Space>
  );
}
