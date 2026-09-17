import { apiRequest, queryString } from "../utils/api-client";
import type { Page } from "./types";
import type {
  CreateOrderSlipInput,
  OrderSlip,
  OrderSlipItem,
  OrderSlipListParams,
  Product,
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
      items: input.items,
    }),
  });
}

