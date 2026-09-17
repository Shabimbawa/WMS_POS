// Shared formatters and small rules for the POS pages.
//
// Deliberately separate from pages/WMS/type-format/format.ts: POS code
// shouldn't import from the WMS side, even where the helpers look alike.

import type { OrderSlip, PaymentStatus, Product } from "../../../queries/posTypes";

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

/** One label for a product everywhere: "Brand Variant", e.g. "Jasmine 25kg". */
export const fmtProduct = (p: Pick<Product, "brand" | "variant">) =>
  `${p.brand} ${p.variant}`;

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};

export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  paid: "success",
  partial: "warning",
  unpaid: "default",
};

/** Still owes money past its due date. Dates compare as YYYY-MM-DD strings. */
export const isOverdue = (s: Pick<OrderSlip, "status" | "paymentDueDate">) =>
  s.status !== "paid" &&
  s.paymentDueDate < new Date().toLocaleDateString("en-CA");

/**
 * Only slips that still owe money can be edited; a paid slip is final.
 * UI gate only — the backend has to enforce the same rule.
 */
export const canEditOrderSlip = (s: Pick<OrderSlip, "status">) =>
  s.status !== "paid";
