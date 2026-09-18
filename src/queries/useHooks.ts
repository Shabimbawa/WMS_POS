// ============================================================
// TanStack Query hooks
// ============================================================

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createShipment,
  getContainer,
  getContainerVariance,
  getOpenQuestionCount,
  getOpenQuestions,
  getProductCategories,
  getShippingContainerNotebook,
  getStockLog,
  getStockStatus,
  updateStockStatus,
  getSuppliers,
  unloadContainer,
  updateContainerStatus,
} from "./warehouse.ts";
import {
  createOrderSlip,
  getOrderSlip,
  getOrderSlips,
  getPosProducts,
  updateOrderSlip,
} from "./pos.ts";

import type {
  OpenQuestionParams,
  ProductCategoryParams,
  ShippingContainerNotebookParams,
  StockLogParams,
  StockStatusParams,
  VarianceParams,
} from "./types.ts";
import type { OrderSlipListParams } from "./posTypes.ts";

const STALE_TIME = 30 * 60 * 1000; // 30 minutes

// ---- query keys -------------------------------------------------
//
// Params go in the key, so changing a page or a sort refetches and
// caches separately. Hierarchical so invalidation can be broad:
// invalidating ['notebook'] clears every shipment list at once.

export const qk = {
  suppliers: ["suppliers"] as const,
  productCategories: (p: ProductCategoryParams = {}) =>
    ["product-categories", p] as const,

  notebooks: ["notebook"] as const,
  shippingNotebook: (p: ShippingContainerNotebookParams) =>
    ["notebook", "shipping", p] as const,
  // Under "notebook" so anything that invalidates shipments refreshes it too.
  container: (id: string) => ["notebook", "container", id] as const,

  discrepancies: ["discrepancies"] as const,
  variance: (p: VarianceParams) => ["discrepancies", "variance", p] as const,
  openQuestions: (p: OpenQuestionParams) =>
    ["discrepancies", "open-questions", p] as const,
  openQuestionCount: ["discrepancies", "open-questions", "count"] as const,

  stock: ["stock"] as const,
  stockStatus: (p: StockStatusParams) => ["stock", "status", p] as const,
  stockLog: (p: StockLogParams) => ["stock", "log", p] as const,

  posProducts: ["pos", "products"] as const,
  orderSlips: ["order-slips"] as const,
  orderSlipList: (p: OrderSlipListParams) => ["order-slips", "list", p] as const,
  orderSlip: (id: string) => ["order-slips", "detail", id] as const,
};

// ---- reference data ---------------------------------------------
//
// Suppliers and categories change rarely — long staleTime so dropdowns
// don't refetch on every mount.

export function useSuppliers() {
  return useQuery({
    queryKey: qk.suppliers,
    queryFn: getSuppliers,
    staleTime: STALE_TIME,
  });
}

export function useProductCategories(params: ProductCategoryParams = {}) {
  return useQuery({
    queryKey: qk.productCategories(params),
    queryFn: () => getProductCategories(params),
    staleTime: STALE_TIME,
  });
}

// ---- lists ------------------------------------------------------
//
// placeholderData: keepPreviousData holds the current page on screen
// while the next one loads, instead of flashing a spinner.

export function useShippingContainerNotebook(
  params: ShippingContainerNotebookParams,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.shippingNotebook(params),
    queryFn: () => getShippingContainerNotebook(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function useContainer(id: string | undefined) {
  return useQuery({
    queryKey: qk.container(id ?? ""),
    queryFn: () => getContainer(id!),
    enabled: Boolean(id),
  });
}

// ---- discrepancies ----------------------------------------------

export function useContainerVariance(params: VarianceParams, enabled = true) {
  return useQuery({
    queryKey: qk.variance(params),
    queryFn: () => getContainerVariance(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function useOpenQuestions(params: OpenQuestionParams, enabled = true) {
  return useQuery({
    queryKey: qk.openQuestions(params),
    queryFn: () => getOpenQuestions(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function useOpenQuestionCount() {
  return useQuery({
    queryKey: qk.openQuestionCount,
    queryFn: getOpenQuestionCount,
    staleTime: STALE_TIME,
  });
}

export function useStockLog(params: StockLogParams, enabled = true) {
  return useQuery({
    queryKey: qk.stockLog(params),
    queryFn: () => getStockLog(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function useStockStatus(params: StockStatusParams, enabled = true) {
  return useQuery({
    queryKey: qk.stockStatus(params),
    queryFn: () => getStockStatus(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

export function usePosProducts() {
  return useQuery({
    queryKey: qk.posProducts,
    queryFn: getPosProducts,
    staleTime: STALE_TIME,
  });
}

export function useOrderSlips(params: OrderSlipListParams) {
  return useQuery({
    queryKey: qk.orderSlipList(params),
    queryFn: () => getOrderSlips(params),
    placeholderData: keepPreviousData,
  });
}

export function useOrderSlip(id: string | undefined) {
  return useQuery({
    queryKey: qk.orderSlip(id ?? ""),
    queryFn: () => getOrderSlip(id!),
    enabled: Boolean(id),
  });
}

// ---- mutations --------------------------------------------------

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createShipment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notebooks });
    },
  });
}

export function useUpdateContainerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateContainerStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notebooks });
    },
  });
}

export function useUnloadContainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unloadContainer,
    onSuccess: () => {
      // The transaction writes counts and discrepancies; every view is stale.
      qc.invalidateQueries({ queryKey: qk.notebooks });
      qc.invalidateQueries({ queryKey: qk.stock });
      qc.invalidateQueries({ queryKey: qk.discrepancies });
    },
  });
}

export function useUpdateStockStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateStockStatus,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stock });
    },
  });
}

export function useCreateOrderSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrderSlip,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orderSlips });
      qc.invalidateQueries({ queryKey: qk.posProducts });
      qc.invalidateQueries({ queryKey: qk.stock });
    },
  });
}

export function useUpdateOrderSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateOrderSlip,
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.orderSlips });
      qc.invalidateQueries({ queryKey: qk.orderSlip(input.id) });
      qc.invalidateQueries({ queryKey: qk.posProducts });
      qc.invalidateQueries({ queryKey: qk.stock });
    },
  });
}
