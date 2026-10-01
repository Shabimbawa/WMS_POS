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
  adjustStock,
  createDelivery,
  createProduct,
  createShipment,
  createSupplier,
  getContainer,
  getContainerVariance,
  getOpenQuestionCount,
  getOpenQuestions,
  getDeliveries,
  getProductCategories,
  getShippingContainerNotebook,
  getStockLog,
  getStockStatus,
  updateStockStatus,
  getSuppliers,
  unloadContainer,
  updateContainerStatus,
  updateProduct,
  voidDelivery,
} from "./warehouse.ts";
import {
  createCashier,
  createOrderSlip,
  deleteOrderSlip,
  emptyOrderSlipTrash,
  getCashiers,
  getOrderSlip,
  getOrderSlips,
  getOrderSlipSummary,
  getOrderSlipTrash,
  getPosProducts,
  purgeOrderSlip,
  restoreOrderSlip,
  updateCashier,
  updateOrderSlip,
} from "./pos.ts";

import type {
  LocalDeliveryParams,
  OpenQuestionParams,
  ProductCategoryParams,
  ShippingContainerNotebookParams,
  SupplierParams,
  StockLogParams,
  StockStatusParams,
  VarianceParams,
} from "./types.ts";
import type {
  OrderSlipListParams,
  OrderSlipSummaryParams,
  OrderSlipTrashParams,
} from "./posTypes.ts";

const STALE_TIME = 30 * 60 * 1000; // 30 minutes

// ---- query keys -------------------------------------------------
//
// Params go in the key, so changing a page or a sort refetches and
// caches separately. Hierarchical so invalidation can be broad:
// invalidating ['notebook'] clears every shipment list at once.

export const qk = {
  suppliers: (p: SupplierParams = {}) => ["suppliers", p] as const,

  deliveries: ["deliveries"] as const,
  deliveryList: (p: LocalDeliveryParams) => ["deliveries", "list", p] as const,
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
  // Under "order-slips" so creating or editing a slip refreshes the summary.
  orderSlipSummary: (p: OrderSlipSummaryParams) =>
    ["order-slips", "summary", p] as const,
  orderSlipTrash: (p: OrderSlipTrashParams) => ["order-slips", "trash", p] as const,

  cashiers: ["pos", "cashiers"] as const,
  cashierList: (includeInactive: boolean) =>
    ["pos", "cashiers", { includeInactive }] as const,
};

// ---- reference data ---------------------------------------------
//
// Suppliers and categories change rarely — long staleTime so dropdowns
// don't refetch on every mount.

export function useSuppliers(params: SupplierParams = {}) {
  return useQuery({
    queryKey: qk.suppliers(params),
    queryFn: () => getSuppliers(params),
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

export function useDeliveries(params: LocalDeliveryParams, enabled = true) {
  return useQuery({
    queryKey: qk.deliveryList(params),
    queryFn: () => getDeliveries(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME,
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

export function useOrderSlips(params: OrderSlipListParams, enabled = true) {
  return useQuery({
    queryKey: qk.orderSlipList(params),
    queryFn: () => getOrderSlips(params),
    enabled,
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

export function useOrderSlipSummary(params: OrderSlipSummaryParams) {
  return useQuery({
    queryKey: qk.orderSlipSummary(params),
    queryFn: () => getOrderSlipSummary(params),
    placeholderData: keepPreviousData,
  });
}

export function useOrderSlipTrash(params: OrderSlipTrashParams) {
  return useQuery({
    queryKey: qk.orderSlipTrash(params),
    queryFn: () => getOrderSlipTrash(params),
    placeholderData: keepPreviousData,
  });
}

export function useCashiers(includeInactive = false) {
  return useQuery({
    queryKey: qk.cashierList(includeInactive),
    queryFn: () => getCashiers(includeInactive),
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

/** Logging or voiding a delivery moves stock, so every stock view is stale. */
function deliveryInvalidation(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.deliveries });
  qc.invalidateQueries({ queryKey: qk.stock });
  qc.invalidateQueries({ queryKey: qk.posProducts });
}

export function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDelivery,
    onSuccess: () => deliveryInvalidation(qc),
  });
}

export function useVoidDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: voidDelivery,
    onSuccess: () => deliveryInvalidation(qc),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adjustStock,
    onSuccess: () => {
      // qk.stock covers both the balance list and the movement ledger.
      qc.invalidateQueries({ queryKey: qk.stock });
      qc.invalidateQueries({ queryKey: qk.posProducts });
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      // Dropdowns read the catalogue; the stock list joins through it.
      qc.invalidateQueries({ queryKey: ["product-categories"] });
      qc.invalidateQueries({ queryKey: qk.stock });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-categories"] });
      qc.invalidateQueries({ queryKey: qk.stock });
      // POS reads price and availability off the same row.
      qc.invalidateQueries({ queryKey: qk.posProducts });
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

export function useCreateCashier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCashier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashiers });
    },
  });
}

export function useUpdateCashier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateCashier,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cashiers });
      // Slips and the summary show the cashier's name and active flag.
      qc.invalidateQueries({ queryKey: qk.orderSlips });
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

/**
 * Deleting and restoring move stock, so they refresh every slip view
 * (Trash included, under qk.orderSlips) and every stock view.
 */
function orderSlipStockInvalidation(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.orderSlips });
  qc.invalidateQueries({ queryKey: qk.posProducts });
  qc.invalidateQueries({ queryKey: qk.stock });
}

export function useDeleteOrderSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteOrderSlip,
    onSuccess: () => orderSlipStockInvalidation(qc),
  });
}

export function useRestoreOrderSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreOrderSlip,
    onSuccess: () => orderSlipStockInvalidation(qc),
  });
}

/** Emptying moves no stock; only the Trash list changes. */
export function usePurgeOrderSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeOrderSlip,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order-slips", "trash"] }),
  });
}

export function useEmptyOrderSlipTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: emptyOrderSlipTrash,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["order-slips", "trash"] }),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    // Every supplier dropdown, whichever kind it filters to.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
