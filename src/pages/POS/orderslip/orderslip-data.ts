/*
TEMPORARY FILE, CONTAIN MOCK DATA ONLY, DELETE THIS ONCE BACKEND IS READY AND SET UP NECESSARY API CALLS FOR CRUD AND OTHER OPERATIONS
*/

import dayjs from "dayjs";

import type {
  CreateOrderSlipInput,
  PaymentStatus,
  OrderSlip,
  OrderSlipItem,
  Product,
  UpdateOrderSlipInput,
} from "../../../queries/posTypes";

/** A line's amount isn't stored on the item, so it's derived from the product's price. */
export const lineAmount = (i: OrderSlipItem) => i.quantity * i.article.unitPrice;

// TODO: mock data until the POS backend exists. Replace MOCK_SLIPS and
// getOrderSlip with query hooks (like useShippingContainerNotebook on the
// container page); the pages only depend on the OrderSlip shape.
// `quantity` is stock on hand, in sacks.
export const PRODUCTS: Product[] = [
  { id: "p1", brand: "Jasmine", variant: "25kg", unitPrice: 1450, quantity: 120 },
  { id: "p2", brand: "Dinorado", variant: "50kg", unitPrice: 3100, quantity: 45 },
  { id: "p3", brand: "Sinandomeng", variant: "10kg", unitPrice: 520, quantity: 8 },
  { id: "p4", brand: "Ganador", variant: "25kg", unitPrice: 1380, quantity: 0 },
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
  status: PaymentStatus,
  /** Payment terms, counted from the slip date. */
  termDays: number,
): OrderSlip => {
  const date = dayjs().subtract(daysAgo, "day");
  return {
    id,
    slipNumber,
    date: date.format("YYYY-MM-DD"),
    orderBy,
    address,
    items,
    status,
    paymentDueDate: date.add(termDays, "day").format("YYYY-MM-DD"),
    totalAmount: items.reduce((n, i) => n + lineAmount(i), 0),
  };
};

export const MOCK_SLIPS: OrderSlip[] = [
  slip("s1", 1001, 2, "Juan Dela Cruz", "123 Rizal St., Quezon City", [
    item("s1-1", 4, PRODUCTS[0]),
    item("s1-2", 2, PRODUCTS[2]),
  ], "paid", 30),
  slip("s2", 1002, 5, "Maria Santos", "45 Mabini Ave., Makati", [
    item("s2-1", 10, PRODUCTS[1]),
  ], "unpaid", 30),
  slip("s3", 1003, 12, "Pedro Reyes", "", [
    item("s3-1", 1, PRODUCTS[0]),
    item("s3-2", 1, PRODUCTS[1]),
    item("s3-3", 3, PRODUCTS[2]),
  ], "partial", 7),
  slip("s4", 1004, 40, "Ana Lopez", "8 Bonifacio Rd., Pasig", [
    item("s4-1", 6, PRODUCTS[2]),
  ], "paid", 30),
];

export const getOrderSlip = (id: string | undefined): OrderSlip | undefined =>
  MOCK_SLIPS.find((s) => s.id === id);

/**
 * Mock insert: appends to MOCK_SLIPS in memory, so a new slip shows up in the
 * list and detail pages until the dev server reloads.
 *
 * TODO(backend): replace with a real call in the query layer, e.g.
 *   1. src/queries/pos.ts:
 *        export async function createOrderSlip(input: CreateOrderSlipInput) {
 *          const { data, error } = await supabase.rpc("create_order_slip", {
 *            p_date: input.date,
 *            p_order_by: input.orderBy,
 *            p_address: input.address,
 *            p_status: input.status,
 *            p_payment_due_date: input.paymentDueDate,
 *            p_items: input.items, // plain array, never JSON.stringify
 *          });
 *          if (error) throw error;
 *          return data as string; // new slip id
 *        }
 *   2. src/queries/useHooks.ts: a useCreateOrderSlip() mutation that
 *      invalidates the order slip list key on success.
 *   3. create-orderslip-page.tsx: swap its useMutation for that hook.
 * An RPC rather than separate inserts, so the slip and its lines are written
 * in one transaction (same reason as create_shipment). Slip number and total
 * should be assigned server-side.
 */
