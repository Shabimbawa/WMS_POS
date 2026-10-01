import { apiRequest, queryString } from "../utils/api-client";
import type { Page } from "./types";
import type {
  Cashier,
  CashierDaySummary,
  CreateCashierInput,
  CreateOrderSlipInput,
  OrderSlip,
  OrderSlipItem,
  OrderSlipListParams,
  OrderSlipSummaryParams,
  OrderSlipTrashParams,
  Product,
  TrashedOrderSlip,
  UpdateCashierInput,
  UpdateOrderSlipInput,
} from "./posTypes";

export const lineAmount = (item: OrderSlipItem) =>
  item.quantity * item.article.unitPrice;

export async function getPosProducts(): Promise<Product[]> {
  return apiRequest<Product[]>("/pos/products");
}

export async function getOrderSlips(
  params: OrderSlipListParams,
): Promise<Page<OrderSlip>> {
  return apiRequest<Page<OrderSlip>>(`/order-slips${queryString(params)}`);
}

export async function getOrderSlip(id: string): Promise<OrderSlip> {
  return apiRequest<OrderSlip>(`/order-slips/${id}`);
}

export async function getOrderSlipSummary(
  params: OrderSlipSummaryParams,
): Promise<CashierDaySummary[]> {
  return apiRequest<CashierDaySummary[]>(`/order-slips/summary${queryString(params)}`);
}

export async function createOrderSlip(input: CreateOrderSlipInput): Promise<string> {
  const result = await apiRequest<{ id: string }>("/order-slips", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.id;
}

export async function updateOrderSlip(input: UpdateOrderSlipInput): Promise<void> {
  await apiRequest(`/order-slips/${input.id}`, {
    method: "PUT",
    body: JSON.stringify({
      date: input.date,
      orderBy: input.orderBy,
      address: input.address,
      status: input.status,
      paymentDueDate: input.paymentDueDate,
      cashierId: input.cashierId,
      items: input.items,
    }),
  });
}

// ---- trash ------------------------------------------------------

/** Moves a slip to Trash. Its stock goes back on the shelf. */
export async function deleteOrderSlip(id: string): Promise<void> {
  await apiRequest(`/order-slips/${id}`, { method: "DELETE" });
}

/** Takes a slip out of Trash, deducting its stock again. */
export async function restoreOrderSlip(id: string): Promise<void> {
  await apiRequest(`/order-slips/${id}/restore`, { method: "POST" });
}

export async function getOrderSlipTrash(
  params: OrderSlipTrashParams,
): Promise<Page<TrashedOrderSlip>> {
  return apiRequest<Page<TrashedOrderSlip>>(`/order-slips/trash${queryString(params)}`);
}

/** Permanently removes one slip from Trash. */
export async function purgeOrderSlip(id: string): Promise<void> {
  await apiRequest(`/order-slips/trash/${id}`, { method: "DELETE" });
}

/** Permanently removes every slip in Trash. */
export async function emptyOrderSlipTrash(): Promise<number> {
  const result = await apiRequest<{ purged: number }>("/order-slips/trash", { method: "DELETE" });
  return result.purged;
}

// ---- cashiers ---------------------------------------------------

/** Active cashiers only, unless includeInactive (for the management page). */
export async function getCashiers(includeInactive = false): Promise<Cashier[]> {
  return apiRequest<Cashier[]>(`/pos/cashiers${queryString({ includeInactive: includeInactive || undefined })}`);
}

export async function createCashier(input: CreateCashierInput): Promise<Cashier> {
  return apiRequest<Cashier>("/pos/cashiers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCashier({ id, ...patch }: UpdateCashierInput): Promise<Cashier> {
  return apiRequest<Cashier>(`/pos/cashiers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
