import { useMemo } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { StockStatusRow } from "../../../queries/types";
import { fmtInt, fmtKg, fmtMoney, fmtProduct } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";

/** GET /stock rows: a stock_balance joined to its product. */
export const stockColumns: ColumnDef<StockStatusRow, any>[] = [
  {
    id: "product",
    header: "Product",
    accessorFn: (r) => fmtProduct(r.product_category),
    size: 220,
    meta: { fixed: "left" },
  },
  {
    id: "is_available",
    header: "Available",
    accessorFn: (r) => r.product_category.is_available,
    size: 110,
    cell: (c) =>
      c.getValue<boolean>() ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>,
  },
  {
    id: "remaining_qty",
    header: "On hand",
    accessorFn: (r) => r.remaining_qty,
    size: 130,
    cell: (c) => {
      const q = c.getValue<number>();
      return q === 0 ? <Tag color="error">0</Tag> : fmtInt(q);
    },
  },
  {
    id: "weight_kg",
    header: "Weight",
    accessorFn: (r) => r.remaining_qty * r.product_category.size_kg,
    size: 120,
    cell: (c) => fmtKg(c.getValue<number>()),
  },
  {
    id: "selling_price",
    header: "Price / sack",
    accessorFn: (r) => r.product_category.selling_price,
    size: 140,
    // A price on an unavailable product is a leftover, not a signal.
    cell: (c) => (
      <span style={{
          opacity: c.row.original.product_category.is_available ? 1 : 0.45,
        }}>
        {fmtMoney(c.getValue<number | null>())}
      </span>
    ),
  },
  {
    id: "value",
    header: "Value",
    accessorFn: (r) =>
      r.remaining_qty * (r.product_category.selling_price ?? 0),
    size: 160,
    cell: (c) => {
      const pc = c.row.original.product_category;
      return pc.selling_price === null || !pc.is_available
        ? "—"
        : fmtMoney(c.getValue<number>());
    },
  },
  {
    id: "updated_at",
    header: "Last updated",
    accessorFn: (r) => r.updated_at,
    size: 140,
    cell: (c) => DateParser(c.getValue<string>()),
  },
];

export function StockTable({ data }: { data: StockStatusRow[] }) {
  const columns = useMemo(() => stockColumns, []);
  return <DataTable data={data} columns={columns} />;
}
