import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { Cashier } from "../../../queries/posTypes";
import { CashierActions } from "./cashier-actions";

const cashierColumns: ColumnDef<Cashier, any>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (r) => r.name,
    size: 260,
  },
  {
    id: "isActive",
    header: "Status",
    accessorFn: (r) => r.isActive,
    size: 120,
    cell: (c) =>
      c.getValue<boolean>() ? (
        <Tag color="success" style={{ margin: 0 }}>Active</Tag>
      ) : (
        <Tag style={{ margin: 0 }}>Inactive</Tag>
      ),
  },
  {
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 200,
    meta: { fixed: "right" },
    cell: (c) => <CashierActions cashier={c.row.original} />,
  },
];

export function CashierTable({ data }: { data: Cashier[] }) {
  return <DataTable data={data} columns={cashierColumns} />;
}
