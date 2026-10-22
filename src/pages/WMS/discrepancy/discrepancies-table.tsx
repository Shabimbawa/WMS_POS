import { useMemo } from "react";
import { Tag, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { fmtTableDate, fmtTableDateTime } from "../../../common/utils/util";
import type {
  ContainerVarianceItem,
  ContainerVarianceRow,
  OpenQuestionRow,
  ShipmentVarianceRow,
} from "../../../queries/types";
import {
  REASON_COLOR,
  REASON_LABEL,
  fmtInt,
  fmtMoney,
  fmtProduct,
} from "../type-format/format";
import { useLanguage, type Translate } from "../../../common/context/language-context";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

const signedSacks = (v: number) =>
  v > 0 ? `+${fmtInt(v)}` : fmtInt(v);

const containerNoCell = (v: string | null, t: Translate) => (
  <span style={{ fontFamily: "var(--mono)" }}>{v ?? t("No box")}</span>
);

// ---- variance: shipment -> container -> product line ------------

const varianceTag = (v: number) =>
  v === 0 ? fmtInt(0) : (
    <Tag color={v < 0 ? "error" : "processing"} style={{ margin: 0 }}>
      {signedSacks(v)}
    </Tag>
  );

const hasVariance = (r: ContainerVarianceRow) =>
  r.variance_sacks !== 0 || r.items_match === false;

/** One row per shipment with at least one unloaded container. */
const shipmentVarianceColumns = (t: Translate): ColumnDef<ShipmentVarianceRow, any>[] => [
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.date_list_received,
    size: 150,
    meta: { fixed: "left" },
    cell: (c) => (
      <div className="shipment-primary-cell">
        <Typography.Text strong>{fmtTableDate(c.getValue<string>())}</Typography.Text>
        <Typography.Text type="secondary">
          {t(c.row.original.supplier_kind === "NATIONAL" ? "National" : "International")}
        </Typography.Text>
      </div>
    ),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier,
    size: 180,
    cell: (c) => (
      <div className="shipment-primary-cell">
        <Typography.Text strong>{c.row.original.supplier}</Typography.Text>
        {c.row.original.supplier_code && (
          <Typography.Text type="secondary">{c.row.original.supplier_code}</Typography.Text>
        )}
      </div>
    ),
  },
  {
    id: "variance_count",
    header: "Containers with variance",
    accessorFn: (r) => r.variance_count,
    size: 190,
    cell: (c) => {
      const r = c.row.original;
      const pending = r.container_count - r.unloaded_count;
      return (
        <div className="shipment-primary-cell">
          <div>
            <Tag color={r.variance_count ? "error" : "success"} style={{ margin: 0 }}>
              {fmtInt(r.variance_count)} / {fmtInt(r.unloaded_count)}
            </Tag>
          </div>
          <Typography.Text type="secondary">
            {pending
              ? t("{count} not unloaded yet", { count: pending })
              : t("All containers unloaded")}
          </Typography.Text>
        </div>
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
  {
    id: "last_unloaded",
    header: "Last unloaded",
    accessorFn: (r) => r.last_unloaded,
    size: 140,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? fmtTableDate(v) : dash;
    },
  },
];

/** The unloaded containers of one shipment, shown when its row is expanded. */
const containerVarianceColumns = (t: Translate): ColumnDef<ContainerVarianceRow, any>[] => [
  {
    id: "container_no",
    header: "Container / shipping line",
    accessorFn: (r) => r.container_no,
    size: 210,
    cell: (c) => {
      const r = c.row.original;
      return (
        <div className="shipment-primary-cell">
          {containerNoCell(r.container_no, t)}
          <Typography.Text type="secondary">
            {r.shipping_company
              ? [r.shipping_company, r.shipping_company_code].filter(Boolean).join(" · ")
              : t("No shipping line")}
          </Typography.Text>
        </div>
      );
    },
  },
  {
    id: "date_unloaded",
    header: "Unloaded",
    accessorFn: (r) => r.date_unloaded,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? fmtTableDate(v) : dash;
    },
  },
  {
    id: "discrepancy_count",
    header: "Issues",
    accessorFn: (r) => r.discrepancy_count,
    size: 110,
    // Red when the container varies; open it for the per-product counts.
    cell: (c) => hasVariance(c.row.original)
      ? <Tag color="error" style={{ margin: 0 }}>{fmtInt(c.getValue<number>())} {t(c.getValue<number>() === 1 ? "issue" : "issues")}</Tag>
      : <Tag color="success" style={{ margin: 0 }}>{t("Matched")}</Tag>,
  },
  {
    id: "notes",
    header: "Notes",
    accessorFn: (r) => r.notes,
    size: 240,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? (
        <Typography.Text type="secondary" ellipsis={{ tooltip: v }} style={{ maxWidth: 220 }}>
          {v}
        </Typography.Text>
      ) : dash;
    },
  },
];

