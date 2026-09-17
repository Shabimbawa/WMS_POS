import { useMemo, type ReactNode } from "react";
import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { DiscrepancyInput, ProductLabel } from "../../../queries/types";
import {
  REASON_COLOR,
  REASON_LABEL,
  fmtInt,
  fmtProduct,
} from "../type-format/format";

/**
 * One row on the resolve page: a declared container line, or an unlisted
 * item the user added. Keyed by product — at most one discrepancy per line.
 */
export interface DiscrepancyLine {
  key: string;
  product: ProductLabel;
  /** 0 for unlisted items. */
  declared: number;
  discrepancy?: DiscrepancyInput;
}

/**
 * What actual_qty_sacks will read after the RPC runs: the declared qty by
 * default (OTHER included, since it writes nothing), otherwise the count.
 */
export const actualOf = (line: DiscrepancyLine) =>
  line.discrepancy && line.discrepancy.reason !== "OTHER"
    ? (line.discrepancy.actual_qty ?? 0)
    : line.declared;

const dash = <span style={{ opacity: 0.45 }}>—</span>;

interface DiscrepancyLineTableProps {
  lines: DiscrepancyLine[];
  renderActions: (line: DiscrepancyLine) => ReactNode;
}

export function DiscrepancyLineTable({
  lines,
  renderActions,
}: DiscrepancyLineTableProps) {
  const columns = useMemo<ColumnDef<DiscrepancyLine, any>[]>(
    () => [
      {
        id: "product",
        header: "Product",
        accessorFn: (r) => fmtProduct(r.product),
        size: 240,
      },
      {
        id: "declared",
        header: "Declared",
        accessorFn: (r) => r.declared,
        size: 100,
        cell: (c) => fmtInt(c.getValue<number>()),
      },
      {
        id: "reason",
        header: "Reason",
        accessorFn: (r) => r.discrepancy?.reason,
        size: 120,
        cell: (c) => {
          const d = c.row.original.discrepancy;
          return d ? (
            <Tag color={REASON_COLOR[d.reason]} style={{ margin: 0 }}>
              {REASON_LABEL[d.reason]}
            </Tag>
          ) : (
            <Tag color="success" style={{ margin: 0 }}>
              Matched
            </Tag>
          );
        },
      },
      {
        id: "actual",
        header: "Actual",
        accessorFn: actualOf,
        size: 100,
        cell: (c) => fmtInt(c.getValue<number>()),
      },
      {
        id: "variance",
        header: "Variance",
        accessorFn: (r) => actualOf(r) - r.declared,
        size: 100,
        cell: (c) => {
          const v = c.getValue<number>();
          if (v === 0) return dash;
          return (
            <span
              style={{
                color: v < 0 ? "var(--ant-color-error, #ff4d4f)" : undefined,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {v > 0 ? `+${fmtInt(v)}` : fmtInt(v)}
            </span>
          );
        },
      },
      {
        id: "note",
        header: "Note",
        accessorFn: (r) => r.discrepancy?.note,
        size: 240,
        cell: (c) => c.getValue<string | null | undefined>() || dash,
      },
      {
        id: "actions",
        header: "",
        accessorFn: (r) => r.key,
        size: 150,
        meta: { fixed: "right" },
        cell: (c) => renderActions(c.row.original),
      },
    ],
    [renderActions],
  );

  return <DataTable data={lines} columns={columns} />;
}
