import { useMemo } from "react";
import { Flex, Tag, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { ReceivingRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import { cellText, fmtReportDate, type BrandGrid, type SummaryGrid, type SupplierGroup } from "./report-grid";
import { useLanguage, type Translate } from "../../../common/context/language-context";

// Plain text color throughout: black on the light theme, like the sheets.
const headerStyle = { fontWeight: 700, fontSize: 15 };

const twoLineHeader = (top: string, label: string) => (
  <div style={{ textAlign: "center", lineHeight: 1.25 }}>
    <div style={{ fontWeight: 400, fontSize: 12 }}>{top}</div>
    <div style={{ ...headerStyle, whiteSpace: "nowrap" }}>{label}</div>
  </div>
);

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--ant-color-border, #d9d9d9)", paddingBottom: 10, marginBottom: 8 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>{title}</Typography.Title>
      <Typography.Text type="secondary">{subtitle}</Typography.Text>
    </div>
  );
}

// ---- stock summary --------------------------------------------------

/** A product row, or the Total Sacks footer row. */
type GridTableRow = {
  key: string;
  label: string;
  values: number[];
  total: number;
  isTotal: boolean;
};

/**
 * One brand's inbound timeframe: product rows, a column per arrival day
 * (or month), the row's total on the right and a Total Sacks row at the
 * bottom.
 */
export function TimeframeGrid({ grid }: { grid: BrandGrid }) {
  const { t } = useLanguage();
  const columns = useMemo<ColumnDef<GridTableRow, any>[]>(() => [
    {
      id: "label",
      header: () => <span style={headerStyle}>{t("Kind")}</span>,
      accessorFn: (r) => r.label,
      size: 160,
      meta: { fixed: "left" },
      cell: (c) => (
        <span style={{ fontWeight: c.row.original.isTotal ? 700 : 400 }}>
          {c.getValue<string>()}
        </span>
      ),
    },
    ...grid.columns.map<ColumnDef<GridTableRow, any>>((col, i) => ({
      id: col.key,
      header: () => twoLineHeader(col.top, col.label),
      accessorFn: (r) => r.values[i],
      size: 110,
      cell: (c) => (
        <div style={{ textAlign: "center", fontWeight: c.row.original.isTotal ? 700 : undefined }}>
          {c.row.original.isTotal ? fmtInt(c.getValue<number>()) : cellText(c.getValue<number>())}
        </div>
      ),
    })),
    // No width: takes the leftover space, so the days pack left and the
    // total sits at the right edge, as on the printed sheet.
    { id: "spacer", header: "", accessorFn: () => null, cell: () => null },
    {
      id: "total",
      header: () => <div style={{ ...headerStyle, textAlign: "right", lineHeight: 1.25 }}>{t("Total")}<br />{t("Sacks")}</div>,
      accessorFn: (r) => r.total,
      size: 110,
      meta: { fixed: "right" },
      cell: (c) => (
        <div style={{ textAlign: "right", fontWeight: c.row.original.isTotal ? 700 : 400 }}>
          {fmtInt(c.getValue<number>())}
        </div>
      ),
    },
  ], [grid, t]);

  const data = useMemo<GridTableRow[]>(() => [
    ...grid.rows.map((row) => ({
      key: row.product.id,
      label: row.label,
      values: row.values,
      total: row.total,
      isTotal: false,
    })),
    { key: "total", label: t("Total Sacks"), values: grid.totals, total: grid.grandTotal, isTotal: true },
  ], [grid, t]);

  return (
    <div>
      <SectionTitle title={`${grid.brand} ${t("Timeframe")}`} subtitle={t("Inbound")} />
      {grid.columns.length ? (
        <DataTable data={data} columns={columns} />
      ) : (
        <Flex justify="center" style={{ padding: 16 }}>
          <Typography.Text type="secondary">{t("Nothing received in this period")}</Typography.Text>
        </Flex>
      )}
    </div>
  );
}

type SummaryTableRow = {
  key: string;
  brand: string;
  product: string;
  total: number;
  isTotal: boolean;
};

