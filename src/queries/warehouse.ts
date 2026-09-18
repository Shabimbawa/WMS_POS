// ============================================================
// Supabase query functions
//
// Plain async functions — no React. Hooks wrap these in hooks.ts,
// which keeps them testable and reusable from loaders or scripts.
// ============================================================

import { supabase } from "../utils/supabase-client";
import type {
  ContainerDetail,
  ContainerVarianceRow,
  CreateShipmentInput,
  OpenQuestionParams,
  OpenQuestionRow,
  Page,
  ProductCategory,
  ProductCategoryParams,
  ShipmentRow,
  ShippingContainerNotebookParams,
  StockLogParams,
  StockLogRow,
  StockParams,
  Supplier,
  UnloadContainerInput,
  UpdateContainerStatusInput,
  VarianceParams,
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
const PRODUCT_LABEL_COLS = "id, brand, variety, code, size_kg";

const ITEM_COLS = `
  id,
  qty_sacks,
  actual_qty_sacks,
  price_per_sack,
  product_category ( ${PRODUCT_LABEL_COLS} )
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

export async function getProductCategories(
  p: ProductCategoryParams = {},
): Promise<ProductCategory[]> {
  let q = supabase
    .from("product_category")
    .select(
      `${PRODUCT_LABEL_COLS}, is_available, selling_price, remaining_qty`,
    );

  if (p.availableOnly) q = q.eq("is_available", true);

  const { data, error } = await q
    .order("brand", { ascending: true })
    .order("variety", { ascending: true, nullsFirst: true })
    .order("size_kg", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ---- shipments ---------------------------------------------------
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
          items_match,
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

// ---- stock ------------------------------------------------------
//
// remaining_qty lives on product_category now — the stock_status table is
// gone, so this is a plain product query and every sort is a real sort.

export async function getStock(p: StockParams): Promise<Page<ProductCategory>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const sortBy = p.sortBy ?? "brand";
  const ascending = (p.sortDir ?? "asc") === "asc";

  let q = supabase
    .from("product_category")
    .select(`${PRODUCT_LABEL_COLS}, is_available, selling_price, remaining_qty`, {
      count: "exact",
    });

  if (p.brand) q = q.eq("brand", p.brand);
  if (p.inStockOnly) q = q.gt("remaining_qty", 0);
  if (p.availableOnly) q = q.eq("is_available", true);

  const { data, error, count } = await q
    .order(sortBy, { ascending, nullsFirst: false })
    .order("size_kg", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return toPage(data as ProductCategory[], count, p.page, p.pageSize);
}

/** v_stock_log — the movement ledger behind remaining_qty. */
export async function getStockLog(
  p: StockLogParams,
): Promise<Page<StockLogRow>> {
  const [from, to] = toRange(p.page, p.pageSize);
  const ascending = (p.sortDir ?? "desc") === "asc";

  let q = supabase
    .from("v_stock_log")
    .select("*", { count: "exact" })
    .gte("occurred_on", p.dateFrom)
    .lte("occurred_on", p.dateTo);

  if (p.productCategoryId) q = q.eq("product_category_id", p.productCategoryId);
  if (p.direction) q = q.eq("direction", p.direction);
  if (p.movementType) q = q.eq("movement_type", p.movementType);

  const { data, error, count } = await q
    .order("occurred_on", { ascending })
    // same-day rows keep insert order
    .order("created_at", { ascending })
    .range(from, to);

  if (error) throw error;
  return toPage(data as StockLogRow[], count, p.page, p.pageSize);
}

// ---- mutations --------------------------------------------------

/**
 * Creates the shipment, its containers and their items in one transaction.
 * Returns the new shipment id.
 */
export async function createShipment(input: CreateShipmentInput) {
  const { data, error } = await supabase.rpc("create_shipment", {
    p_supplier_id: input.supplierId,
    p_date_list_received: input.dateListReceived,
    p_reference: input.reference,
    // Passed as-is: supabase-js serialises it. A stringified array
    // makes jsonb_array_elements fail server-side.
    p_containers: input.containers,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Any status change except UNLOADED — that one goes through unloadContainer,
 * which also writes actual_qty_sacks and items_match.
 */
export async function updateContainerStatus({
  containerId,
  status,
  dateDelivered,
}: UpdateContainerStatusInput) {
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "DELIVERED") patch.date_delivered = dateDelivered;

  const { data, error } = await supabase
    .from("container")
    .update(patch)
    .eq("id", containerId)
    .select("id, status, date_delivered")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Unloads a container. An empty discrepancy list means everything matched.
 * The RPC defaults every line to its declared qty, then each discrepancy's
 * trigger overrides its line and flips items_match.
 */
export async function unloadContainer(input: UnloadContainerInput) {
  const { error } = await supabase.rpc("unload_container", {
    p_container_id: input.containerId,
    p_date_unloaded: input.dateUnloaded,
    // Passed as-is, same as create_shipment — never stringified.
    p_discrepancies: input.discrepancies,
  });

  if (error) throw error;
}

// ---- discrepancy views ------------------------------------------

export async function getContainer(id: string): Promise<ContainerDetail> {
  const { data, error } = await supabase
    .from("container")
    .select(
      `
        id,
        container_no,
        is_company_truck,
        status,
        date_delivered,
        date_unloaded,
        items_match,
        shipment!inner (
          id,
          date_list_received,
          reference,
          supplier!inner ( id, name )
        ),
        container_item ( ${ITEM_COLS} )
      `,
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as unknown as ContainerDetail;
}

export async function getContainerVariance(
  p: VarianceParams,
): Promise<Page<ContainerVarianceRow>> {
  const [from, to] = toRange(p.page, p.pageSize);

  // Only unloaded containers: before unload actual_qty_sacks is NULL, the
  // view coalesces it to 0, and every pending container reads as a total loss.
  let q = supabase
    // v_container_detail: same figures as v_container_variance, plus the
    // lines and their discrepancies for the expanded row.
    .from("v_container_detail")
    .select("*", { count: "exact" })
    .eq("status", "UNLOADED");

  if (p.mismatchOnly) q = q.neq("variance_sacks", 0);

  const { data, error, count } = await q
    .order("date_unloaded", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) throw error;
  return toPage(data as ContainerVarianceRow[], count, p.page, p.pageSize);
}

export async function getOpenQuestions(
  p: OpenQuestionParams,
): Promise<Page<OpenQuestionRow>> {
  const [from, to] = toRange(p.page, p.pageSize);

  const { data, error, count } = await supabase
    .from("v_open_questions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return toPage(data as OpenQuestionRow[], count, p.page, p.pageSize);
}

/** Count only, for a badge — head: true skips the rows. */
export async function getOpenQuestionCount(): Promise<number> {
  const { count, error } = await supabase
    .from("v_open_questions")
    .select("*", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

// Stock is never written from the client: unload_container and the
// stock_logs ledger own remaining_qty.
