import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";

import { DataTable } from "../../../common/items/table/table";
import { DateParser } from "../../../common/utils/util";
import type {
  ContainerVarianceItem,
  ContainerVarianceRow,
  OpenQuestionRow,
} from "../../../queries/types";
import {
  REASON_COLOR,
  REASON_LABEL,
  fmtInt,
  fmtMoney,
  fmtProduct,
  toNum,
} from "../type-format/format";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

const signedSacks = (v: number) =>
  v > 0 ? `+${fmtInt(v)}` : fmtInt(v);

const containerNoCell = (v: string | null) => (
  <span style={{ fontFamily: "monospace" }}>{v ?? "no box"}</span>
);

// ---- v_container_variance ----------------------------------------

const varianceColumns: ColumnDef<ContainerVarianceRow, any>[] = [
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => containerNoCell(c.getValue<string | null>()),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier,
    size: 130,
  },
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.date_list_received,
    size: 140,
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "date_unloaded",
    header: "Unloaded",
    accessorFn: (r) => r.date_unloaded,
    size: 140,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? DateParser(v) : dash;
    },
  },
  {
    id: "items_match",
    header: "Items match",
    accessorFn: (r) => r.items_match,
    size: 110,
    cell: (c) => {
      const v = c.getValue<boolean | null>();
      if (v === null) return dash;
      return v ? <Tag color="success">Yes</Tag> : <Tag color="error">No</Tag>;
    },
  },
  {
    id: "declared_sacks",
    header: "Declared",
    accessorFn: (r) => r.declared_sacks,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "actual_sacks",
    header: "Actual",
    accessorFn: (r) => r.actual_sacks,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "variance_sacks",
    header: "Variance",
    accessorFn: (r) => r.variance_sacks,
    size: 110,
    // actual − declared: negative is a shortfall
    cell: (c) => {
      const v = c.getValue<number>();
      if (v === 0) return fmtInt(0);
      return (
        <Tag color={v < 0 ? "error" : "processing"} style={{ margin: 0 }}>
          {signedSacks(v)}
        </Tag>
      );
    },
  },
  {
    id: "discrepancy_count",
    header: "Issues",
    // container_items is null only for a container with no lines at all;
    // a matched line comes back with an empty discrepancies array.
    accessorFn: (r) =>
      (r.container_items ?? []).reduce(
        (n, i) => n + (i.discrepancies?.length ?? 0),
        0,
      ),
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
];

/** The lines of one container, shown when its row is expanded. */
const varianceItemColumns: ColumnDef<ContainerVarianceItem, any>[] = [
  {
    id: "product",
    header: "Product",
    accessorFn: (r) => (r.code ? `${r.code} · ${r.product_name}` : r.product_name),
    size: 220,
  },
  {
    id: "declared_qty",
    header: "Declared",
    accessorFn: (r) => r.declared_qty,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "actual_qty",
    header: "Actual",
    accessorFn: (r) => r.actual_qty,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "variance",
    header: "Variance",
    accessorFn: (r) => r.variance,
    size: 110,
    cell: (c) => {
      const v = c.getValue<number>();
      if (v === 0) return fmtInt(0);
      return (
        <Tag color={v < 0 ? "error" : "processing"} style={{ margin: 0 }}>
          {signedSacks(v)}
        </Tag>
      );
    },
  },
  {
    id: "price_per_sack",
    header: "Price / sack",
    // numeric over PostgREST, and absent on lines with no price recorded
    accessorFn: (r) =>
      r.price_per_sack === null || r.price_per_sack === undefined
        ? null
        : toNum(r.price_per_sack),
    size: 130,
    cell: (c) => fmtMoney(c.getValue<number | null>()),
  },
  {
    id: "discrepancies",
    header: "Issues",
    accessorFn: (r) => r.discrepancies?.length ?? 0,
    size: 320,
    cell: (c) => {
      const list = c.row.original.discrepancies ?? [];
      if (!list.length) return <Tag color="success">Matched</Tag>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 8 }}>
              <Tag color={REASON_COLOR[d.reason]} style={{ margin: 0 }}>
                {REASON_LABEL[d.reason]}
                {d.actual_qty === null ? "" : ` ${fmtInt(d.actual_qty)}`}
              </Tag>
              <span style={{ whiteSpace: "normal" }}>{d.note ?? dash}</span>
            </div>
          ))}
        </div>
      );
    },
  },
];

export function VarianceTable({ data }: { data: ContainerVarianceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={varianceColumns}
      renderExpanded={(row) =>
        row.container_items?.length ? (
          <DataTable data={row.container_items} columns={varianceItemColumns} />
        ) : null
      }
    />
  );
}

// ---- v_open_questions --------------------------------------------

const openQuestionColumns: ColumnDef<OpenQuestionRow, any>[] = [
  {
    id: "created_at",
    header: "Logged",
    accessorFn: (r) => r.created_at,
    size: 170,
    meta: { fixed: "left" },
    cell: (c) => dayjs(c.getValue<string>()).format("MMM DD, YYYY h:mm A"),
  },
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => containerNoCell(c.getValue<string | null>()),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier,
    size: 130,
  },
  {
    id: "product",
    header: "Product",
    // the view carries no code, so the label is brand + variety + size
    accessorFn: (r) =>
      fmtProduct({
        code: null,
        brand: r.brand,
        variety: r.variety,
        size_kg: r.size_kg,
      }),
    size: 220,
  },
  {
    id: "note",
    header: "Note",
    accessorFn: (r) => r.note,
    size: 360,
    cell: (c) => (
      <span style={{ whiteSpace: "normal" }}>
        {c.getValue<string | null>() ?? dash}
      </span>
    ),
  },
];

export function OpenQuestionsTable({ data }: { data: OpenQuestionRow[] }) {
  return <DataTable data={data} columns={openQuestionColumns} />;
}
