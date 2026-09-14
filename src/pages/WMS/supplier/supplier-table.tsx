import { useMemo } from "react";
import { Tag, Tooltip } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { ContainerRow } from "../../../queries/types";
import { STATUS_COLOR, fmtInt, fmtMoney } from "../type-format/format";
import { DateParser } from "../../../common/utils/util";

const sumSacks = (r: ContainerRow) =>
  r.container_item.reduce((n, i) => n + i.qty_sacks, 0);

const sumCost = (r: ContainerRow) =>
  r.container_item.reduce(
    (n, i) => n + i.qty_sacks * (i.price_per_sack ?? 0),
    0,
  );

export const supplierColumns: ColumnDef<ContainerRow, any>[] = [
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => (
      <span style={{ fontFamily: "monospace" }}>
        {c.getValue<string | null>() ?? "—"}
      </span>
    ),
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
    id: "contents",
    header: "Brand / Size",
    accessorFn: (r) => r.container_item.length,
    size: 260,
    // One container can hold several sizes — notebook 2 shows 139598
    // carrying G-50, G-25, G-10 and G-5 on four separate lines.
    cell: (c) => {
      const items = c.row.original.container_item;
      if (!items.length) return <span style={{ opacity: 0.45 }}>—</span>;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {items.map((i) => (
            <Tag key={i.id} style={{ margin: 0 }}>
              {i.product_category.brand}-{i.product_category.size_kg}kg
              {" · "}
              {fmtInt(i.qty_sacks)}
            </Tag>
          ))}
        </div>
      );
    },
  },
  {
    id: "total_sacks",
    header: "Sacks",
    accessorFn: sumSacks,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "total_cost",
    header: "Cost",
    accessorFn: sumCost,
    size: 140,
    cell: (c) => {
      const items = c.row.original.container_item;
      const partial = items.some((i) => i.price_per_sack === null);
      const v = c.getValue<number>();
      return partial ? (
        <Tooltip title="Some lines have no price recorded">
          <span style={{ opacity: 0.6 }}>{fmtMoney(v)}*</span>
        </Tooltip>
      ) : (
        fmtMoney(v)
      );
    },
  },
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.shipment.date_list_received,
    size: 130,
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "date_delivered",
    header: "Delivered",
    accessorFn: (r) => r.date_delivered,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : "—";
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
    id: "is_company_truck",
    header: "Own truck",
    accessorFn: (r) => r.is_company_truck,
    size: 110,
    cell: (c) => (c.getValue<boolean>() ? "Yes" : "No"),
  },
];

export function SupplierTable({ data }: { data: ContainerRow[] }) {
  const columns = useMemo(() => supplierColumns, []);
  return <DataTable data={data} columns={columns} />;
}