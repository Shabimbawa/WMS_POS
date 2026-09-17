import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Tag } from "antd";
import dayjs from "dayjs";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { OrderSlip } from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  isOverdue,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import { DateParser } from "../../../common/utils/util";
import { EditOrderSlipButton } from "./orderslip-actions";

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
    id: "status",
    header: "Payment",
    accessorFn: (r) => r.status,
    size: 150,
    // The due date rides under the tag instead of taking its own column, and
    // only while money is still owed — a paid slip's due date is noise.
    cell: (c) => {
      const slip = c.row.original;
      const overdue = isOverdue(slip);
      return (
        <div>
          <Tag
            color={overdue ? "error" : PAYMENT_STATUS_COLOR[slip.status]}
            style={{ margin: 0 }}
          >
            {PAYMENT_STATUS_LABEL[slip.status]}
          </Tag>
          {slip.status !== "paid" && (
            <div
              style={{
                fontSize: 12,
                whiteSpace: "nowrap",
                marginTop: 2,
                color: overdue ? "var(--ant-color-error, #ff4d4f)" : undefined,
                opacity: overdue ? 1 : 0.6,
              }}
            >
              {overdue ? "Overdue" : "Due"}{" "}
              {dayjs(slip.paymentDueDate).format("MMM D, YYYY")}
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "totalAmount",
    header: "Total amount",
    accessorFn: (r) => r.totalAmount,
    size: 140,
    meta: { fixed: "right" },
    cell: (c) => <strong>{fmtMoney(c.getValue<number>())}</strong>,
  },
  {
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 60,
    meta: { fixed: "right" },
    cell: (c) => <EditOrderSlipButton slip={c.row.original} compact />,
  },
];

export function OrderSlipTable({ data }: { data: OrderSlip[] }) {
  const columns = useMemo(() => orderSlipColumns, []);
  return <DataTable data={data} columns={columns} />;
}
