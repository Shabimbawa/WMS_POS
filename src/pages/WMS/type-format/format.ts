// Shared formatters for the WMS tables.

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

export const STATUS_COLOR: Record<string, string> = {
  DOCUMENTED: "default",
  DELIVERED: "processing",
  UNLOADED: "success",
  CANCELLED: "error",
};