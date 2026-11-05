// Shapes report data for display. The screen and the PDF both render from
// these, so they always show the same figures.
//
// Stock summary: one timeframe grid per brand — product rows, a column per
// arrival day (or month, for long periods), row totals and a Total Sacks
// footer. Receiving: received lines grouped per supplier, with subtotals.

import dayjs, { type Dayjs } from "dayjs";

import { fmtTableDate } from "../../../common/utils/util";

import type { InboundArrival, InboundReport, ProductLabel, ReceivingRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct, fmtSize } from "../type-format/format";
import type { PrintSection } from "./print-report";
import type { Translate } from "../../../common/context/language-context";

/** Periods longer than this get a column per month instead of per day. */
const MAX_DAY_COLUMNS = 31;

/** Table dates everywhere in reports: 08/17/2026. */
export const fmtReportDate = fmtTableDate;

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

/** Variety and size under the brand heading; "No size" when there is neither. */
const rowLabel = (p: Pick<ProductLabel, "variety" | "size_kg">, t: Translate) =>
  [p.variety, fmtSize(p.size_kg)].filter(Boolean).join(" ") || t("No size");

function column(key: string, granularity: Granularity): GridColumn {
  const date = dayjs(key);
  return granularity === "day"
    ? { key, top: date.format("ddd"), label: fmtReportDate(key) }
    : { key, top: date.format("YYYY"), label: date.format("MMM") };
}

/**
 * One grid per brand, listing only the sizes that received sacks in the
 * period. A brand with nothing received is left out entirely.
 */
export function buildGrids(report: InboundReport, granularity: Granularity, t: Translate = (text) => text): BrandGrid[] {
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

    const rows = products
      .map((product) => {
        const sacks = sacksByProduct.get(product.id);
        const values = columns.map((c) => sacks?.get(c.key) ?? 0);
        return {
          product,
          label: rowLabel(product, t),
          values,
          total: values.reduce((a, b) => a + b, 0),
        };
      })
      .filter((row) => row.total > 0);
    if (!rows.length) continue;
    const totals = columns.map((_, i) => rows.reduce((n, row) => n + row.values[i], 0));
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    grids.push({ brand, columns, rows, totals, grandTotal });
  }
  return grids;
}

/** Blank for zero inside the grid, like a hand-kept sheet. */
export const cellText = (value: number) => (value ? fmtInt(value) : "");

export function gridPrintSection(grid: BrandGrid, t: Translate = (text) => text): PrintSection {
  return {
    title: `${grid.brand} ${t("Timeframe")}`,
    subtitle: t("Inbound"),
    columns: [
      { label: t("Kind") },
      ...grid.columns.map((c) => ({ top: c.top, label: c.label, align: "right" as const })),
      { label: `${t("Total")}\n${t("Sacks")}`, align: "right" as const },
    ],
    rows: grid.rows.map((row) => ({
      cells: [row.label, ...row.values.map(cellText), fmtInt(row.total)],
    })),
    totals: [t("Total Sacks"), ...grid.totals.map(fmtInt), fmtInt(grid.grandTotal)],
  };
}

// ---- stock summary, grouped per container / truck delivery -----------
// Each container or truck delivery with the brands it brought, in arrival
// order; over a date range, grouped by day too. The screen table and the
// PDF are both built from these rows.

export interface GroupedRow {
  key: string;
  kind: "line" | "subtotal" | "dayTotal";
  /** Set on the first row of each day, over a date range. */
  date: string | null;
  /** Set on the first row of each container / delivery. */
  group: { name: string; detail: string; truck: boolean } | null;
  brand: string;
  product: string;
  sacks: number;
}

export interface GroupedSummary {
  rows: GroupedRow[];
  /** Containers and truck deliveries. */
  arrivals: number;
  days: number;
  grandTotal: number;
}

const groupLabel = (arrival: InboundArrival, t: Translate) => arrival.kind === "LOCAL"
  ? {
    name: `${t("Truck delivery")} · ${arrival.reference || t("No reference")}`,
    detail: arrival.supplier,
    truck: true,
  }
  : {
    name: arrival.container_no || t("No box"),
    detail: [arrival.shipping_company, arrival.reference, arrival.supplier].filter(Boolean).join(" · "),
    truck: false,
  };

