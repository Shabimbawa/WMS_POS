import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { OrderSlip } from "../../../queries/posTypes";
import { fmtInt, fmtMoney } from "../../WMS/type-format/format";
import { DateParser } from "../../../common/utils/util";

/** Rows here are order slips; the full line items live on the detail page. */
const orderSlipColumns: ColumnDef<OrderSlip, any>[] = [
  {
    id: "date",
    header: "Date",
    accessorFn: (r) => r.date,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "slipNumber",
    header: "Slip no.",
    accessorFn: (r) => r.slipNumber,
    size: 100,
    cell: (c) => (
      <Link
        to={`/order-slip/${c.row.original.id}`}
        style={{ fontFamily: "monospace" }}
      >
        {c.getValue<number>()}
      </Link>
    ),
  },
  {
    id: "orderBy",
    header: "Order by",
    accessorFn: (r) => r.orderBy,
    size: 160,
  },
  {
    id: "address",
    header: "Address",
    accessorFn: (r) => r.address,
    size: 220,
    cell: (c) => c.getValue<string>() || "—",
  },
  {
    id: "items",
    header: "Articles",
    accessorFn: (r) => r.items.length,
    size: 280,
    cell: (c) => {
      const items = c.row.original.items;
      if (!items.length) return <span style={{ opacity: 0.45 }}>—</span>;
      const names = [
        ...new Set(items.map((i) => `${i.article.brand} ${i.article.variant}`)),
      ];
      return (
        <span>
          {items.length} {items.length === 1 ? "article" : "articles"}
          <span style={{ opacity: 0.6 }}> · {names.join(", ")}</span>
        </span>
      );
    },
  },
  {
    id: "totalQuantity",
    header: "Qty",
    accessorFn: (r) => r.items.reduce((n, i) => n + i.quantity, 0),
    size: 80,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "totalAmount",
    header: "Total amount",
    accessorFn: (r) => r.totalAmount,
    size: 140,
    meta: { fixed: "right" },
    cell: (c) => <strong>{fmtMoney(c.getValue<number>())}</strong>,
  },
];

export function OrderSlipTable({ data }: { data: OrderSlip[] }) {
  const columns = useMemo(() => orderSlipColumns, []);
  return <DataTable data={data} columns={columns} />;
}
