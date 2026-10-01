import { useMemo } from "react";
import { Tag, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { DateParser } from "../../../common/utils/util";
import type { ReceivingRow, StockSummaryRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct, STATUS_COLOR, STATUS_LABEL } from "../type-format/format";
import { productLabel } from "./report-export";

/** Signed sack count; zero renders muted so the movements stand out. */
const qty = (value: number, signed = false) =>
  value === 0 ? (
    <span style={{ opacity: 0.35 }}>0</span>
  ) : (
    <span>{signed && value > 0 ? "+" : ""}{fmtInt(value)}</span>
  );

const stockSummaryColumns: ColumnDef<StockSummaryRow, any>[] = [
  {
    id: "product",
    header: "Product",
    accessorFn: (r) => productLabel(r),
    size: 260,
    meta: { fixed: "left" },
    cell: (c) => fmtProduct({ ...c.row.original }),
  },
  { id: "opening", header: "Opening", accessorFn: (r) => r.opening, size: 100, cell: (c) => qty(c.getValue<number>()) },
  {
    id: "received_shipments",
    header: "From shipments",
    accessorFn: (r) => r.received_shipments,
    size: 130,
    cell: (c) => qty(c.getValue<number>(), true),
  },
  {
    id: "received_local",
    header: "Local deliveries",
    accessorFn: (r) => r.received_local,
    size: 130,
    cell: (c) => qty(c.getValue<number>(), true),
  },
  {
    id: "sold",
    header: "Sold",
    accessorFn: (r) => r.sold,
    size: 100,
    cell: (c) => (c.getValue<number>() ? <span>−{fmtInt(c.getValue<number>())}</span> : qty(0)),
  },
  {
    id: "adjustments",
    header: "Adjustments",
    accessorFn: (r) => r.adjustments,
    size: 110,
    cell: (c) => qty(c.getValue<number>(), true),
  },
  {
    id: "closing",
    header: "Closing",
    accessorFn: (r) => r.closing,
    size: 100,
    meta: { fixed: "right" },
    cell: (c) => <strong>{fmtInt(c.getValue<number>())}</strong>,
  },
];

export function StockSummaryTable({ data }: { data: StockSummaryRow[] }) {
  const columns = useMemo(() => stockSummaryColumns, []);
  return <DataTable data={data} columns={columns} />;
}

const receivingColumns: ColumnDef<ReceivingRow, any>[] = [
  {
    id: "date",
    header: "Date",
    accessorFn: (r) => r.date,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "source",
    header: "Source",
    accessorFn: (r) => r.source,
    size: 220,
    cell: (c) => {
      const row = c.row.original;
      return (
        <div>
          <Tag color={row.source === "SHIPMENT" ? "blue" : "green"} style={{ margin: 0 }}>
            {row.source === "SHIPMENT" ? "Shipment" : "Local"}
          </Tag>{" "}
          {row.reference || <Typography.Text type="secondary">No reference</Typography.Text>}
          {row.container_no && (
            <div style={{ fontSize: 12, opacity: 0.6, fontFamily: "monospace" }}>{row.container_no}</div>
          )}
        </div>
      );
    },
  },
  { id: "supplier", header: "Supplier", accessorFn: (r) => r.supplier, size: 160 },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    size: 110,
    cell: (c) => {
      const status = c.row.original.status;
      return status ? (
        <Tag color={STATUS_COLOR[status]} style={{ margin: 0 }}>{STATUS_LABEL[status]}</Tag>
      ) : (
        <Tag style={{ margin: 0 }}>Received</Tag>
      );
    },
  },
  {
    id: "product",
    header: "Product",
    accessorFn: (r) => productLabel(r),
    size: 240,
    cell: (c) => fmtProduct({ ...c.row.original }),
  },
  { id: "declared_qty", header: "Declared", accessorFn: (r) => r.declared_qty, size: 100, cell: (c) => fmtInt(c.getValue<number>()) },
  {
    id: "actual_qty",
    header: "Counted",
    accessorFn: (r) => r.actual_qty,
    size: 100,
    cell: (c) =>
      c.getValue<number | null>() === null ? (
        <Typography.Text type="secondary">Not yet</Typography.Text>
      ) : (
        fmtInt(c.getValue<number>())
      ),
  },
  {
    id: "variance",
    header: "Variance",
    accessorFn: (r) => r.variance,
    size: 100,
    cell: (c) => {
      const v = c.getValue<number | null>();
      if (v === null) return <Typography.Text type="secondary">—</Typography.Text>;
      return (
        <span style={{ color: v < 0 ? "var(--ant-color-error, #ff4d4f)" : v > 0 ? "var(--ant-color-warning, #faad14)" : undefined, opacity: v === 0 ? 0.35 : 1 }}>
          {v > 0 ? "+" : ""}{fmtInt(v)}
        </span>
      );
    },
  },
  { id: "price_per_sack", header: "Price / sack", accessorFn: (r) => r.price_per_sack, size: 120, cell: (c) => fmtMoney(c.getValue<number | null>()) },
  {
    id: "value",
    header: "Value",
    accessorFn: (r) => r.value,
    size: 140,
    meta: { fixed: "right" },
    cell: (c) => <strong>{fmtMoney(c.getValue<number | null>())}</strong>,
  },
];

export function ReceivingTable({ data }: { data: ReceivingRow[] }) {
  const columns = useMemo(() => receivingColumns, []);
  return <DataTable data={data} columns={columns} />;
}
