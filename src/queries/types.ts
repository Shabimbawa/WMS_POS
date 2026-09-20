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
  | "selling_price"
  | "updated_at";

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
    date_arrived_at_port: string | null;
    date_delivered: string | null;
    date_unloaded: string | null;
    /** NULL until unloaded. */
    items_match: boolean | null;
    container_item: ContainerItemRow[];
  }>;
}

/** GET /stock — one row per product balance, from the stock_balance table. */
export interface StockStatusRow {
  id: string;
  remaining_qty: number;
  updated_at: string;
  product_category: ProductLabel &
    Pick<ProductCategory, "selling_price" | "is_available">;
}

export type StockMovementType =
  | "OPENING_BALANCE"
  | "INBOUND_UNLOAD"
  | "OUTBOUND_ORDER"
  | "ORDER_REVERSAL"
  | "MANUAL_ADJUSTMENT";

/**
 * GET /stock/movements — the append-only ledger behind every balance.
 * `direction` is derived server-side from the sign of quantity_delta.
 * The source columns are exclusive: a movement carries a container, an
 * order slip, or neither.
 */
export interface StockLogRow {
  id: string;
  occurred_at: string;
  created_at: string;
  movement_type: StockMovementType;
  direction: StockDirection;
  /** Signed: negative for OUT. */
  quantity_delta: number;
  balance_after: number;
  note: string | null;
  product_category_id: string;
  brand: string;
  variety: string | null;
  code: string | null;
  size_kg: number;
  container_id: string | null;
  container_no: string | null;
  supplier: string | null;
  order_slip_id: string | null;
  order_slip_number: number | null;
  order_revision: number | null;
}

export type StockDirection = "IN" | "OUT";

// ---- params -----------------------------------------------------

export interface ShippingContainerNotebookParams
  extends ListParams<ShipmentDateField> {
  /** Omit to get every supplier, still paginated. */
  supplierId?: string;
}

export interface StockStatusParams extends Pagination {
  brand?: string;
  inStockOnly?: boolean;
  availableOnly?: boolean;
  /** Optional: narrows to balances last changed in this window. */
  dateFrom?: string;
  dateTo?: string;
  sortBy?: StockSortField;
  sortDir?: SortDir;
}

export interface StockLogParams extends Pagination, DateRange {
  productCategoryId?: string;
  direction?: StockDirection;
  movementType?: StockMovementType;
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
  date_arrived_at_port: string | null;
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

/** A discrepancy nested under its line in the variance response. */
export interface VarianceDiscrepancy {
  id: string;
  reason: DiscrepancyReason;
  declared_qty: number | null;
  /** Null for OTHER, which writes no quantity. */
  actual_qty: number | null;
  note: string | null;
  created_at: string;
  /** Set once an OTHER has been re-logged or closed. */
  resolved_at: string | null;
}

/** A container line inside the variance response. */
export interface ContainerVarianceItem {
  container_item_id: string;
  product_category_id: string;
  brand: string;
  variety: string | null;
  code: string | null;
  size_kg: number;
  declared_qty: number;
  /** Null only before unload; this report is unloaded containers only. */
  actual_qty: number | null;
  /** actual − declared; negative is a shortfall. */
  variance: number;
  price_per_sack: number | null;
  /** Empty array when the line matched. */
  discrepancies: VarianceDiscrepancy[];
}

export interface ContainerVarianceRow {
  container_id: string;
  container_no: string | null;
  status: ContainerStatus;
  items_match: boolean | null;
  date_unloaded: string | null;
  date_list_received: string;
  supplier: string;
  declared_sacks: number;
  actual_sacks: number;

  variance_sacks: number;
  discrepancy_count: number;

  container_items: ContainerVarianceItem[] | null;
}


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

  mismatchOnly?: boolean;
}

export type OpenQuestionParams = Pagination;
