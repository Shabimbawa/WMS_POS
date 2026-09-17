import { apiRequest, queryString } from "../utils/api-client";
import type {
  ContainerDetail,
  ContainerVarianceRow,
  CreateShipmentInput,
  OpenQuestionParams,
  OpenQuestionRow,
  Page,
  ProductCategory,
  ProductCategoryParams,
  ShipmentRow,
  ShippingContainerNotebookParams,
  StockStatusParams,
  StockStatusRow,
  Supplier,
  UnloadContainerInput,
  UpdateContainerStatusInput,
  VarianceParams,
} from "./types";

export async function getSuppliers(): Promise<Supplier[]> {
  return apiRequest<Supplier[]>("/suppliers");
}
export async function getProductCategories(
  params: ProductCategoryParams = {},
): Promise<ProductCategory[]> {
  return apiRequest<ProductCategory[]>(`/products${queryString(params)}`);
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
