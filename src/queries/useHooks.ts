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
  getProductCategories,
  getShippingContainerNotebook,
  getStockStatus,
  getSupplierNotebook,
  getSuppliers,
  getTruckNotebook,
  markContainerDelivered,
  markContainerUnloaded,
  updateStockStatus,
} from "./warehouse.ts";

import type {
  ShippingContainerNotebookParams,
  StockStatusParams,
  SupplierNotebookParams,
  TruckNotebookParams,
} from "./types.ts";

const STALE_TIME = 30 * 60 * 1000; // 30 minutes

// ---- query keys -------------------------------------------------
//
// Params go in the key, so changing a page or a sort refetches and
// caches separately. Hierarchical so invalidation can be broad:
// invalidating ['notebook'] clears all three notebooks at once.

export const qk = {
  suppliers: ["suppliers"] as const,
  productCategories: ["product-categories"] as const,

  notebooks: ["notebook"] as const,
  supplierNotebook: (p: SupplierNotebookParams) =>
    ["notebook", "supplier", p] as const,
  shippingNotebook: (p: ShippingContainerNotebookParams) =>
    ["notebook", "shipping", p] as const,
  truckNotebook: (p: TruckNotebookParams) =>
    ["notebook", "truck", p] as const,

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

export function useProductCategories() {
  return useQuery({
    queryKey: qk.productCategories,
    queryFn: getProductCategories,
    staleTime: STALE_TIME,
  });
}

// ---- notebooks --------------------------------------------------
//
// placeholderData: keepPreviousData holds the current page on screen
// while the next one loads, instead of flashing a spinner.

export function useSupplierNotebook(
  params: SupplierNotebookParams,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.supplierNotebook(params),
    queryFn: () => getSupplierNotebook(params),
    enabled: enabled && Boolean(params.supplierId),
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
  });
}

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

export function useTruckNotebook(params: TruckNotebookParams, enabled = true) {
  return useQuery({
    queryKey: qk.truckNotebook(params),
    queryFn: () => getTruckNotebook(params),
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

// ---- mutations --------------------------------------------------

export function useMarkContainerDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markContainerDelivered,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.notebooks });
    },
  });
}

export function useMarkContainerUnloaded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markContainerUnloaded,
    onSuccess: () => {
      // unloading is what moves stock, so both trees are stale
      qc.invalidateQueries({ queryKey: qk.notebooks });
      qc.invalidateQueries({ queryKey: qk.stock });
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