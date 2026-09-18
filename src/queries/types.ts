// ============================================================
// Shared types for the warehouse data layer
// ============================================================

export type SortDir = "asc" | "desc";

export type ContainerStatus =
  | "DOCUMENTED"
  | "ARRIVED_AT_PORT"
  | "DELIVERED"
  | "UNLOADED"
  | "CANCELLED";

/** Page is 1-based. Both fields required. */
export interface Pagination {
  page: number;
  pageSize: number;
}

/** Both ends required, ISO yyyy-mm-dd. Inclusive. */
export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

/** Shipment rows only carry the one date. */
export type ShipmentDateField = "date_list_received";

export type StockSortField =
  | "brand"
  | "size_kg"
  | "remaining_qty"
  | "selling_price";

/**
 * `dateField` picks which column the range filters on.
 * `sortBy` defaults to `dateField` when omitted.
 */
export interface ListParams<TDateField extends string, TSortField = TDateField>
  extends Pagination,
    DateRange {
  dateField: TDateField;
  sortBy?: TSortField;
  sortDir?: SortDir;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ---- row shapes -------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
}

export interface ProductCategory {
  id: string;
  brand: string;
  variety: string | null;
  size_kg: number;
  /** Notebook shorthand (L, G, PAL…), shared across a brand's sizes. */
  code: string | null;
  /** The only availability signal — a price on an unavailable product is a leftover. */
  is_available: boolean;
  selling_price: number | null;
  /** On-hand sacks. Moved here from the old stock_status table. */
  remaining_qty: number;
}

/** The product fields every embed needs to render a label. */
export type ProductLabel = Pick<
  ProductCategory,
  "id" | "brand" | "variety" | "code" | "size_kg"
>;

export interface ContainerItemRow {
  id: string;
  qty_sacks: number;
  /** NULL until the container is unloaded. */
  actual_qty_sacks: number | null;
  price_per_sack: number | null;
  product_category: ProductLabel;
}

/** Shipping container notebook is rooted at the packing list. */
export interface ShipmentRow {
  id: string;
  date_list_received: string;
  reference: string | null;
  notes: string | null;
  supplier: Pick<Supplier, "id" | "name" | "code">;
  container: Array<{
    id: string;
    container_no: string | null;
    is_company_truck: boolean;
    status: ContainerStatus;
    date_delivered: string | null;
    date_unloaded: string | null;
    /** NULL until unloaded. */
    items_match: boolean | null;
    container_item: ContainerItemRow[];
  }>;
}

/**
 * v_stock_log — one row per stock movement, newest first. The view pre-joins
 * the product and the container it came from. Postgres numerics arrive as
 * strings, so size_kg is widened here. The view's own tonnage column is
 * unused: weights are shown in kg, derived from qty_sacks x size_kg.
 */
export interface StockLogRow {
  id: string;
  occurred_on: string;
  created_at: string;
  /** UNLOAD, and whatever else the backend logs. */
  movement_type: string;
  direction: StockDirection;
  /** Signed: negative for OUT. */
  qty_delta: number;
  qty_sacks: number;
  balance_after: number;
  product_category_id: string;
  code: string | null;
  product_name: string;
  size_kg: number | string;
  container_no: string | null;
  supplier: string | null;
  notes: string | null;
}

export type StockDirection = "IN" | "OUT";

// ---- params -----------------------------------------------------

export interface ShippingContainerNotebookParams
  extends ListParams<ShipmentDateField> {
  /** Omit to get every supplier, still paginated. */
  supplierId?: string;
}

export interface StockParams extends Pagination {
  brand?: string;
  /** Hide rows sitting at zero. */
  inStockOnly?: boolean;
  /** Hide products that aren't currently sold. */
  availableOnly?: boolean;
  sortBy?: StockSortField;
  sortDir?: SortDir;
}

export interface StockLogParams extends Pagination, DateRange {
  productCategoryId?: string;
  direction?: StockDirection;
  movementType?: string;
  sortDir?: SortDir;
}

export interface ProductCategoryParams {
  availableOnly?: boolean;
}

// ---- mutation inputs --------------------------------------------

