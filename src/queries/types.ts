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

export interface AuditLogParams extends Pagination {
  dateFrom?: string;
  dateTo?: string;
  module?: string;
  success?: boolean;
  search?: string;
  sortDir?: SortDir;
}

export interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: "warehouse_admin" | "pos_admin" | null;
  action: string;
  module: string;
  method: string;
  route: string;
  recordId: string | null;
  details: unknown;
  statusCode: number;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

// ---- row shapes -------------------------------------------------

export type SupplierKind = "INTERNATIONAL" | "LOCAL" | "NATIONAL";

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  /** Where the supplier ships from, e.g. "China, Beijing". */
  origin: string | null;
  /** Which inbound route: containers by sea, or a local truck delivery. */
  kind: SupplierKind;
  is_active: boolean;
}

/** Ocean carriers that move containers port to port. */
export interface ShippingCompany {
  id: string;
  name: string;
  /** Primary display code retained for historical views. */
  code: string | null;
  /** All container-owner prefixes that identify this carrier. */
  codes: string[];
  /** Calendar days used to calculate the port pull-out deadline. */
  grace_period_days: number | null;
  is_active: boolean;
}

export interface SupplierParams {
  kind?: SupplierKind;
}

/** POST /suppliers. Names and codes are unique, ignoring case. */
export interface CreateSupplierInput {
  name: string;
  code: string | null;
  origin: string | null;
  kind: SupplierKind;
}

/** PATCH /suppliers/:id. Kind cannot be changed once relationships exist. */
export interface UpdateSupplierInput {
  name?: string;
  code?: string | null;
  origin?: string | null;
  kind?: SupplierKind;
  isActive?: boolean;
}

export interface CreateShippingCompanyInput {
  name: string;
  codes: string[];
  gracePeriodDays: number;
}

export interface UpdateShippingCompanyInput {
  name?: string;
  codes?: string[];
  gracePeriodDays?: number;
  isActive?: boolean;
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
  archived_at: string | null;
  supplier: Pick<Supplier, "id" | "name" | "code" | "origin" | "kind">;
  container: Array<{
    id: string;
    container_no: string | null;
    /** Free-text notes for this container; optional. */
    notes: string | null;
    /** Null until the container arrives at port; true = own truck. */
    is_company_truck: boolean | null;
    /** Third-party hauler name, set when is_company_truck is false. */
    hauler: string | null;
    /** Ocean carrier that ships this container port to port. */
    shipping_company: Pick<ShippingCompany, "id" | "name" | "code" | "grace_period_days"> | null;
    status: ContainerStatus;
    date_arrived_at_port: string | null;
    pull_out_before: string | null;
    date_delivered: string | null;
    date_unloaded: string | null;
    /** NULL until unloaded. */
    items_match: boolean | null;
    container_item: ContainerItemRow[];
  }>;
}

/** GET /containers — one container in the chosen status, with its shipment. */
export type ContainerListRow = ShipmentRow["container"][number] & {
  shipment: Pick<ShipmentRow, "id" | "date_list_received" | "reference" | "archived_at" | "supplier">;
};

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
  | "MANUAL_ADJUSTMENT"
  | "INBOUND_LOCAL"
  | "LOCAL_REVERSAL"
  /** Takes back unloaded stock when its container is deleted or recounted. */
  | "SHIPMENT_REVERSAL";

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
  local_delivery_id: string | null;
  delivery_reference: string | null;
  order_slip_id: string | null;
  order_slip_number: number | null;
  /** Slip numbers restart daily; show them with this date. */
  order_slip_date: string | null;
  order_revision: number | null;
}

export type StockDirection = "IN" | "OUT";

// ---- params -----------------------------------------------------

export interface ShippingContainerNotebookParams
  extends ListParams<ShipmentDateField> {
  /** Omit to get every supplier, still paginated. */
  supplierId?: string;
  containerNo?: string;
  /** Restrict to one inbound route (international vs national). */
  kind?: SupplierKind;
  /** Active notebook by default; true returns only archived shipments. */
  archived?: boolean;
}

