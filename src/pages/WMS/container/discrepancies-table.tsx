import { Tag } from "antd";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";

import { DataTable } from "../../../common/items/table/table";
import { DateParser } from "../../../common/utils/util";
import type {
  ContainerVarianceRow,
  OpenQuestionRow,
} from "../../../queries/types";
import { fmtInt, fmtProduct } from "../type-format/format";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

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
          {v > 0 ? `+${fmtInt(v)}` : fmtInt(v)}
        </Tag>
      );
    },
  },
  {
    id: "discrepancy_count",
    header: "Issues",
    accessorFn: (r) => r.discrepancy_count,
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
];

export function VarianceTable({ data }: { data: ContainerVarianceRow[] }) {
  return <DataTable data={data} columns={varianceColumns} />;
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
