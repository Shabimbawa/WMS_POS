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
  getStockStatus,
  getSuppliers,
  unloadContainer,
  updateContainerStatus,
  updateStockStatus,
} from "./warehouse.ts";

import type {
  OpenQuestionParams,
  ProductCategoryParams,
  ShippingContainerNotebookParams,
  StockStatusParams,
  VarianceParams,
} from "./types.ts";

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

export function useStockStatus(params: StockStatusParams, enabled = true) {
  return useQuery({
    queryKey: qk.stockStatus(params),
    queryFn: () => getStockStatus(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
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
      // The RPC writes counts and discrepancies; every view of them is stale.
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
