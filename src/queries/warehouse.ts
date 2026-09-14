// ============================================================
// Supabase query functions
//
// Plain async functions — no React. Hooks wrap these in hooks.ts,
// which keeps them testable and reusable from loaders or scripts.
// ============================================================

import { supabase } from "../utils/supabase-client";
import type {
  ContainerRow,
  Page,
  ProductCategory,
  ShipmentRow,
  ShippingContainerNotebookParams,
  StockStatusParams,
  StockStatusRow,
  Supplier,
  SupplierNotebookParams,
  TruckNotebookParams,
} from "./types";

// ---- helpers ----------------------------------------------------

/** 1-based page -> inclusive [from, to] for .range() */
function toRange(page: number, pageSize: number): [number, number] {
  if (page < 1) throw new Error("page is 1-based");
  if (pageSize < 1) throw new Error("pageSize must be >= 1");
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

function toPage<T>(
  rows: T[] | null,
  count: number | null,
  page: number,
  pageSize: number,
): Page<T> {
  const total = count ?? 0;
  return {
    rows: rows ?? [],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// Selected columns, kept here so the shapes in types.ts stay honest.
const ITEM_COLS = `
  id,
  qty_sacks,
  price_per_sack,
  product_category ( id, brand, size_kg )
`;

const CONTAINER_COLS = `
  id,
  container_no,
  is_company_truck,
  status,
  date_delivered,
  date_unloaded,
  notes,
  shipment!inner (
    id,
    date_list_received,
    reference,
    supplier!inner ( id, name, code )
  ),
  container_item ( ${ITEM_COLS} )
`;

// ---- reference data ---------------------------------------------

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("supplier")
    .select("id, name, code, is_active")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from("product_category")
    .select("id, brand, size_kg, is_active")
    .order("brand", { ascending: true })
    .order("size_kg", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---- notebook 2: supplier notebook ------------------------------
//
// Container-level detail with quantities and cost. One supplier,
// because on paper this is literally one notebook per supplier.

export async function getSupplierNotebook(
  p: SupplierNotebookParams,
): Promise<Page<ContainerRow>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const sortBy = p.sortBy ?? p.dateField;
  const ascending = (p.sortDir ?? "desc") === "asc";

  let q = supabase
    .from("container")
    .select(CONTAINER_COLS, { count: "exact" })
    .eq("shipment.supplier_id", p.supplierId);

  // date range applies to whichever field the caller nominated
  if (p.dateField === "date_list_received") {
    q = q
      .gte("shipment.date_list_received", p.dateFrom)
      .lte("shipment.date_list_received", p.dateTo);
  } else {
    q = q.gte(p.dateField, p.dateFrom).lte(p.dateField, p.dateTo);
  }

  if (p.status?.length) q = q.in("status", p.status);

  // NOTE: sorting by a referenced table's column does not reorder the
  // parent rows in PostgREST. See the caveat at the bottom of this file.
  if (sortBy === "date_list_received") {
    q = q.order("date_list_received", {
      referencedTable: "shipment",
      ascending,
    });
  } else {
    q = q.order(sortBy, { ascending, nullsFirst: false });
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;

  return toPage(data as unknown as ContainerRow[], count, p.page, p.pageSize);
}

// ---- notebook 1: shipping container notebook --------------------
//
// Rooted at the packing list. supplierId optional: omit for all.

export async function getShippingContainerNotebook(
  p: ShippingContainerNotebookParams,
): Promise<Page<ShipmentRow>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const ascending = (p.sortDir ?? "desc") === "asc";

  let q = supabase
    .from("shipment")
    .select(
      `
        id,
        date_list_received,
        reference,
        notes,
        supplier!inner ( id, name, code ),
        container (
          id,
          container_no,
          is_company_truck,
          status,
          date_delivered,
          date_unloaded,
          container_item ( ${ITEM_COLS} )
        )
      `,
      { count: "exact" },
    )
    .gte("date_list_received", p.dateFrom)
    .lte("date_list_received", p.dateTo);

  if (p.supplierId) q = q.eq("supplier_id", p.supplierId);

  const { data, error, count } = await q
    .order("date_list_received", { ascending })
    .range(from, to);

  if (error) throw error;
  return toPage(data as unknown as ShipmentRow[], count, p.page, p.pageSize);
}

// ---- notebook 3: truck notebook ---------------------------------
//
// Same container rows, narrowed to company-truck deliveries that
// have actually arrived.

export async function getTruckNotebook(
  p: TruckNotebookParams,
): Promise<Page<ContainerRow>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const sortBy = p.sortBy ?? p.dateField;
  const ascending = (p.sortDir ?? "desc") === "asc";

  let q = supabase
    .from("container")
    .select(CONTAINER_COLS, { count: "exact" })
    .eq("is_company_truck", true)
    .gte(p.dateField, p.dateFrom)
    .lte(p.dateField, p.dateTo);

  if (p.supplierId) q = q.eq("shipment.supplier_id", p.supplierId);
  if (p.status?.length) q = q.in("status", p.status);

  const { data, error, count } = await q
    .order(sortBy, { ascending, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  return toPage(data as unknown as ContainerRow[], count, p.page, p.pageSize);
}

// ---- stock status -----------------------------------------------

export async function getStockStatus(
  p: StockStatusParams,
): Promise<Page<StockStatusRow>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const sortBy = p.sortBy ?? "updated_at";
  const ascending = (p.sortDir ?? "desc") === "asc";

  let q = supabase
    .from("stock_status")
    .select(
      `
        id,
        remaining_qty,
        selling_price,
        updated_at,
        product_category!inner ( id, brand, size_kg )
      `,
      { count: "exact" },
    )
    .gte("updated_at", p.dateFrom)
    .lte("updated_at", p.dateTo);

  if (p.brand) q = q.eq("product_category.brand", p.brand);
  if (p.inStockOnly) q = q.gt("remaining_qty", 0);

  if (sortBy === "brand" || sortBy === "size_kg") {
    q = q.order(sortBy, { referencedTable: "product_category", ascending });
  } else {
    q = q.order(sortBy, { ascending });
  }

  const { data, error, count } = await q.range(from, to);
  if (error) throw error;

  return toPage(data as unknown as StockStatusRow[], count, p.page, p.pageSize);
}

// ---- mutations --------------------------------------------------

export interface MarkDeliveredInput {
  containerId: string;
  dateDelivered: string;
}

export async function markContainerDelivered({
  containerId,
  dateDelivered,
}: MarkDeliveredInput) {
  const { data, error } = await supabase
    .from("container")
    .update({
      status: "DELIVERED",
      date_delivered: dateDelivered,
      updated_at: new Date().toISOString(),
    })
    .eq("id", containerId)
    .select("id, status, date_delivered")
    .single();

  if (error) throw error;
  return data;
}

export interface MarkUnloadedInput {
  containerId: string;
  dateUnloaded: string;
}

export async function markContainerUnloaded({
  containerId,
  dateUnloaded,
}: MarkUnloadedInput) {
  // The CHECK constraint requires date_delivered to already be set.
  const { data, error } = await supabase
    .from("container")
    .update({
      status: "UNLOADED",
      date_unloaded: dateUnloaded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", containerId)
    .select("id, status, date_delivered, date_unloaded")
    .single();

  if (error) throw error;
  return data;
}

export interface UpdateStockInput {
  stockStatusId: string;
  remainingQty?: number;
  sellingPrice?: number | null;
}

export async function updateStockStatus({
  stockStatusId,
  remainingQty,
  sellingPrice,
}: UpdateStockInput) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (remainingQty !== undefined) patch.remaining_qty = remainingQty;
  if (sellingPrice !== undefined) patch.selling_price = sellingPrice;

  const { data, error } = await supabase
    .from("stock_status")
    .update(patch)
    .eq("id", stockStatusId)
    .select("id, remaining_qty, selling_price, updated_at")
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// CAVEAT — sorting across the join
//
// PostgREST cannot order parent rows by a referenced table's column.
// `.order(col, { referencedTable })` sorts the *embedded array*, not
// the outer result set.
//
// Affects exactly one case: getSupplierNotebook with
// sortBy = 'date_list_received'. Rows come back correct but ordered
// by container id, not by packing list date.
//
// Filtering across the join is fine — `.eq('shipment.supplier_id')`
// works because of the !inner hint.
//
// Fix when you need it: create a flattened view and point the
// container-rooted queries at it. See notebook_view.sql.
// ============================================================