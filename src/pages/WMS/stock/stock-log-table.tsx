import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { DateParser } from "../../../common/utils/util";
import type { StockLogRow } from "../../../queries/types";
import { fmtInt, fmtKg, toNum } from "../type-format/format";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

/** v_stock_log — every movement behind a product's on-hand figure. */
export const stockLogColumns: ColumnDef<StockLogRow, any>[] = [
  {
    id: "occurred_on",
    header: "Date",
    accessorFn: (r) => r.occurred_on,
    size: 130,
    meta: { fixed: "left" },
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "product",
    header: "Product",
    // the view ships a ready-made name; the code is the notebook shorthand
    accessorFn: (r) => (r.code ? `${r.code} · ${r.product_name}` : r.product_name),
    size: 220,
  },
  {
    id: "movement_type",
    header: "Movement",
    accessorFn: (r) => r.movement_type,
    size: 130,
    cell: (c) => <Tag style={{ margin: 0 }}>{c.getValue<string>()}</Tag>,
  },
  {
    id: "qty_delta",
    header: "Change",
    accessorFn: (r) => r.qty_delta,
    size: 120,
    // signed: IN adds, OUT subtracts
    cell: (c) => {
      const v = c.getValue<number>();
      return (
        <Tag color={v < 0 ? "error" : "success"} style={{ margin: 0 }}>
          {v > 0 ? `+${fmtInt(v)}` : fmtInt(v)}
        </Tag>
      );
    },
  },
  {
    id: "balance_after",
    header: "Balance after",
    accessorFn: (r) => r.balance_after,
    size: 130,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "weight_kg",
    header: "Weight",
    // sacks moved x sack size; the view's own tonnage column is ignored
    accessorFn: (r) => r.qty_sacks * toNum(r.size_kg),
    size: 120,
    cell: (c) => fmtKg(c.getValue<number>()),
  },
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? <span style={{ fontFamily: "monospace" }}>{v}</span> : dash;
    },
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier,
    size: 130,
    cell: (c) => c.getValue<string | null>() ?? dash,
  },
  {
    id: "notes",
    header: "Notes",
    accessorFn: (r) => r.notes,
    size: 260,
    cell: (c) => (
      <span style={{ whiteSpace: "normal" }}>
        {c.getValue<string | null>() ?? dash}
      </span>
    ),
  },
];

export function StockLogTable({ data }: { data: StockLogRow[] }) {
  return <DataTable data={data} columns={stockLogColumns} />;
}
