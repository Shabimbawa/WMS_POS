// Shared formatters and small rules for the POS pages.
//
// Deliberately separate from pages/WMS/type-format/format.ts: POS code
// shouldn't import from the WMS side, even where the helpers look alike.

import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import type { OrderSlip, PaymentStatus, Product } from "../../../queries/posTypes";

dayjs.extend(utc);
dayjs.extend(timezone);

/** A POS "day" is a calendar day in Philippine time, whatever the device's zone. */
export const POS_TIMEZONE = "Asia/Manila";

/** Today in Philippine time, as a local-midnight Dayjs for date pickers. */
export const posToday = (): Dayjs => dayjs(dayjs().tz(POS_TIMEZONE).format("YYYY-MM-DD"));

/** Today in Philippine time, as YYYY-MM-DD. */
export const posTodayString = () => dayjs().tz(POS_TIMEZONE).format("YYYY-MM-DD");

/**
 * Slip numbers restart daily, so a number is always shown with its date:
 * "Sep 19 · #3", plus the year when it isn't the current one.
 */
export const fmtSlipNumber = (s: Pick<OrderSlip, "date" | "slipNumber">) => {
  const date = dayjs(s.date);
  const sameYear = date.year() === posToday().year();
  return `${date.format(sameYear ? "MMM D" : "MMM D, YYYY")} · #${s.slipNumber}`;
};

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
  s.status !== "paid" && s.paymentDueDate < posTodayString();

/**
 * Only slips that still owe money can be edited; a paid slip is final.
 * UI gate only — the backend has to enforce the same rule.
 */
export const canEditOrderSlip = (s: Pick<OrderSlip, "status">) =>
  s.status !== "paid";
