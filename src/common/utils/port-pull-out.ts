import dayjs from "dayjs";

import type { PortPullOutRow } from "../../queries/types";

export type PullOutAttention = {
  urgent: number;
  overdue: number;
};

/** Counts deadlines shown by the pull-out attention badges. */
export function getPullOutAttention(rows: PortPullOutRow[]): PullOutAttention {
  const today = dayjs().startOf("day");

  return rows.reduce<PullOutAttention>((counts, row) => {
    const days = dayjs(row.pull_out_before).startOf("day").diff(today, "day");
    if (days <= 3) counts.urgent += 1;
    if (days <= 0) counts.overdue += 1;
    return counts;
  }, { urgent: 0, overdue: 0 });
}