/** The notebook filters, narrowed to containers in one status. */
export interface ContainerListParams extends ShippingContainerNotebookParams {
  status: ContainerStatus;
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

/**
 * POST /stock/adjustments. The delta is signed and cannot be zero; the reason
 * is required because it is the only provenance a manual adjustment has.
 */
export interface AdjustStockInput {
  productCategoryId: string;
  quantityDelta: number;
  reason: string;
}

export interface AdjustStockResult {
  movementId: string;
  /** The balance after the adjustment, not the delta. */
  remainingQty: number;
}

export interface CreateProductInput {
  brand: string;
  variety: string | null;
  sizeKg: number;
  code: string | null;
  isAvailable: boolean;
  sellingPrice: number | null;
}

/**
 * Absent means "leave alone", explicit null means "clear it". sizeKg is not
 * editable — it is the product's identity and the weight of its history.
 */
export interface UpdateProductInput {
  id: string;
  brand?: string;
  variety?: string | null;
  code?: string | null;
  isAvailable?: boolean;
  sellingPrice?: number | null;
}

export interface CreateShipmentItem {
  id?: string;
  product_category_id: string;
  qty_sacks: number;
  price_per_sack: number | null;
}

export interface CreateShipmentContainer {
  id?: string;
  container_no: string | null;
  /** Ocean carrier that ships this container port to port. */
  shipping_company_id: string;
  notes?: string | null;
  items: CreateShipmentItem[];
}

export interface CreateShipmentInput {
  supplierId: string;
  dateListReceived: string;
  reference: string | null;
  allowNegativeInventory?: boolean;
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

export type HaulingAssignment = "NOT_ASSIGNED" | "OWN_TRUCK" | "THIRD_PARTY";

export type UpdateContainerHaulingInput = {
  containerId: string;
} & (
  | { assignment: "NOT_ASSIGNED" }
  | { assignment: "OWN_TRUCK" }
  | { assignment: "THIRD_PARTY"; hauler: string }
);

export interface PortPullOutRow {
  id: string;
  container_no: string | null;
  date_arrived_at_port: string;
  pull_out_before: string;
  shipment_reference: string | null;
  supplier: string;
  shipping_company: string | null;
  shipping_company_code: string | null;
}

// ---- local deliveries -------------------------------------------

export interface LocalDeliveryItemRow {
  id: string;
  qty_sacks: number;
  price_per_sack: number | null;
  product_category: ProductLabel;
}

/**
 * GET /deliveries. A local supplier's truck load: one date, no lifecycle and
 * no declared-versus-counted step. Corrections are voids, not edits.
 */
export interface LocalDeliveryRow {
  id: string;
  date_received: string;
  reference: string | null;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  supplier: Pick<Supplier, "id" | "name" | "code">;
  items: LocalDeliveryItemRow[];
}

export interface LocalDeliveryParams extends Pagination, DateRange {
  supplierId?: string;
  includeVoided?: boolean;
  sortDir?: SortDir;
}

export interface CreateLocalDeliveryItem {
  product_category_id: string;
  qty_sacks: number;
  price_per_sack: number | null;
}

export interface CreateLocalDeliveryInput {
  supplierId: string;
  dateReceived: string;
  reference: string | null;
  notes?: string | null;
  items: CreateLocalDeliveryItem[];
}

export interface VoidDeliveryInput {
  id: string;
  reason: string;
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
  notes: string | null;
  is_company_truck: boolean | null;
  hauler: string | null;
  shipping_company: Pick<ShippingCompany, "id" | "name" | "code"> | null;
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

/** One unloaded container inside a shipment variance row. */
export interface ContainerVarianceRow {
  container_id: string;
  container_no: string | null;
  notes: string | null;
  shipping_company: string | null;
  shipping_company_code: string | null;
  status: ContainerStatus;
  items_match: boolean | null;
  date_unloaded: string | null;
  declared_sacks: number;
  actual_sacks: number;
  /** actual − declared; negative is a shortfall. */
  variance_sacks: number;
  discrepancy_count: number;
  container_items: ContainerVarianceItem[] | null;
}

/**
 * GET /discrepancies/variance — one row per shipment with at least one
 * unloaded container. Sack totals cover unloaded containers only.
 */
export interface ShipmentVarianceRow {
  shipment_id: string;
  date_list_received: string;
  reference: string | null;
  supplier: string;
  supplier_code: string | null;
  supplier_kind: SupplierKind;
  /** Every container on the shipment, unloaded or not. */
  container_count: number;
  unloaded_count: number;
  /** Unloaded containers whose totals differ or that have a logged issue. */
  variance_count: number;
  declared_sacks: number;
  actual_sacks: number;
  variance_sacks: number;
  discrepancy_count: number;
  last_unloaded: string | null;
  containers: ContainerVarianceRow[];
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

// ---- reports ----------------------------------------------------
//
// GET /reports/*. Read-only summaries for the Generate Reports page. Both
// count received stock only, dated by arrival: containers once unloaded
// (counted sacks, unload date) and local deliveries (date received).
// Pending or cancelled containers and voided deliveries never appear.

export type ReceivingSource = "SHIPMENT" | "LOCAL";
export type ReportSource = "ALL" | "SHIPMENT" | "INTERNATIONAL" | "NATIONAL" | "LOCAL";

interface ReportRange {
  /** Inclusive YYYY-MM-DD bounds. */
  dateFrom: string;
  dateTo: string;
  source?: ReportSource;
  /** Comma-separated ids; omitted means all. */
  supplierIds?: string;
  shipmentIds?: string;
  productIds?: string;
}

export interface InboundReportParams extends ReportRange {}

/** Inbound sacks per product per arrival day; quiet days are absent. */
export interface InboundReport {
  /** Every product the grid should list, quiet ones included. */
  products: ProductLabel[];
  cells: { product_category_id: string; date: string; sacks: number }[];
}

export interface ReceivingParams extends ReportRange {}

export interface ReportShipmentOption {
  id: string;
  reference: string | null;
  date_list_received: string;
  supplier_id: string;
  supplier: string;
  kind: "INTERNATIONAL" | "NATIONAL";
}

/** One received line, sorted by supplier then date. */
export interface ReceivingRow {
  line_id: string;
  source: ReceivingSource;
  supplier_id: string;
  supplier: string;
  /** Unload date for shipments, date received for local deliveries. */
  date: string;
  reference: string | null;
  container_no: string | null;
  product_category_id: string;
  brand: string;
  variety: string | null;
  code: string | null;
  size_kg: number;
  declared_qty: number;
  actual_qty: number;
  /** actual − declared; always 0 for local deliveries. */
  variance: number;
  price_per_sack: number | null;
  /** Counted sacks × price; null without a price. */
  value: number | null;
}
