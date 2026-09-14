// ============================================================
// Shared types for the warehouse data layer
// ============================================================

export type SortDir = "asc" | "desc";

export type ContainerStatus =
  | "DOCUMENTED"
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

/** The three dates, wherever all three are reachable. */
export type ContainerDateField =
  | "date_list_received"
  | "date_delivered"
  | "date_unloaded";

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
  size_kg: number;
  is_active: boolean;
}

export interface ContainerItemRow {
  id: string;
  qty_sacks: number;
  price_per_sack: number | null;
  product_category: Pick<ProductCategory, "id" | "brand" | "size_kg">;
}

/** Supplier notebook + truck notebook both return this shape. */
export interface ContainerRow {
  id: string;
  container_no: string | null;
  is_company_truck: boolean;
  status: ContainerStatus;
  date_delivered: string | null;
  date_unloaded: string | null;
  notes: string | null;
  shipment: {
    id: string;
    date_list_received: string;
    reference: string | null;
    supplier: Pick<Supplier, "id" | "name" | "code">;
  };
  container_item: ContainerItemRow[];
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
    container_item: ContainerItemRow[];
  }>;
}

export interface StockStatusRow {
  id: string;
  remaining_qty: number;
  selling_price: number | null;
  updated_at: string;
  product_category: Pick<ProductCategory, "id" | "brand" | "size_kg">;
}

// ---- params -----------------------------------------------------

export interface SupplierNotebookParams
  extends ListParams<ContainerDateField> {
  /** Required: this notebook is per-supplier by definition. */
  supplierId: string;
  status?: ContainerStatus[];
}

export interface ShippingContainerNotebookParams
  extends ListParams<ShipmentDateField> {
  /** Omit to get every supplier, still paginated. */
  supplierId?: string;
}

export interface TruckNotebookParams
  extends ListParams<Exclude<ContainerDateField, "date_list_received">> {
  supplierId?: string;
  status?: ContainerStatus[];
}

export interface StockStatusParams
  extends ListParams<"updated_at", StockSortField> {
  brand?: string;
  /** Hide rows sitting at zero. */
  inStockOnly?: boolean;
}