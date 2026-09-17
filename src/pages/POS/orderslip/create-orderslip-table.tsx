import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { CreateOrderSlipItem, Product } from "../../../queries/posTypes";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";

// ---- draft shape -------------------------------------------------
//
// What the create page holds before submit: the payload line plus a
// client-side key per row, stripped off when it's sent.

export type DraftOrderItem = CreateOrderSlipItem & { key: string };

const dash = <span style={{ opacity: 0.45 }}>—</span>;

// ---- lines on the draft slip -------------------------------------

interface DraftOrderItemTableProps {
  items: DraftOrderItem[];
  productsById: Map<string, Product>;
  /** Edit / delete controls for a row, rendered in the last column. */
  renderActions: (item: DraftOrderItem) => ReactNode;
}

export function DraftOrderItemTable({
  items,
  productsById,
  renderActions,
}: DraftOrderItemTableProps) {
  const columns = useMemo<ColumnDef<DraftOrderItem, any>[]>(
    () => [
      {
        id: "product",
        header: "Article",
        accessorFn: (r) => r.productId,
        size: 240,
        cell: (c) => {
          const p = productsById.get(c.getValue<string>());
          return p ? fmtProduct(p) : dash;
        },
      },
      {
        id: "quantity",
        header: "Qty",
        accessorFn: (r) => r.quantity,
        size: 100,
        cell: (c) => fmtInt(c.getValue<number>()),
      },
      {
        id: "unitPrice",
        header: "Unit price",
        accessorFn: (r) => productsById.get(r.productId)?.unitPrice ?? null,
        size: 130,
        cell: (c) => fmtMoney(c.getValue<number | null>()),
      },
      {
        id: "amount",
        header: "Amount",
        accessorFn: (r) => {
          const price = productsById.get(r.productId)?.unitPrice;
          return price === undefined ? null : r.quantity * price;
        },
        size: 140,
        cell: (c) => fmtMoney(c.getValue<number | null>()),
      },
      {
        id: "actions",
        header: "",
        accessorFn: (r) => r.key,
        size: 120,
        meta: { fixed: "right" },
        cell: (c) => renderActions(c.row.original),
      },
    ],
    [productsById, renderActions],
  );

  return <DataTable data={items} columns={columns} />;
}

// ---- product price reference -------------------------------------

// Kept narrow enough to fit the side card without scrolling sideways:
// brand and variant share a column, and sizes sum under the card's width.
const productColumns: ColumnDef<Product, any>[] = [
  {
    id: "product",
    header: "Product",
    accessorFn: fmtProduct,
    size: 150,
  },
  {
    id: "unitPrice",
    header: "Unit price",
    accessorFn: (r) => r.unitPrice,
    size: 110,
    cell: (c) => fmtMoney(c.getValue<number>()),
  },
  {
    id: "quantity",
    header: "Stock",
    accessorFn: (r) => r.quantity,
    size: 70,
    cell: (c) => {
      const stock = c.getValue<number>();
      return stock > 0 ? (
        fmtInt(stock)
      ) : (
        <span style={{ color: "var(--ant-color-error, #ff4d4f)" }}>Out</span>
      );
    },
  },
];

export function ProductPriceTable({ data }: { data: Product[] }) {
  return <DataTable data={data} columns={productColumns} />;
}