export function StockSummaryTable({ grid }: { grid: SummaryGrid }) {
  const { t } = useLanguage();
  const columns = useMemo<ColumnDef<SummaryTableRow, any>[]>(() => [
    { id: "brand", header: t("Brand"), accessorFn: (row) => row.brand, size: 180, meta: { fixed: "left" }, cell: (cell) => <strong>{cell.getValue<string>()}</strong> },
    { id: "product", header: t("Product"), accessorFn: (row) => row.product, size: 170 },
    { id: "total", header: () => <div style={{ ...headerStyle, textAlign: "right" }}>{t("Total")}<br />{t("Sacks")}</div>, accessorFn: (row) => row.total, size: 110, meta: { fixed: "right" }, cell: (cell) => <div style={{ textAlign: "right", fontWeight: 700 }}>{fmtInt(cell.getValue<number>())}</div> },
  ], [grid, t]);
  const data = useMemo<SummaryTableRow[]>(() => [
    ...grid.rows.map((row) => ({ key: row.product.id, brand: row.brand, product: row.label, total: row.total, isTotal: false })),
    { key: "grand-total", brand: t("Grand Total"), product: "", total: grid.grandTotal, isTotal: true },
  ], [grid, t]);
  return (
    <div>
      <SectionTitle title={t("Stock summary")} subtitle={t("All brands and products in one table")} />
      {grid.columns.length ? <DataTable data={data} columns={columns} /> : <Flex justify="center" style={{ padding: 16 }}><Typography.Text type="secondary">{t("Nothing received in this period")}</Typography.Text></Flex>}
    </div>
  );
}

// ---- receiving ------------------------------------------------------

/** A received line, or the supplier's subtotal row. */
type ReceivingTableRow = { line: ReceivingRow | null; group: SupplierGroup };

const strongIfTotal = (row: ReceivingTableRow, text: string) =>
  row.line ? text : <strong>{text}</strong>;

const signed = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));

const receivingColumns = (t: Translate): ColumnDef<ReceivingTableRow, any>[] => [
  {
    id: "date",
    header: "Date",
    accessorFn: (r) => r.line?.date ?? "",
    size: 110,
    meta: { fixed: "left" },
    cell: (c) =>
      c.row.original.line ? fmtReportDate(c.row.original.line.date) : <strong>{t("Subtotal")}</strong>,
  },
  {
    id: "source",
    header: "Source",
    accessorFn: (r) => r.line?.source ?? "",
    size: 260,
    cell: (c) => {
      const line = c.row.original.line;
      if (!line) return null;
      return (
        <div style={{ whiteSpace: "nowrap" }}>
          <Tag color={line.source === "SHIPMENT" ? "blue" : "green"} style={{ marginInlineEnd: 6 }}>
            {t(line.source === "SHIPMENT" ? "Shipment" : "Local")}
          </Tag>
          {line.reference || <Typography.Text type="secondary">{t("No reference")}</Typography.Text>}
          {line.container_no && (
            <Typography.Text type="secondary" style={{ fontFamily: "monospace", fontSize: 12 }}> · {line.container_no}</Typography.Text>
          )}
        </div>
      );
    },
  },
  {
    id: "product",
    header: "Product",
    accessorFn: (r) => (r.line ? fmtProduct({ ...r.line }) : ""),
    size: 220,
  },
  {
    id: "declared",
    header: "Declared",
    accessorFn: (r) => r.line?.declared_qty ?? r.group.declared,
    size: 100,
    cell: (c) => <div style={{ textAlign: "right" }}>{strongIfTotal(c.row.original, fmtInt(c.getValue<number>()))}</div>,
  },
  {
    id: "counted",
    header: "Counted",
    accessorFn: (r) => r.line?.actual_qty ?? r.group.counted,
    size: 100,
    cell: (c) => <div style={{ textAlign: "right" }}>{strongIfTotal(c.row.original, fmtInt(c.getValue<number>()))}</div>,
  },
  {
    id: "variance",
    header: "Variance",
    accessorFn: (r) => r.line?.variance ?? r.group.variance,
    size: 100,
    cell: (c) => {
      const v = c.getValue<number>();
      return (
        <div
          style={{
            textAlign: "right",
            color: v < 0 ? "var(--ant-color-error, #ff4d4f)" : v > 0 ? "var(--ant-color-warning, #faad14)" : undefined,
            opacity: v === 0 ? 0.45 : 1,
          }}
        >
          {strongIfTotal(c.row.original, signed(v))}
        </div>
      );
    },
  },
  {
    id: "price",
    header: "Price / sack",
    accessorFn: (r) => r.line?.price_per_sack ?? null,
    size: 120,
    cell: (c) => <div style={{ textAlign: "right" }}>{c.row.original.line ? fmtMoney(c.getValue<number | null>()) : null}</div>,
  },
  {
    id: "value",
    header: "Value",
    accessorFn: (r) => (r.line ? r.line.value : r.group.value),
    size: 140,
    meta: { fixed: "right" },
    cell: (c) => <div style={{ textAlign: "right" }}><strong>{fmtMoney(c.getValue<number | null>())}</strong></div>,
  },
];

