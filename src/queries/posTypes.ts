export type PaymentStatus = "paid" | "unpaid" | "partial";

export type SortDir = "asc" | "desc";

/** A person an order slip is assigned to. Not a login; deactivated, never deleted. */
export interface Cashier {
    id: string;
    name: string;
    isActive: boolean;
}

export interface CreateCashierInput {
    name: string;
}

export interface UpdateCashierInput {
    id: string;
    name?: string;
    isActive?: boolean;
}

export interface Product {
    id: string;
    brand: string;
    variant: string;
    unitPrice: number;
    quantity: number;
}

export interface OrderSlipItem {
    id: string;
    quantity: number;
    article: Product;
}

export interface OrderSlip {
    id: string;
    /** Restarts at 1 each day; only unique together with `date`. */
    slipNumber: number;
    date: string;
    cashier: Cashier;
    orderBy: string;
    address: string;
    items: OrderSlipItem[];
    status: PaymentStatus;
    paymentDueDate: string;
    totalAmount: number;
}

// ---- create order slip ------------------------------------------
//
// The payload the create page submits. No id, slip number or total:
// the backend assigns the first two and should compute the total from
// its own prices rather than trusting the client's.

export interface CreateOrderSlipItem {
    productId: string;
    quantity: number;
}

export interface CreateOrderSlipInput {
    date: string;
    orderBy: string;
    address: string;
    status: PaymentStatus;
    paymentDueDate: string;
    cashierId: string;
    items: CreateOrderSlipItem[];
}

// ---- update order slip ------------------------------------------
//
// Same fields as create, replacing the slip's header and its whole item
// list. Only allowed while the slip is unpaid or partial.

export interface UpdateOrderSlipInput extends CreateOrderSlipInput {
    id: string;
}

export interface OrderSlipListParams {
    page: number;
    pageSize: number;
    dateFrom: string;
    dateTo: string;
    /** Matches customer, cashier name or slip number. */
    search?: string;
    sortDir?: SortDir;
    cashierId?: string;
}

// ---- daily summary ----------------------------------------------

export interface OrderSlipSummaryParams {
    dateFrom: string;
    dateTo: string;
}

/** One cashier's slips on one day. */
export interface CashierDaySummary {
    date: string;
    cashier: Cashier;
    slipCount: number;
    statusCounts: Record<PaymentStatus, number>;
    totalAmount: number;
    /** Fully paid slips only; partial payments aren't recorded as amounts. */
    paidAmount: number;
    products: {
        productId: string;
        brand: string;
        variant: string;
        sacks: number;
    }[];
}