/** The lines of one container, shown when its row is expanded. */
const varianceItemColumns = (t: Translate): ColumnDef<ContainerVarianceItem, any>[] => [
  {
    id: "product",
    header: "Product",
    accessorFn: (r) =>
      fmtProduct({
        code: r.code,
        brand: r.brand,
        variety: r.variety,
        size_kg: r.size_kg,
      }),
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
    cell: (c) => fmtInt(c.getValue<number | null>()),
  },
  {
    id: "variance",
    header: "Variance",
    accessorFn: (r) => r.variance,
    size: 110,
    cell: (c) => varianceTag(c.getValue<number>()),
  },
  {
    id: "price_per_sack",
    header: "Price / sack",
    accessorFn: (r) => r.price_per_sack,
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
      if (!list.length) return <Tag color="success">{t("Matched")}</Tag>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.map((d) => (
            // A resolved issue still happened, so it stays listed — just dimmed.
            <div
              key={d.id}
              style={{ display: "flex", gap: 8, opacity: d.resolved_at ? 0.5 : 1 }}
            >
              <Tag color={REASON_COLOR[d.reason]} style={{ margin: 0 }}>
                {t(REASON_LABEL[d.reason])}
                {d.actual_qty === null ? "" : ` ${fmtInt(d.actual_qty)}`}
              </Tag>
              <span style={{ whiteSpace: "normal" }}>{d.note ?? dash}</span>
              {d.resolved_at && <Tag style={{ margin: 0 }}>{t("resolved")}</Tag>}
            </div>
          ))}
        </div>
      );
    },
  },
];

function ContainerVarianceTable({ data }: { data: ContainerVarianceRow[] }) {
  const { t } = useLanguage();
  const columns = useMemo(() => containerVarianceColumns(t), [t]);
  const itemColumns = useMemo(() => varianceItemColumns(t), [t]);
  // Containers with a variance first; the API already orders by unload date.
  const rows = useMemo(
    () => [...data].sort((a, b) => Number(hasVariance(b)) - Number(hasVariance(a))),
    [data],
  );
  return (
    <div className="shipment-expanded">
      <DataTable
        data={rows}
        columns={columns}
        renderExpanded={(row) =>
          row.container_items?.length ? (
            <DataTable data={row.container_items} columns={itemColumns} />
          ) : null
        }
      />
    </div>
  );
}

export function VarianceTable({ data }: { data: ShipmentVarianceRow[] }) {
  const { t } = useLanguage();
  const columns = useMemo(() => shipmentVarianceColumns(t), [t]);
  return (
    <DataTable
      data={data}
      columns={columns}
      renderExpanded={(row) =>
        row.containers.length ? <ContainerVarianceTable data={row.containers} /> : null
      }
    />
  );
}

// ---- v_open_questions --------------------------------------------

const openQuestionColumns = (t: Translate): ColumnDef<OpenQuestionRow, any>[] => [
  {
    id: "created_at",
    header: "Logged",
    accessorFn: (r) => r.created_at,
    size: 170,
    meta: { fixed: "left" },
    cell: (c) => fmtTableDateTime(c.getValue<string>()),
  },
  {
    id: "container_no",
    header: "Container",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => containerNoCell(c.getValue<string | null>(), t),
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
  const { t } = useLanguage();
  return <DataTable data={data} columns={openQuestionColumns(t)} />;
}
