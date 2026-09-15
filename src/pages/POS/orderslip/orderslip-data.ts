import dayjs from "dayjs";

import type { OrderSlip, OrderSlipItem, Product } from "../../../queries/posTypes";

/** A line's amount isn't stored on the item, so it's derived from the product's price. */
export const lineAmount = (i: OrderSlipItem) => i.quantity * i.article.unitPrice;

// TODO: mock data until the POS backend exists. Replace MOCK_SLIPS and
// getOrderSlip with query hooks (like useShippingContainerNotebook on the
// container page); the pages only depend on the OrderSlip shape.
const PRODUCTS: Product[] = [
  { id: "p1", brand: "Jasmine", variant: "25kg", unitPrice: 1450 },
  { id: "p2", brand: "Dinorado", variant: "50kg", unitPrice: 3100 },
  { id: "p3", brand: "Sinandomeng", variant: "10kg", unitPrice: 520 },
];

const item = (id: string, quantity: number, article: Product): OrderSlipItem => ({
  id,
  quantity,
  article,
});

const slip = (
  id: string,
  slipNumber: number,
  daysAgo: number,
  orderBy: string,
  address: string,
  items: OrderSlipItem[],
): OrderSlip => ({
  id,
  slipNumber,
  date: dayjs().subtract(daysAgo, "day").format("YYYY-MM-DD"),
  orderBy,
  address,
  items,
  totalAmount: items.reduce((n, i) => n + lineAmount(i), 0),
});

export const MOCK_SLIPS: OrderSlip[] = [
  slip("s1", 1001, 2, "Juan Dela Cruz", "123 Rizal St., Quezon City", [
    item("s1-1", 4, PRODUCTS[0]),
    item("s1-2", 2, PRODUCTS[2]),
  ]),
  slip("s2", 1002, 5, "Maria Santos", "45 Mabini Ave., Makati", [
    item("s2-1", 10, PRODUCTS[1]),
  ]),
  slip("s3", 1003, 12, "Pedro Reyes", "", [
    item("s3-1", 1, PRODUCTS[0]),
    item("s3-2", 1, PRODUCTS[1]),
    item("s3-3", 3, PRODUCTS[2]),
  ]),
  slip("s4", 1004, 40, "Ana Lopez", "8 Bonifacio Rd., Pasig", [
    item("s4-1", 6, PRODUCTS[2]),
  ]),
];

export const getOrderSlip = (id: string | undefined): OrderSlip | undefined =>
  MOCK_SLIPS.find((s) => s.id === id);
