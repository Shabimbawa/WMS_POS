export type PaymentStatus = "paid" | "unpaid" | "partial";

export type SortDir = "asc" | "desc";

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
    slipNumber: number;
    date: string;
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
    search?: string;
    sortDir?: SortDir;
}