/** `byDay` adds a date to each day's first row and a total after busy days. */
export function buildGroupedSummary(arrivals: InboundArrival[], byDay: boolean, t: Translate = (text) => text): GroupedSummary {
  const rows: GroupedRow[] = [];
  const days = [...new Set(arrivals.map((a) => a.date))];
  for (const date of days) {
    const dayArrivals = arrivals.filter((a) => a.date === date);
    dayArrivals.forEach((arrival, arrivalIndex) => {
      arrival.lines.forEach((line, lineIndex) => rows.push({
        key: `${arrival.key}:${line.product_category_id}`,
        kind: "line",
        date: byDay && arrivalIndex === 0 && lineIndex === 0 ? date : null,
        group: lineIndex === 0 ? groupLabel(arrival, t) : null,
        brand: line.brand,
        product: rowLabel(line, t),
        sacks: line.sacks,
      }));
      // A subtotal only helps when the container carried more than one product.
      if (arrival.lines.length > 1) {
        rows.push({ key: `${arrival.key}:subtotal`, kind: "subtotal", date: null, group: null, brand: "", product: t("Subtotal"), sacks: arrival.total });
      }
    });
    // A day total only adds something when the day had several arrivals;
    // with one, its subtotal (or single line) already shows it.
    if (byDay && dayArrivals.length > 1) {
      rows.push({
        key: `${date}:total`,
        kind: "dayTotal",
        date: null,
        group: null,
        brand: "",
        product: `${t("Total for")} ${fmtReportDate(date)}`,
        sacks: dayArrivals.reduce((n, a) => n + a.total, 0),
      });
    }
  }
  return {
    rows,
    arrivals: arrivals.length,
    days: days.length,
    grandTotal: arrivals.reduce((n, a) => n + a.total, 0),
  };
}

export function groupedSummaryPrintSection(summary: GroupedSummary, byDay: boolean, t: Translate = (text) => text): PrintSection {
  return {
    title: t("Stock summary"),
    subtitle: t("Brands received, grouped per container or truck delivery"),
    layout: "list",
    columns: [
      ...(byDay ? [{ label: t("Date") }] : []),
      { label: t("Container / delivery") },
      { label: t("Brand") },
      { label: t("Product") },
      { label: t("Sacks"), align: "right" as const },
    ],
    rows: summary.rows.map((row) => ({
      groupStart: Boolean(row.group) || row.kind === "dayTotal",
      emphasis: row.kind !== "line",
      cells: [
        ...(byDay ? [row.date ? fmtReportDate(row.date) : ""] : []),
        row.group ? `${row.group.name}\n${row.group.detail}` : "",
        row.brand,
        row.product,
        fmtInt(row.sacks),
      ],
    })),
    totals: [...(byDay ? [""] : []), t("Grand Total"), "", "", fmtInt(summary.grandTotal)],
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

export const sourceText = (row: ReceivingRow, t: Translate = (text) => text) =>
  [t(row.source === "SHIPMENT" ? "Shipment" : "Local"), row.reference, row.container_no].filter(Boolean).join(" · ");

const signed = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));

export function receivingPrintSection(group: SupplierGroup, t: Translate = (text) => text): PrintSection {
  return {
    title: group.supplier,
    subtitle: `${group.rows.length} ${t(group.rows.length === 1 ? "line" : "lines")} ${t("received")}`,
    layout: "list",
    columns: [
      { label: t("Date") },
      { label: t("Source") },
      { label: t("Product") },
      { label: t("Declared"), align: "right" },
      { label: t("Counted"), align: "right" },
      { label: t("Variance"), align: "right" },
      { label: t("Price / sack"), align: "right" },
      { label: t("Value"), align: "right" },
    ],
    rows: group.rows.map((r) => ({
      cells: [
        fmtReportDate(r.date),
        sourceText(r, t),
        fmtProduct({ ...r }),
        fmtInt(r.declared_qty),
        fmtInt(r.actual_qty),
        signed(r.variance),
        fmtMoney(r.price_per_sack),
        fmtMoney(r.value),
      ],
    })),
    totals: [t("Subtotal"), "", "", fmtInt(group.declared), fmtInt(group.counted), signed(group.variance), "", fmtMoney(group.value)],
  };
}

export function receivingSummaryPrintSection(groups: SupplierGroup[], t: Translate = (text) => text): PrintSection {
  const rows = groups.flatMap((group) => group.rows);
  const totals = groups.reduce((sum, group) => ({
    declared: sum.declared + group.declared,
    counted: sum.counted + group.counted,
    variance: sum.variance + group.variance,
    value: sum.value + group.value,
  }), { declared: 0, counted: 0, variance: 0, value: 0 });
  return {
    title: t("Receiving detail"),
    subtitle: t("All suppliers and received products in one table"),
    layout: "list",
    columns: [
      { label: t("Supplier") },
      { label: t("Date") },
      { label: t("Source") },
      { label: t("Product") },
      { label: t("Declared"), align: "right" },
      { label: t("Counted"), align: "right" },
      { label: t("Variance"), align: "right" },
      { label: t("Price / sack"), align: "right" },
      { label: t("Value"), align: "right" },
    ],
    rows: rows.map((row) => ({ cells: [
      row.supplier,
      fmtReportDate(row.date),
      sourceText(row, t),
      fmtProduct({ ...row }),
      fmtInt(row.declared_qty),
      fmtInt(row.actual_qty),
      signed(row.variance),
      fmtMoney(row.price_per_sack),
      fmtMoney(row.value),
    ] })),
    totals: [t("Grand Total"), "", "", "", fmtInt(totals.declared), fmtInt(totals.counted), signed(totals.variance), "", fmtMoney(totals.value)],
  };
}