export interface CreateShipmentItem {
  product_category_id: string;
  qty_sacks: number;
  price_per_sack: number | null;
}

export interface CreateShipmentContainer {
  container_no: string | null;
  is_company_truck: boolean;
  items: CreateShipmentItem[];
}

export interface CreateShipmentInput {
  supplierId: string;
  dateListReceived: string;
  reference: string | null;
  containers: CreateShipmentContainer[];
}

export interface UpdateContainerStatusInput {
  containerId: string;
  /** UNLOADED only happens through unload_container. */
  status: Exclude<ContainerStatus, "UNLOADED">;
  /** Required when status is DELIVERED, ignored otherwise. */
  dateDelivered?: string;
  /** Required when status is ARRIVED_AT_PORT. */
  dateArrivedAtPort?: string;
  /** Required when status is CANCELLED. */
  cancellationReason?: string;
}

// ---- discrepancies ----------------------------------------------

export type DiscrepancyReason =
  | "SHORT"
  | "OVER"
  | "DAMAGED"
  | "UNDECLARED"
  | "OTHER";

/**
 * One element of unload_container's p_discrepancies. declared_qty is never
 * sent — the function reads it off container_item.
 *  - SHORT / OVER / DAMAGED: actual_qty required, written onto the line
 *  - UNDECLARED: actual_qty required, creates its own line
 *  - OTHER: note required, no actual_qty, writes nothing
 */
export interface DiscrepancyInput {
  product_category_id: string;
  reason: DiscrepancyReason;
  actual_qty?: number;
  note?: string | null;
}

export interface UnloadContainerInput {
  containerId: string;
  dateUnloaded: string;
  discrepancies: DiscrepancyInput[];
}

/** One container with everything the resolve page shows. */
export interface ContainerDetail {
  id: string;
  container_no: string | null;
  is_company_truck: boolean;
  status: ContainerStatus;
  date_delivered: string | null;
  date_unloaded: string | null;
  items_match: boolean | null;
  shipment: {
    id: string;
    date_list_received: string;
    reference: string | null;
    supplier: Pick<Supplier, "id" | "name">;
  };
  container_item: ContainerItemRow[];
}

/** A discrepancy as v_container_detail nests it under its line. */
export interface VarianceDiscrepancy {
  id: string;
  reason: DiscrepancyReason;
  /** Absent for OTHER, which writes no quantity. */
  actual_qty: number | null;
  note: string | null;
  created_at: string;
}

/** A container line inside v_container_detail. Numerics arrive as numbers here. */
export interface ContainerVarianceItem {
  container_item_id: string;
  product_category_id: string;
  code: string | null;
  product_name: string;
  size_kg: number | string;
  declared_qty: number;
  actual_qty: number;
  /** actual − declared; negative is a shortfall. */
  variance: number;
  price_per_sack: number | string | null;
  /** Empty array when the line matched. */
  discrepancies: VarianceDiscrepancy[];
}

/**
 * v_container_detail — one container with its lines and their discrepancies.
 * The variance report reads this; v_container_variance is the flat version
 * with a discrepancy_count and no lines.
 */
export interface ContainerVarianceRow {
  container_id: string;
  container_no: string | null;
  status: ContainerStatus;
  items_match: boolean | null;
  is_company_truck: boolean;
  date_delivered: string | null;
  date_unloaded: string | null;
  shipment_id: string;
  date_list_received: string;
  reference: string | null;
  supplier_id: string;
  supplier: string;
  declared_sacks: number;
  actual_sacks: number;
  /** actual − declared; negative is a shortfall. */
  variance_sacks: number;
  container_items: ContainerVarianceItem[] | null;
}

/** v_open_questions — every OTHER discrepancy. */
export interface OpenQuestionRow {
  id: string;
  created_at: string;
  container_no: string | null;
  supplier: string;
  brand: string;
  variety: string | null;
  size_kg: number;
  note: string | null;
}

export interface VarianceParams extends Pagination {
  /** Hide containers whose count matched the packing list. */
  mismatchOnly?: boolean;
}

export type OpenQuestionParams = Pagination;
