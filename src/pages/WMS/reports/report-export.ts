// Totals and printable versions of the two reports. Kept beside the
// tables so the screen and the PDF show the same figures.

import dayjs from "dayjs";

import type { ReceivingRow, StockSummaryRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct, STATUS_LABEL } from "../type-format/format";
import type { PrintableReport } from "./print-report";

export const productLabel = (row: Pick<StockSummaryRow, "product_category_id" | "brand" | "variety" | "code" | "size_kg">) =>
  fmtProduct({ ...row });

const signed = (v: number) => (v > 0 ? `+${fmtInt(v)}` : fmtInt(v));
const sum = <T,>(rows: T[], pick: (row: T) => number | null) =>
  rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

export function stockSummaryTotals(rows: StockSummaryRow[]) {
  return {
    opening: sum(rows, (r) => r.opening),
    received_shipments: sum(rows, (r) => r.received_shipments),
    received_local: sum(rows, (r) => r.received_local),
    sold: sum(rows, (r) => r.sold),
    adjustments: sum(rows, (r) => r.adjustments),
    closing: sum(rows, (r) => r.closing),
  };
}

export function receivingTotals(rows: ReceivingRow[]) {
  return {
    lines: rows.length,
    declared: sum(rows, (r) => r.declared_qty),
    counted: sum(rows, (r) => r.actual_qty),
    variance: sum(rows, (r) => r.variance),
    value: sum(rows, (r) => r.value),
    /** Lines still waiting on an unload count. */
    pending: rows.filter((r) => r.actual_qty === null).length,
  };
}

export function stockSummaryPrintable(rows: StockSummaryRow[], subtitle: string[]): PrintableReport {
  const t = stockSummaryTotals(rows);
  return {
    title: "Stock Summary Report",
    subtitle,
    columns: [
      { header: "Product" },
      { header: "Opening", align: "right" },
      { header: "From shipments", align: "right" },
      { header: "Local deliveries", align: "right" },
      { header: "Sold", align: "right" },
      { header: "Adjustments", align: "right" },
      { header: "Closing", align: "right" },
    ],
    rows: rows.map((r) => [
      productLabel(r),
      fmtInt(r.opening),
      signed(r.received_shipments),
      signed(r.received_local),
      r.sold ? `−${fmtInt(r.sold)}` : "0",
      signed(r.adjustments),
      fmtInt(r.closing),
    ]),
    totals: [
      "Total (sacks)",
      fmtInt(t.opening),
      signed(t.received_shipments),
      signed(t.received_local),
      t.sold ? `−${fmtInt(t.sold)}` : "0",
      signed(t.adjustments),
      fmtInt(t.closing),
    ],
  };
}

export function receivingPrintable(rows: ReceivingRow[], subtitle: string[]): PrintableReport {
  const t = receivingTotals(rows);
  return {
    title: "Receiving Report",
    subtitle,
    columns: [
      { header: "Date" },
      { header: "Source" },
      { header: "Supplier" },
      { header: "Status" },
      { header: "Product" },
      { header: "Declared", align: "right" },
      { header: "Counted", align: "right" },
      { header: "Variance", align: "right" },
      { header: "Price / sack", align: "right" },
      { header: "Value", align: "right" },
    ],
    rows: rows.map((r) => [
      dayjs(r.date).format("MMM D, YYYY"),
      [r.source === "SHIPMENT" ? "Shipment" : "Local", r.reference, r.container_no].filter(Boolean).join(" · "),
      r.supplier,
      r.status ? STATUS_LABEL[r.status] : "Received",
      productLabel(r),
      fmtInt(r.declared_qty),
      r.actual_qty === null ? "Not yet" : fmtInt(r.actual_qty),
      r.variance === null ? "—" : signed(r.variance),
      fmtMoney(r.price_per_sack),
      fmtMoney(r.value),
    ]),
    totals: ["Total", "", "", "", `${t.lines} lines`, fmtInt(t.declared), fmtInt(t.counted), signed(t.variance), "", fmtMoney(t.value)],
  };
}
