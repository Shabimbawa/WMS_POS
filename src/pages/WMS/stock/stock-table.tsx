import { useMemo } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { StockStatusRow } from "../../../queries/types";
import { fmtInt, fmtMoney } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";

export const stockColumns: ColumnDef<StockStatusRow, any>[] = [
  {
    id: "brand",
    header: "Brand",
    accessorFn: (r) => r.product_category.brand,
    size: 120,
    meta: { fixed: "left" },
  },
  {
    id: "size_kg",
    header: "Size",
    accessorFn: (r) => r.product_category.size_kg,
    size: 100,
    cell: (c) => `${c.getValue<number>()} kg`,
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
    id: "tonnage",
    header: "Tonnage",
    accessorFn: (r) => (r.remaining_qty * r.product_category.size_kg) / 1000,
    size: 120,
    cell: (c) => `${c.getValue<number>().toFixed(2)} t`,
  },
  {
    id: "selling_price",
    header: "Price / sack",
    accessorFn: (r) => r.selling_price,
    size: 140,
    cell: (c) => fmtMoney(c.getValue<number | null>()),
  },
  {
    id: "value",
    header: "Value",
    accessorFn: (r) => r.remaining_qty * (r.selling_price ?? 0),
    size: 160,
    cell: (c) =>
      c.row.original.selling_price === null
        ? "—"
        : fmtMoney(c.getValue<number>()),
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