export interface Product {
    id: string;
    brand: string;
    variant: string;
    unitPrice: number;
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
    totalAmount: number;
}