/** One supplier's received lines, closed by a subtotal row. */
export function SupplierReceivingTable({ group }: { group: SupplierGroup }) {
  const { t } = useLanguage();
  const data = useMemo<ReceivingTableRow[]>(
    () => [...group.rows.map((line) => ({ line, group })), { line: null, group }],
    [group],
  );
  return (
    <div>
      <SectionTitle
        title={group.supplier}
        subtitle={`${group.rows.length} ${t(group.rows.length === 1 ? "line" : "lines")} ${t("received")}`}
      />
      <DataTable data={data} columns={receivingColumns(t)} />
    </div>
  );
}

type ReceivingSummaryRow = {
  line: ReceivingRow | null;
  totals: { declared: number; counted: number; variance: number; value: number };
};

export function ReceivingSummaryTable({ groups }: { groups: SupplierGroup[] }) {
  const { t } = useLanguage();
  const totals = useMemo(() => groups.reduce((sum, group) => ({
    declared: sum.declared + group.declared,
    counted: sum.counted + group.counted,
    variance: sum.variance + group.variance,
    value: sum.value + group.value,
  }), { declared: 0, counted: 0, variance: 0, value: 0 }), [groups]);
  const data = useMemo<ReceivingSummaryRow[]>(() => [
    ...groups.flatMap((group) => group.rows.map((line) => ({ line, totals }))),
    { line: null, totals },
  ], [groups, totals]);
  const columns = useMemo<ColumnDef<ReceivingSummaryRow, any>[]>(() => [
    { id: "supplier", header: t("Supplier"), accessorFn: (row) => row.line?.supplier ?? t("Grand Total"), size: 190, meta: { fixed: "left" }, cell: (cell) => <strong>{cell.getValue<string>()}</strong> },
    { id: "date", header: t("Date"), accessorFn: (row) => row.line?.date ?? "", size: 110, cell: (cell) => cell.row.original.line ? fmtReportDate(cell.getValue<string>()) : null },
    { id: "source", header: t("Source"), accessorFn: (row) => row.line?.source ?? "", size: 240, cell: (cell) => {
      const line = cell.row.original.line;
      if (!line) return null;
      return <><Tag color={line.source === "SHIPMENT" ? "blue" : "green"}>{t(line.source === "SHIPMENT" ? "Shipment" : "Local")}</Tag>{line.reference || t("No reference")}{line.container_no ? ` · ${line.container_no}` : ""}</>;
    } },
    { id: "product", header: t("Product"), accessorFn: (row) => row.line ? fmtProduct({ ...row.line }) : "", size: 190 },
    { id: "declared", header: t("Declared"), accessorFn: (row) => row.line?.declared_qty ?? row.totals.declared, size: 95, cell: (cell) => <div style={{ textAlign: "right", fontWeight: cell.row.original.line ? 400 : 700 }}>{fmtInt(cell.getValue<number>())}</div> },
    { id: "counted", header: t("Counted"), accessorFn: (row) => row.line?.actual_qty ?? row.totals.counted, size: 95, cell: (cell) => <div style={{ textAlign: "right", fontWeight: cell.row.original.line ? 400 : 700 }}>{fmtInt(cell.getValue<number>())}</div> },
    { id: "variance", header: t("Variance"), accessorFn: (row) => row.line?.variance ?? row.totals.variance, size: 95, cell: (cell) => <div style={{ textAlign: "right", fontWeight: cell.row.original.line ? 400 : 700 }}>{signed(cell.getValue<number>())}</div> },
    { id: "price", header: t("Price / sack"), accessorFn: (row) => row.line?.price_per_sack ?? null, size: 115, cell: (cell) => <div style={{ textAlign: "right" }}>{cell.row.original.line ? fmtMoney(cell.getValue<number | null>()) : null}</div> },
    { id: "value", header: t("Value"), accessorFn: (row) => row.line ? row.line.value : row.totals.value, size: 130, meta: { fixed: "right" }, cell: (cell) => <div style={{ textAlign: "right" }}><strong>{fmtMoney(cell.getValue<number | null>())}</strong></div> },
  ], [t]);
  return <div><SectionTitle title={t("Receiving detail")} subtitle={t("All suppliers and received products in one table")} /><DataTable data={data} columns={columns} /></div>;
}
