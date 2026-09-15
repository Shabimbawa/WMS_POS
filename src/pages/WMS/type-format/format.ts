// Shared formatters for the WMS tables.

import type {
  ContainerStatus,
  DiscrepancyReason,
  ProductLabel,
} from "../../../queries/types";

const php = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const int = new Intl.NumberFormat("en-PH");

export const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : php.format(v);

export const fmtInt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : int.format(v);

/**
 * One label for a product everywhere: "G · Brand Variety 50kg", or just
 * "Brand Variety 50kg" for brands that have no notebook shorthand yet.
 */
export const fmtProduct = ({
  code,
  brand,
  variety,
  size_kg,
}: Omit<ProductLabel, "id">) => {
  const name = [brand, variety, `${size_kg}kg`].filter(Boolean).join(" ");
  return code ? `${code} · ${name}` : name;
};

export const STATUS_LABEL: Record<ContainerStatus, string> = {
  DOCUMENTED: "Documented",
  ARRIVED_AT_PORT: "At port",
  DELIVERED: "Delivered",
  UNLOADED: "Unloaded",
  CANCELLED: "Cancelled",
};

export const REASON_LABEL: Record<DiscrepancyReason, string> = {
  SHORT: "Short",
  OVER: "Over",
  DAMAGED: "Damaged",
  UNDECLARED: "Undeclared",
  OTHER: "Other",
};

export const REASON_COLOR: Record<DiscrepancyReason, string> = {
  SHORT: "error",
  OVER: "processing",
  DAMAGED: "warning",
  UNDECLARED: "purple",
  OTHER: "default",
};

export const STATUS_COLOR: Record<string, string> = {
  DOCUMENTED: "default",
  ARRIVED_AT_PORT: "warning",
  DELIVERED: "processing",
  UNLOADED: "success",
  CANCELLED: "error",
};
