// Shapes report data for display. The screen and the PDF both render from
// these, so they always show the same figures.
//
// Stock summary: one timeframe grid per brand — product rows, a column per
// arrival day (or month, for long periods), row totals and a Total Sacks
// footer. Receiving: received lines grouped per supplier, with subtotals.

import dayjs, { type Dayjs } from "dayjs";

import type { InboundReport, ProductLabel, ReceivingRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import type { PrintSection } from "./print-report";

/** Periods longer than this get a column per month instead of per day. */
const MAX_DAY_COLUMNS = 31;

/** Table dates everywhere in reports: 08/17/2026. */
export const fmtReportDate = (date: string) => dayjs(date).format("MM/DD/YYYY");

/**
 * Row label colors, one per variety within a brand (Blue, Orange, …).
 * Mid-tones, so they read on light and dark themes and on paper.
 */
const VARIETY_COLORS = ["#3b82f6", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444"];

// ---- stock summary (inbound grid) ---------------------------------

export interface GridColumn {
  key: string;
  /** Small line above: weekday, or year for month columns. */
  top: string;
  /** Main line: "08/17/2026", or "Sep". */
  label: string;
}

export interface GridRow {
  product: ProductLabel;
  /** "Blue 50kg", or "25kg" for a brand without varieties. */
  label: string;
  color: string;
  /** One per column, in column order. */
  values: number[];
  total: number;
}

export interface BrandGrid {
  brand: string;
  columns: GridColumn[];
  rows: GridRow[];
  /** Column totals, in column order. */
  totals: number[];
  grandTotal: number;
}

export type Granularity = "day" | "month";

export function granularityFor([from, to]: [Dayjs, Dayjs]): Granularity {
  return to.diff(from, "day") + 1 > MAX_DAY_COLUMNS ? "month" : "day";
}

const rowLabel = (p: ProductLabel) => [p.variety, `${p.size_kg}kg`].filter(Boolean).join(" ");

function column(key: string, granularity: Granularity): GridColumn {
  const date = dayjs(key);
  return granularity === "day"
    ? { key, top: date.format("ddd"), label: fmtReportDate(key) }
    : { key, top: date.format("YYYY"), label: date.format("MMM") };
}

/**
 * `keepEmpty` keeps brands with no sacks, for when the user picked those
 * products on purpose; otherwise only brands with figures are shown.
 */
export function buildGrids(report: InboundReport, granularity: Granularity, keepEmpty: boolean): BrandGrid[] {
  const bucket = (date: string) => (granularity === "day" ? date : `${date.slice(0, 7)}-01`);
  const sacksByProduct = new Map<string, Map<string, number>>();
  for (const cell of report.cells) {
    const byKey = sacksByProduct.get(cell.product_category_id) ?? new Map<string, number>();
    const key = bucket(cell.date);
    byKey.set(key, (byKey.get(key) ?? 0) + cell.sacks);
    sacksByProduct.set(cell.product_category_id, byKey);
  }

  const byBrand = new Map<string, ProductLabel[]>();
  for (const product of report.products) {
    byBrand.set(product.brand, [...(byBrand.get(product.brand) ?? []), product]);
  }

  const grids: BrandGrid[] = [];
  for (const [brand, products] of byBrand) {
    const keys = new Set<string>();
    for (const p of products) for (const key of sacksByProduct.get(p.id)?.keys() ?? []) keys.add(key);
    const columns = [...keys].sort().map((key) => column(key, granularity));

    const varieties = [...new Set(products.map((p) => p.variety ?? ""))];
    const rows = products.map((product) => {
      const sacks = sacksByProduct.get(product.id);
      const values = columns.map((c) => sacks?.get(c.key) ?? 0);
      return {
        product,
        label: rowLabel(product),
        color: VARIETY_COLORS[varieties.indexOf(product.variety ?? "") % VARIETY_COLORS.length],
        values,
        total: values.reduce((a, b) => a + b, 0),
      };
    });
    const totals = columns.map((_, i) => rows.reduce((n, row) => n + row.values[i], 0));
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    if (grandTotal > 0 || keepEmpty) grids.push({ brand, columns, rows, totals, grandTotal });
  }
  return grids;
}

/** Blank for zero inside the grid, like a hand-kept sheet. */
export const cellText = (value: number) => (value ? fmtInt(value) : "");

export function gridPrintSection(grid: BrandGrid): PrintSection {
  return {
    title: `${grid.brand} Timeframe`,
    subtitle: "Inbound",
    columns: [
      { label: "Kind" },
      ...grid.columns.map((c) => ({ top: c.top, label: c.label, align: "right" as const })),
      { label: "Total\nSacks", align: "right" as const },
    ],
    rows: grid.rows.map((row) => ({
      color: row.color,
      cells: [row.label, ...row.values.map(cellText), fmtInt(row.total)],
    })),
    totals: ["Total Sacks", ...grid.totals.map(fmtInt), fmtInt(grid.grandTotal)],
  };
}

// ---- receiving (per supplier) ---------------------------------------

export interface SupplierGroup {
  supplierId: string;
  supplier: string;
  rows: ReceivingRow[];
  declared: number;
  counted: number;
  variance: number;
  value: number;
}

/** Rows arrive sorted by supplier, so grouping keeps that order. */
export function groupBySupplier(rows: ReceivingRow[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const row of rows) {
    const group = groups.get(row.supplier_id) ?? {
      supplierId: row.supplier_id,
      supplier: row.supplier,
      rows: [],
      declared: 0,
      counted: 0,
      variance: 0,
      value: 0,
    };
    group.rows.push(row);
    group.declared += row.declared_qty;
    group.counted += row.actual_qty;
    group.variance += row.variance;
    group.value += row.value ?? 0;
    groups.set(row.supplier_id, group);
  }
  return [...groups.values()];
}

export const sourceText = (row: ReceivingRow) =>
  [row.source === "SHIPMENT" ? "Shipment" : "Local", row.reference, row.container_no].filter(Boolean).join(" · ");

const signed = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));

export function receivingPrintSection(group: SupplierGroup): PrintSection {
  return {
    title: group.supplier,
    subtitle: `${group.rows.length} ${group.rows.length === 1 ? "line" : "lines"} received`,
    layout: "list",
    columns: [
      { label: "Date" },
      { label: "Source" },
      { label: "Product" },
      { label: "Declared", align: "right" },
      { label: "Counted", align: "right" },
      { label: "Variance", align: "right" },
      { label: "Price / sack", align: "right" },
      { label: "Value", align: "right" },
    ],
    rows: group.rows.map((r) => ({
      cells: [
        fmtReportDate(r.date),
        sourceText(r),
        fmtProduct({ ...r }),
        fmtInt(r.declared_qty),
        fmtInt(r.actual_qty),
        signed(r.variance),
        fmtMoney(r.price_per_sack),
        fmtMoney(r.value),
      ],
    })),
    totals: ["Subtotal", "", "", fmtInt(group.declared), fmtInt(group.counted), signed(group.variance), "", fmtMoney(group.value)],
  };
}
