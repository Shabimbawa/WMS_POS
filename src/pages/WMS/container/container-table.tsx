import { useMemo } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { ShipmentRow } from "../../../queries/types";
import { STATUS_COLOR, fmtInt } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";

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
    id: "reference",
    header: "Reference",
    accessorFn: (r) => r.reference,
    size: 170,
    cell: (c) => c.getValue<string | null>() ?? "—",
  },
  {
    id: "container_count",
    header: "Boxes",
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
          brands.add(
            `${i.product_category.brand}-${i.product_category.size_kg}kg`,
          ),
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

export function ContainerTable({ data }: { data: ShipmentRow[] }) {
  const columns = useMemo(() => containerColumns, []);
  return <DataTable data={data} columns={columns} />;
}