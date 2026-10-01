import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Tag, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { LabelValue, OverflowList } from "../../../common/items/overflow-list/overflow-list";
import type { OrderSlip } from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  fmtProduct,
  isOverdue,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import { fmtTableDate } from "../../../common/utils/util";
import { EditOrderSlipButton } from "./orderslip-actions";

/** Rows here are order slips; the full line items live on the detail page. */
const orderSlipColumns: ColumnDef<OrderSlip, any>[] = [
  {
    id: "date",
    header: "Date",
    accessorFn: (r) => r.date,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => fmtTableDate(c.getValue<string>()),
  },
  {
    id: "slipNumber",
    header: "Slip no.",
    accessorFn: (r) => r.slipNumber,
    size: 100,
    // Numbers restart daily; the Date column beside this one says which day.
    cell: (c) => (
      <Link
        to={`/order-slip/${c.row.original.id}`}
        style={{ fontFamily: "monospace" }}
      >
        #{c.getValue<number>()}
      </Link>
    ),
  },
  {
    id: "orderBy",
    header: "Order by",
    accessorFn: (r) => r.orderBy,
    size: 160,
    cell: (c) => c.getValue<string>() || "—",
  },
  {
    id: "cashier",
    header: "Cashier",
    accessorFn: (r) => r.cashier.name,
    size: 140,
  },
  {
    id: "address",
    header: "Address",
    accessorFn: (r) => r.address,
    size: 220,
    // One line; a long address would otherwise widen the whole column.
    cell: (c) => {
      const address = c.getValue<string>();
      if (!address) return "—";
      return (
        <Typography.Text ellipsis={{ tooltip: address }} style={{ maxWidth: 200 }}>
          {address}
        </Typography.Text>
      );
    },
  },
  {
    id: "items",
    header: "Articles",
    accessorFn: (r) => r.items.length,
    size: 280,
    // Two lines at most, so every row keeps the same height; the rest fold
    // into a popover.
    cell: (c) => {
      const items = c.row.original.items;
      if (!items.length) return <span style={{ opacity: 0.45 }}>—</span>;
      return (
        <OverflowList
          items={items}
          max={2}
          getKey={(i) => i.id}
          title={`${items.length} articles`}
          renderItem={(i) => (
            <LabelValue label={fmtProduct(i.article)} value={`× ${fmtInt(i.quantity)}`} />
          )}
        />
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
              {fmtTableDate(slip.paymentDueDate)}
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
