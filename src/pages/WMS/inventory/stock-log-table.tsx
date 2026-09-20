import { Tag, Tooltip } from "antd";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";

import { DataTable } from "../../../common/items/table/table";
import type { StockLogRow } from "../../../queries/types";
import {
  MOVEMENT_COLOR,
  MOVEMENT_LABEL,
  fmtInt,
  fmtKg,
  fmtProduct,
} from "../type-format/format";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

/** GET /stock/movements — every change to a balance, newest first. */
export const stockLogColumns: ColumnDef<StockLogRow, any>[] = [
  {
    id: "occurred_at",
    header: "Date",
    accessorFn: (r) => r.occurred_at,
    size: 130,
    meta: { fixed: "left" },
    // occurred_at is when it happened; created_at is when it was recorded
    cell: (c) => (
      <Tooltip
        title={`Recorded ${dayjs(c.row.original.created_at).format("MMM DD, YYYY h:mm A")}`}
      >
        {dayjs(c.getValue<string>()).format("MMM DD, YYYY")}
      </Tooltip>
    ),
  },
  {
    id: "product",
    header: "Product",
    accessorFn: (r) =>
      fmtProduct({
        code: r.code,
        brand: r.brand,
        variety: r.variety,
        size_kg: r.size_kg,
      }),
    size: 220,
  },
  {
    id: "movement_type",
    header: "Movement",
    accessorFn: (r) => r.movement_type,
    size: 150,
    cell: (c) => {
      const t = c.row.original.movement_type;
      return (
        <Tag color={MOVEMENT_COLOR[t]} style={{ margin: 0 }}>
          {MOVEMENT_LABEL[t]}
        </Tag>
      );
    },
  },
  {
    id: "quantity_delta",
    header: "Change",
    accessorFn: (r) => r.quantity_delta,
    size: 120,
    // signed by the server: IN adds, OUT subtracts
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
    accessorFn: (r) => Math.abs(r.quantity_delta) * r.size_kg,
    size: 120,
    cell: (c) => fmtKg(c.getValue<number>()),
  },
  {
    id: "source",
    header: "Source",
    // exclusive by CHECK: a container, an order slip, or neither
    accessorFn: (r) => r.container_no ?? r.order_slip_number,
    size: 200,
    cell: (c) => {
      const r = c.row.original;
      if (r.container_id) {
        return (
          <span style={{ fontFamily: "monospace" }}>
            {r.container_no ?? "no box"}
          </span>
        );
      }
      if (r.order_slip_id) {
        return (
          <span>
            Slip #{r.order_slip_number ?? "?"}
            {r.order_revision && r.order_revision > 1
              ? ` (rev ${r.order_revision})`
              : ""}
          </span>
        );
      }
      return dash;
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
    id: "note",
    header: "Note",
    accessorFn: (r) => r.note,
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
