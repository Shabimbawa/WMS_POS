// Turns a daily report into the timeframe grids: one block per brand,
// product rows, one column per day (or month, for long periods) that had
// any sacks, row totals and a Total Sacks footer. The screen and the PDF
// both render from this, so they always show the same figures.

import dayjs, { type Dayjs } from "dayjs";

import type { DailyReport, DailyReportKind, ProductLabel } from "../../../queries/types";
import { fmtInt } from "../type-format/format";
import type { PrintSection } from "./print-report";

/** Periods longer than this get a column per month instead of per day. */
const MAX_DAY_COLUMNS = 31;

export const REPORT_KIND_LABEL: Record<DailyReportKind, string> = {
  purchase: "Purchase Order",
  sales: "Sales",
};

/**
 * Row label colors, one per variety within a brand (Blue, Orange, …).
 * Mid-tones, so they read on light and dark themes and on paper.
 */
const VARIETY_COLORS = ["#3b82f6", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444"];

export interface GridColumn {
  key: string;
  /** Small line above: weekday, or year for month columns. */
  top: string;
  /** Main line: "Aug 17", or "Sep". */
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
    ? { key, top: date.format("ddd"), label: date.format("MMM D") }
    : { key, top: date.format("YYYY"), label: date.format("MMM") };
}

/**
 * `keepEmpty` keeps brands with no sacks, for when the user picked those
 * products on purpose; otherwise only brands with figures are shown.
 */
export function buildGrids(report: DailyReport, granularity: Granularity, keepEmpty: boolean): BrandGrid[] {
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

export function gridPrintSection(grid: BrandGrid, kind: DailyReportKind): PrintSection {
  return {
    title: `${grid.brand} Timeframe`,
    subtitle: REPORT_KIND_LABEL[kind],
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
