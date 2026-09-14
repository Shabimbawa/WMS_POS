import { useMemo } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { ContainerRow } from "../../../queries/types";
import { STATUS_COLOR, fmtInt } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";

/** Company-truck arrivals. Ordered by delivery date, like notebook 3. */
export const truckColumns: ColumnDef<ContainerRow, any>[] = [
  {
    id: "date_delivered",
    header: "Delivered",
    accessorFn: (r) => r.date_delivered,
    size: 130,
    meta: { fixed: "left" },
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : "—";
    },
  },
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => (
      <span style={{ fontFamily: "monospace" }}>
        {c.getValue<string | null>() ?? "—"}
      </span>
    ),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.shipment.supplier.name,
    size: 130,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    size: 120,
    cell: (c) => {
      const s = c.getValue<string>();
      return <Tag color={STATUS_COLOR[s]}>{s}</Tag>;
    },
  },
  {
    id: "date_unloaded",
    header: "Unloaded",
    accessorFn: (r) => r.date_unloaded,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : "—";
    },
  },
  {
    id: "dwell",
    header: "Days waiting",
    // Delivered but not yet opened. The notebooks show gaps of a week
    // or more, so this is the column that earns the screen.
    accessorFn: (r) => {
      if (!r.date_delivered || r.date_unloaded) return null;
      const ms = Date.now() - new Date(r.date_delivered).getTime();
      return Math.floor(ms / 86_400_000);
    },
    size: 130,
    cell: (c) => {
      const d = c.getValue<number | null>();
      if (d === null) return "—";
      return <Tag color={d > 7 ? "warning" : "default"}>{d}d</Tag>;
    },
  },
  {
    id: "total_sacks",
    header: "Sacks",
    accessorFn: (r) => r.container_item.reduce((n, i) => n + i.qty_sacks, 0),
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.shipment.date_list_received,
    size: 130,
    cell: (c) => DateParser(c.getValue<string>()),
  },
];

export function TruckTable({ data }: { data: ContainerRow[] }) {
  const columns = useMemo(() => truckColumns, []);
  return <DataTable data={data} columns={columns} />;
}