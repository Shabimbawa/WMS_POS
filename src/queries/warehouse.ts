import { apiRequest, queryString } from "../utils/api-client";
import type {
  AdjustStockInput,
  AdjustStockResult,
  ContainerDetail,
  CreateLocalDeliveryInput,
  CreateProductInput,
  LocalDeliveryParams,
  LocalDeliveryRow,
  ContainerVarianceRow,
  CreateShipmentInput,
  CreateSupplierInput,
  OpenQuestionParams,
  OpenQuestionRow,
  Page,
  ProductCategory,
  ProductCategoryParams,
  ShipmentRow,
  ShippingContainerNotebookParams,
  StockLogParams,
  StockLogRow,
  StockStatusParams,
  StockStatusRow,
  Supplier,
  SupplierParams,
  UpdateProductInput,
  VoidDeliveryInput,
  UnloadContainerInput,
  UpdateContainerStatusInput,
  VarianceParams,
} from "./types";

export async function getSuppliers(
  params: SupplierParams = {},
): Promise<Supplier[]> {
  return apiRequest<Supplier[]>(`/suppliers${queryString(params)}`);
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return apiRequest<Supplier>("/suppliers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function getProductCategories(
  params: ProductCategoryParams = {},
): Promise<ProductCategory[]> {
  return apiRequest<ProductCategory[]>(`/products${queryString(params)}`);
}

/** The only way to correct a balance outside unloading and order slips. */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<AdjustStockResult> {
  return apiRequest<AdjustStockResult>("/stock/adjustments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---- local deliveries -------------------------------------------

export async function getDeliveries(
  params: LocalDeliveryParams,
): Promise<Page<LocalDeliveryRow>> {
  return apiRequest<Page<LocalDeliveryRow>>(`/deliveries${queryString(params)}`);
}

/** Logs the delivery and moves its stock in one transaction. */
export async function createDelivery(
  input: CreateLocalDeliveryInput,
): Promise<string> {
  const result = await apiRequest<{ id: string }>("/deliveries", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.id;
}

/** Reverses the stock the delivery added. Refused if those sacks are gone. */
export async function voidDelivery({
  id,
  reason,
}: VoidDeliveryInput): Promise<void> {
  await apiRequest(`/deliveries/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ProductCategory> {
  return apiRequest<ProductCategory>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProduct({
  id,
  ...patch
}: UpdateProductInput): Promise<ProductCategory> {
  return apiRequest<ProductCategory>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function getShippingContainerNotebook(
  params: ShippingContainerNotebookParams,
): Promise<Page<ShipmentRow>> {
  return apiRequest<Page<ShipmentRow>>(`/shipments${queryString(params)}`);
}

export async function getStockStatus(
  params: StockStatusParams,
): Promise<Page<StockStatusRow>> {
  return apiRequest<Page<StockStatusRow>>(`/stock${queryString(params)}`);
}

/** The append-only ledger behind every balance. */
export async function getStockLog(
  params: StockLogParams,
): Promise<Page<StockLogRow>> {
  return apiRequest<Page<StockLogRow>>(`/stock/movements${queryString(params)}`);
}

export async function createShipment(input: CreateShipmentInput): Promise<string> {
  const result = await apiRequest<{ id: string }>("/shipments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.id;
}

export async function updateContainerStatus({
  containerId,
  status,
  dateDelivered,
  dateArrivedAtPort,
  cancellationReason,
}: UpdateContainerStatusInput) {
  if (status === "DOCUMENTED") {
    throw new Error("Containers cannot be moved backward to Documented");
  }
  if (status === "ARRIVED_AT_PORT") {
    return apiRequest(`/containers/${containerId}/arrive-at-port`, {
      method: "POST",
      body: JSON.stringify({ date: dateArrivedAtPort }),
    });
  }
  if (status === "DELIVERED") {
    return apiRequest(`/containers/${containerId}/deliver`, {
      method: "POST",
      body: JSON.stringify({ date: dateDelivered }),
    });
  }
  return apiRequest(`/containers/${containerId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: cancellationReason }),
  });
}

export async function unloadContainer(input: UnloadContainerInput): Promise<void> {
  await apiRequest(`/containers/${input.containerId}/unload`, {
    method: "POST",
    body: JSON.stringify({
      dateUnloaded: input.dateUnloaded,
      discrepancies: input.discrepancies,
    }),
  });
}

export async function getContainer(id: string): Promise<ContainerDetail> {
  return apiRequest<ContainerDetail>(`/containers/${id}`);
}

export async function getContainerVariance(
  params: VarianceParams,
): Promise<Page<ContainerVarianceRow>> {
  return apiRequest<Page<ContainerVarianceRow>>(
    `/discrepancies/variance${queryString(params)}`,
  );
}

export async function getOpenQuestions(
  params: OpenQuestionParams,
): Promise<Page<OpenQuestionRow>> {
  return apiRequest<Page<OpenQuestionRow>>(
    `/discrepancies/open-questions${queryString(params)}`,
  );
}

export async function getOpenQuestionCount(): Promise<number> {
  const result = await apiRequest<{ count: number }>(
    "/discrepancies/open-questions/count",
  );
  return result.count;
}

export interface UpdateStockInput {
  stockStatusId: string;
  remainingQty: number;
}

export async function updateStockStatus(_input: UpdateStockInput): Promise<never> {
  void _input;
  throw new Error(
    "Direct stock replacement is disabled. Create an audited stock adjustment instead.",
  );
}