export async function createOrderSlip(input: CreateOrderSlipInput): Promise<string> {
  await new Promise((r) => setTimeout(r, 400)); // fake network latency

  const slipNumber = Math.max(1000, ...MOCK_SLIPS.map((s) => s.slipNumber)) + 1;
  const id = `s${slipNumber}`;

  const items = toMockItems(id, input);

  MOCK_SLIPS.push({
    id,
    slipNumber,
    date: input.date,
    orderBy: input.orderBy,
    address: input.address,
    items,
    status: input.status,
    paymentDueDate: input.paymentDueDate,
    totalAmount: items.reduce((n, i) => n + lineAmount(i), 0),
  });

  return id;
}

/**
 * Mock update: replaces the slip's header fields and its whole item list in
 * MOCK_SLIPS. Refuses paid slips, mirroring the rule the backend must enforce.
 *
 * TODO(backend): replace with a real call in the query layer, e.g.
 *   1. src/queries/pos.ts:
 *        export async function updateOrderSlip(input: UpdateOrderSlipInput) {
 *          const { error } = await supabase.rpc("update_order_slip", {
 *            p_order_slip_id: input.id,
 *            p_date: input.date,
 *            p_order_by: input.orderBy,
 *            p_address: input.address,
 *            p_status: input.status,
 *            p_payment_due_date: input.paymentDueDate,
 *            p_items: input.items, // plain array, never JSON.stringify
 *          });
 *          if (error) throw error;
 *        }
 *   2. src/queries/useHooks.ts: a useUpdateOrderSlip() mutation that
 *      invalidates the order slip list and this slip's detail key.
 *   3. edit-orderslip-page.tsx: swap its useMutation for that hook.
 * The RPC should replace the header and items in one transaction, and raise
 * when the slip is already paid: the disabled buttons are UX only, anyone
 * can still call the API directly.
 */
export async function updateOrderSlip(input: UpdateOrderSlipInput): Promise<void> {
  await new Promise((r) => setTimeout(r, 400)); // fake network latency

  const index = MOCK_SLIPS.findIndex((s) => s.id === input.id);
  if (index === -1) throw new Error(`No order slip exists with id "${input.id}"`);
  const current = MOCK_SLIPS[index];
  if (current.status === "paid") throw new Error("Paid order slips can't be edited");

  const items = toMockItems(current.id, input);

  MOCK_SLIPS[index] = {
    ...current,
    date: input.date,
    orderBy: input.orderBy,
    address: input.address,
    items,
    status: input.status,
    paymentDueDate: input.paymentDueDate,
    totalAmount: items.reduce((n, i) => n + lineAmount(i), 0),
  };
}

/**
 * Resolves payload lines against PRODUCTS, the way the backend would.
 *
 * TODO(backend): stock moves when a slip is saved, and this mock doesn't
 * do that yet, so stock on hand never changes here. The RPCs should, in the
 * same transaction as the slip write:
 *   - create: decrement each product's stock by its line quantity
 *   - update: add back the slip's old line quantities, then decrement by
 *     the new ones (a removed line returns its stock; a new line takes it)
 *   - re-check stock after that and raise if any product would go negative;
 *     the form's check is only as fresh as the page
 * Once stock is deducted on save, the edit form's "N in stock" limit must
 * also count the quantity already on the slip being edited, or reopening a
 * slip that took the last sacks would flag its own lines as over stock.
 */
function toMockItems(slipId: string, input: CreateOrderSlipInput): OrderSlipItem[] {
  const productsById = new Map(PRODUCTS.map((p) => [p.id, p]));
  return input.items.map((i, n) => {
    const article = productsById.get(i.productId);
    if (!article) throw new Error(`Unknown product "${i.productId}"`);
    if (i.quantity > article.quantity) {
      throw new Error(
        `Only ${article.quantity} of ${article.brand} ${article.variant} in stock`,
      );
    }
    return { id: `${slipId}-${n + 1}`, quantity: i.quantity, article };
  });
}
