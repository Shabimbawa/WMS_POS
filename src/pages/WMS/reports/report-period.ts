// Turns the report's period choice into the inclusive date range it sends.

import dayjs, { type Dayjs } from "dayjs";

export type PeriodKind = "weekly" | "biweekly" | "monthly" | "yearly" | "custom";

export const PERIOD_OPTIONS: { label: string; value: PeriodKind }[] = [
  { label: "Weekly", value: "weekly" },
  { label: "Bi-weekly", value: "biweekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Custom", value: "custom" },
];

/**
 * Weekly, monthly and yearly cover the whole week, month or year `anchor`
 * falls in. Bi-weekly is the 14 days starting on `anchor`. Custom uses
 * `custom` as picked.
 */
export function resolvePeriod(
  kind: PeriodKind,
  anchor: Dayjs,
  custom: [Dayjs, Dayjs],
): [Dayjs, Dayjs] {
  switch (kind) {
    case "weekly":
      return [anchor.startOf("week"), anchor.endOf("week")];
    case "biweekly":
      return [anchor.startOf("day"), anchor.add(13, "day").endOf("day")];
    case "monthly":
      return [anchor.startOf("month"), anchor.endOf("month")];
    case "yearly":
      return [anchor.startOf("year"), anchor.endOf("year")];
    case "custom":
      return custom;
  }
}

/** "September 2026", "2026", or "09/27/2026 – 10/03/2026". */
export function describePeriod(kind: PeriodKind, [from, to]: [Dayjs, Dayjs]): string {
  const range = `${from.format("MM/DD/YYYY")} – ${to.format("MM/DD/YYYY")}`;
  switch (kind) {
    case "monthly":
      return from.format("MMMM YYYY");
    case "yearly":
      return from.format("YYYY");
    default:
      return range;
  }
}

export const toIsoDate = (d: Dayjs) => d.format("YYYY-MM-DD");

/** Default anchor: today. */
export const today = () => dayjs().startOf("day");
