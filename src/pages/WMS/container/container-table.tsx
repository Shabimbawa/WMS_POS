import { useMemo } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { ContainerStatus, ShipmentRow } from "../../../queries/types";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  fmtInt,
  fmtProduct,
} from "../type-format/format";
import { DateParser } from "../../../common/utils/util";
import { ContainerActions } from "./container-actions";

/** Rows here are packing lists, with containers nested underneath. */
export const containerColumns: ColumnDef<ShipmentRow, any>[] = [
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.date_list_received,
    size: 140,
    meta: { fixed: "left" },
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier.name,
    size: 130,
  },

  {
    id: "container_count",
    header: "Container count",
    accessorFn: (r) => r.container.length,
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "containers",
    header: "Container nos.",
    accessorFn: (r) => r.container.length,
    size: 320,
    cell: (c) => {
      const list = c.row.original.container;
      if (!list.length) return <span style={{ opacity: 0.45 }}>—</span>;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {list.map((ct) => (
            <Tag
              key={ct.id}
              color={STATUS_COLOR[ct.status]}
              style={{ margin: 0, fontFamily: "monospace" }}
            >
              {ct.container_no ?? "no box"}
            </Tag>
          ))}
        </div>
      );
    },
  },
  {
    id: "brands",
    header: "Brands",
    accessorFn: (r) => r.container.length,
    size: 200,
    cell: (c) => {
      const brands = new Set<string>();
      c.row.original.container.forEach((ct) =>
        ct.container_item.forEach((i) =>
          brands.add(fmtProduct(i.product_category)),
        ),
      );
      if (!brands.size) return <span style={{ opacity: 0.45 }}>—</span>;
      return [...brands].join(", ");
    },
  },
  {
    id: "total_sacks",
    header: "Sacks",
    accessorFn: (r) =>
      r.container.reduce(
        (n, ct) => n + ct.container_item.reduce((m, i) => m + i.qty_sacks, 0),
        0,
      ),
    size: 110,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "progress",
    header: "Unloaded",
    accessorFn: (r) => r.container.filter((c) => c.date_unloaded).length,
    size: 120,
    cell: (c) => {
      const list = c.row.original.container;
      const done = list.filter((ct) => ct.date_unloaded).length;
      return `${done} / ${list.length}`;
    },
  },
];

type ShipmentContainer = ShipmentRow["container"][number];

const dash = <span style={{ opacity: 0.45 }}>—</span>;

/** One row per container inside a packing list, shown when it's expanded. */
export const shipmentContainerColumns: ColumnDef<ShipmentContainer, any>[] = [
  {
    id: "container_no",
    header: "Container no.",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => (
      <span style={{ fontFamily: "monospace" }}>
        {c.getValue<string | null>() ?? "no box"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    size: 110,
    cell: (c) => (
      <Tag color={STATUS_COLOR[c.getValue<string>()]} style={{ margin: 0 }}>
        {STATUS_LABEL[c.getValue<ContainerStatus>()]}
      </Tag>
    ),
  },
  {
    id: "items",
    header: "Brands",
    accessorFn: (r) => r.container_item.length,
    size: 260,
    cell: (c) => {
      const items = c.row.original.container_item;
      if (!items.length) return dash;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((i) => (
            <div
              key={i.id}
              style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
            >
              <span>{fmtProduct(i.product_category)}</span>

            </div>
          ))}
        </div>
      );
    },
  },
  {
    id: "sacks",
    header: "Sacks",
    accessorFn: (r) => r.container_item.reduce((n, i) => n + i.qty_sacks, 0),
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "date_delivered",
    header: "Delivered",
    accessorFn: (r) => r.date_delivered,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : dash;
    },
  },
  {
    id: "date_unloaded",
    header: "Unloaded",
    accessorFn: (r) => r.date_unloaded,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : dash;
    },
  },
  {
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 230,
    meta: { fixed: "right" },
    cell: (c) => <ContainerActions container={c.row.original} />,
  },
];

export function ContainerTable({ data }: { data: ShipmentRow[] }) {
  const columns = useMemo(() => containerColumns, []);
  return (
    <DataTable
      data={data}
      columns={columns}
      renderExpanded={(shipment) =>
        shipment.container.length ? (
          <DataTable
            data={shipment.container}
            columns={shipmentContainerColumns}
          />
        ) : null
      }
    />
  );
}