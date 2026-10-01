import { useMemo } from "react";
import { Flex, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { DailyReportKind } from "../../../queries/types";
import { fmtInt } from "../type-format/format";
import { cellText, REPORT_KIND_LABEL, type BrandGrid } from "./report-grid";

/** A product row, or the Total Sacks footer row. */
type GridTableRow = {
  key: string;
  label: string;
  color?: string;
  values: number[];
  total: number;
  isTotal: boolean;
};

const twoLineHeader = (top: string, label: string) => (
  <div style={{ textAlign: "center", lineHeight: 1.25 }}>
    <div style={{ fontWeight: 400, fontSize: 12, opacity: 0.75 }}>{top}</div>
    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ant-color-primary, #1677ff)" }}>{label}</div>
  </div>
);

const headerStyle = { fontWeight: 700, fontSize: 15, color: "var(--ant-color-primary, #1677ff)" };

/**
 * One brand's timeframe: product rows, a column per day (or month) with
 * sacks, the row's total on the right and a Total Sacks row at the bottom.
 */
export function TimeframeGrid({ grid, kind }: { grid: BrandGrid; kind: DailyReportKind }) {
  const columns = useMemo<ColumnDef<GridTableRow, any>[]>(() => [
    {
      id: "label",
      header: () => <span style={headerStyle}>Kind</span>,
      accessorFn: (r) => r.label,
      size: 160,
      meta: { fixed: "left" },
      cell: (c) => (
        <span style={{ fontWeight: 700, color: c.row.original.isTotal ? headerStyle.color : c.row.original.color }}>
          {c.getValue<string>()}
        </span>
      ),
    },
    ...grid.columns.map<ColumnDef<GridTableRow, any>>((col, i) => ({
      id: col.key,
      header: () => twoLineHeader(col.top, col.label),
      accessorFn: (r) => r.values[i],
      size: 96,
      cell: (c) => (
        <div style={{ textAlign: "center", fontWeight: c.row.original.isTotal ? 700 : undefined }}>
          {c.row.original.isTotal ? fmtInt(c.getValue<number>()) : cellText(c.getValue<number>())}
        </div>
      ),
    })),
    // No width: takes the leftover space, so the days pack left and the
    // total sits at the right edge, as on the printed sheet.
    { id: "spacer", header: "", accessorFn: () => null, cell: () => null },
    {
      id: "total",
      header: () => <div style={{ ...headerStyle, textAlign: "right", lineHeight: 1.25 }}>Total<br />Sacks</div>,
      accessorFn: (r) => r.total,
      size: 110,
      meta: { fixed: "right" },
      cell: (c) => (
        <div style={{ textAlign: "right", fontWeight: 700, opacity: c.row.original.isTotal ? 1 : 0.75 }}>
          {fmtInt(c.getValue<number>())}
        </div>
      ),
    },
  ], [grid]);

  const data = useMemo<GridTableRow[]>(() => [
    ...grid.rows.map((row) => ({
      key: row.product.id,
      label: row.label,
      color: row.color,
      values: row.values,
      total: row.total,
      isTotal: false,
    })),
    { key: "total", label: "Total Sacks", values: grid.totals, total: grid.grandTotal, isTotal: true },
  ], [grid]);

  return (
    <div>
      <div style={{ borderBottom: "1px solid var(--ant-color-border, #d9d9d9)", paddingBottom: 10, marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>{grid.brand} Timeframe</Typography.Title>
        <Typography.Text type="secondary">{REPORT_KIND_LABEL[kind]}</Typography.Text>
      </div>
      {grid.columns.length ? (
        <DataTable data={data} columns={columns} />
      ) : (
        <Flex justify="center" style={{ padding: 16 }}>
          <Typography.Text type="secondary">No sacks in this period</Typography.Text>
        </Flex>
      )}
    </div>
  );
}
