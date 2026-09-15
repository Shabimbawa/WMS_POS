import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type {
  CreateShipmentContainer,
  CreateShipmentItem,
  ProductCategory,
} from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";

// ---- draft shapes ------------------------------------------------
//
// What the register-shipment page holds before submit: the RPC payload
// plus a client-side key per row, stripped off when it's sent.

export type DraftItem = CreateShipmentItem & { key: string };

export type DraftContainer = Omit<CreateShipmentContainer, "items"> & {
  key: string;
  items: DraftItem[];
};

const dash = <span style={{ opacity: 0.45 }}>—</span>;

// ---- items inside one draft container ----------------------------

interface DraftItemTableProps {
  items: DraftItem[];
  productsById: Map<string, ProductCategory>;
  /** Edit / delete controls for a row, rendered in the last column. */
  renderActions: (item: DraftItem) => ReactNode;
}

export function DraftItemTable({
  items,
  productsById,
  renderActions,
}: DraftItemTableProps) {
  const columns = useMemo<ColumnDef<DraftItem, any>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        accessorFn: (r) => r.product_category_id,
        size: 240,
        cell: (c) => {
          const p = productsById.get(c.getValue<string>());
          return p ? fmtProduct(p) : dash;
        },
      },
      {
        id: "qty_sacks",
        header: "Sacks",
        accessorFn: (r) => r.qty_sacks,
        size: 100,
        cell: (c) => fmtInt(c.getValue<number>()),
      },
      {
        id: "price_per_sack",
        header: "Price / sack",
        accessorFn: (r) => r.price_per_sack,
        size: 130,
        cell: (c) => fmtMoney(c.getValue<number | null>()),
      },
      {
        id: "subtotal",
        header: "Subtotal",
        accessorFn: (r) =>
          r.price_per_sack === null ? null : r.qty_sacks * r.price_per_sack,
        size: 140,
        cell: (c) => fmtMoney(c.getValue<number | null>()),
      },
      {
        id: "actions",
        header: "",
        accessorFn: (r) => r.key,
        size: 160,
        meta: { fixed: "right" },
        cell: (c) => renderActions(c.row.original),
      },
    ],
    [productsById, renderActions],
  );

  return <DataTable data={items} columns={columns} />;
}

// ---- registered products reference -------------------------------

const productColumns: ColumnDef<ProductCategory, any>[] = [
  {
    id: "brand",
    header: "Brand",
    accessorFn: (r) => r.brand,
    size: 130,
  },
  {
    id: "variety",
    header: "Variety",
    accessorFn: (r) => r.variety,
    size: 130,
    cell: (c) => c.getValue<string | null>() ?? dash,
  },
  {
    id: "size_kg",
    header: "Size",
    accessorFn: (r) => r.size_kg,
    size: 80,
    cell: (c) => `${c.getValue<number>()} kg`,
  },
];

export function ProductReferenceTable({ data }: { data: ProductCategory[] }) {
  return <DataTable data={data} columns={productColumns} />;
}
