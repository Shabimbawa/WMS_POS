import { useMemo } from "react";
import { Card, Flex, Progress, Tag, Typography } from "antd";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { LabelValue, OverflowList } from "../../../common/items/overflow-list/overflow-list";
import type { ContainerStatus, ShipmentRow } from "../../../queries/types";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  fmtInt,
  fmtProduct,
} from "../type-format/format";
import { fmtTableDate } from "../../../common/utils/util";
import { ContainerActions } from "./container-actions";
import { ShipmentActions } from "./shipment-actions";
import { useLanguage, type Translate } from "../../../common/context/language-context";

/** Rows here are packing lists, with containers nested underneath. */
export const containerColumns = (t: Translate): ColumnDef<ShipmentRow, any>[] => [
  {
    id: "date_list_received",
    header: "List received",
    accessorFn: (r) => r.date_list_received,
    size: 140,
    meta: { fixed: "left" },
    cell: (c) => fmtTableDate(c.getValue<string>()),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier.name,
    size: 130,
  },

  {
    id: "container_count",
    header: "Container count",
    accessorFn: (r) => r.container.length,
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "containers",
    header: "Container nos.",
    accessorFn: (r) => r.container.length,
    size: 320,
    cell: (c) => {
      const list = c.row.original.container;
      if (!list.length) return <span style={{ opacity: 0.45 }}>—</span>;
      return (
        <OverflowList
          items={list}
          max={4}
          layout="inline"
          getKey={(ct) => ct.id}
          title={`${list.length} ${t("containers")}`}
          renderItem={(ct) => (
            <Tag
              color={STATUS_COLOR[ct.status]}
              style={{ margin: 0, fontFamily: "var(--mono)" }}
            >
              {ct.container_no ?? t("No box")}
            </Tag>
          )}
        />
      );
    },
  },
  {
    id: "brands",
    header: "Brands",
    accessorFn: (r) => r.container.length,
    size: 200,
    cell: (c) => {
      const brands = new Set<string>();
      c.row.original.container.forEach((ct) =>
        ct.container_item.forEach((i) =>
          brands.add(fmtProduct(i.product_category)),
        ),
      );
      if (!brands.size) return <span style={{ opacity: 0.45 }}>—</span>;
      return (
        <OverflowList
          items={[...brands]}
          max={2}
          getKey={(b) => b}
          title={`${brands.size} ${t("brands")}`}
          renderItem={(b) => b}
        />
      );
    },
  },
  {
    id: "total_sacks",
    header: "Sacks",
    accessorFn: (r) =>
      r.container.reduce(
        (n, ct) => n + ct.container_item.reduce((m, i) => m + i.qty_sacks, 0),
        0,
      ),
    size: 110,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "progress",
    header: "Unloaded",
    accessorFn: (r) => r.container.filter((c) => c.date_unloaded).length,
    size: 120,
    cell: (c) => {
      const list = c.row.original.container;
      const done = list.filter((ct) => ct.date_unloaded).length;
      return `${done} / ${list.length}`;
    },
  },
  {
    id: "print",
    header: "",
    accessorFn: (r) => r.id,
    size: 96,
    meta: { fixed: "right" },
    cell: (c) => <ShipmentActions shipment={c.row.original} />,
  },
];

type ShipmentContainer = ShipmentRow["container"][number];

const dash = <span style={{ opacity: 0.45 }}>—</span>;

/** One row per container inside a packing list, shown when it's expanded. */
export const shipmentContainerColumns = (t: Translate): ColumnDef<ShipmentContainer, any>[] => [
  {
    id: "container_no",
    header: "Container no.",
    accessorFn: (r) => r.container_no,
    size: 150,
    cell: (c) => (
      <span style={{ fontFamily: "var(--mono)" }}>
        {c.getValue<string | null>() ?? t("No box")}
      </span>
    ),
  },
  {
    id: "shipping_company",
    header: "Shipping line",
    accessorFn: (r) => r.shipping_company?.name ?? null,
    size: 160,
    cell: (c) => {
      const sc = c.row.original.shipping_company;
      if (!sc) return dash;
      return sc.code ? `${sc.name} (${sc.code})` : sc.name;
    },
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    size: 110,
    cell: (c) => (
      <Tag color={STATUS_COLOR[c.getValue<string>()]} style={{ margin: 0 }}>
        {t(STATUS_LABEL[c.getValue<ContainerStatus>()])}
      </Tag>
    ),
  },
  {
    id: "hauling",
    header: "Hauling",
    accessorFn: (r) => r.is_company_truck,
    size: 160,
    cell: (c) => {
      const container = c.row.original;
      if (container.is_company_truck === null) return t("Not assigned");
      if (container.is_company_truck) return t("Own truck");
      return container.hauler ?? t("Third-party hauler");
    },
  },
  {
    id: "items",
    header: "Brands",
    accessorFn: (r) => r.container_item.length,
    size: 300,
    // Sacks per brand. The declared figure, plus the counted one after unload
    // when the two disagree — the Sacks column holds the container total.
    cell: (c) => {
      const items = c.row.original.container_item;
      if (!items.length) return dash;
      return (
        <OverflowList
          items={items}
          max={3}
          getKey={(i) => i.id}
          title={`${items.length} ${t("brands")}`}
          renderItem={(i) => {
            const counted =
              i.actual_qty_sacks !== null && i.actual_qty_sacks !== i.qty_sacks
                ? i.actual_qty_sacks
                : null;
            return (
              <LabelValue
                label={fmtProduct(i.product_category)}
                value={
                  <>
                    {fmtInt(i.qty_sacks)}
                    {counted !== null && (
                      <span
                        style={{
                          color:
                            counted < i.qty_sacks
                              ? "var(--ant-color-error, #ff4d4f)"
                              : "var(--ant-color-success, #52c41a)",
                        }}
                      >
                        {" → "}
                        {fmtInt(counted)}
                      </span>
                    )}
                  </>
                }
              />
            );
          }}
        />
      );
    },
  },
  {
    id: "sacks",
    header: "Sacks",
    accessorFn: (r) => r.container_item.reduce((n, i) => n + i.qty_sacks, 0),
    size: 90,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "date_arrived_at_port",
    header: "At port",
    // Skippable: containers are often only noticed once already delivered.
    accessorFn: (r) => r.date_arrived_at_port,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? fmtTableDate(v) : dash;
    },
  },
  {
    id: "date_delivered",
    header: "Delivered",
    accessorFn: (r) => r.date_delivered,
    size: 130,
    cell: (c) => {
      const v = c.getValue<string | null>();
      return v ? fmtTableDate(v) : dash;
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
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 230,
    meta: { fixed: "right" },
    cell: (c) => <ContainerActions container={c.row.original} />,
  },
];

const shipmentOverviewColumns = (t: Translate): ColumnDef<ShipmentRow, any>[] => [
  {
    id: "received",
    header: "Received / reference",
    accessorFn: (row) => row.date_list_received,
    size: 185,
    meta: { fixed: "left" },
    cell: (cell) => <div className="shipment-primary-cell">
      <Typography.Text strong>{fmtTableDate(cell.row.original.date_list_received)}</Typography.Text>
      <Typography.Text type="secondary">{cell.row.original.reference || t("No reference")}</Typography.Text>
    </div>,
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (row) => row.supplier.name,
    size: 190,
    cell: (cell) => <div className="shipment-primary-cell">
      <Typography.Text strong>{cell.row.original.supplier.name}</Typography.Text>
      {cell.row.original.supplier.code && <Typography.Text type="secondary">{cell.row.original.supplier.code}</Typography.Text>}
    </div>,
  },
  {
    id: "containers",
    header: "Containers",
    accessorFn: (row) => row.container.length,
    size: 330,
    cell: (cell) => {
      const containers = cell.row.original.container;
      return <div className="shipment-primary-cell">
        <Typography.Text type="secondary">{containers.length} {t(containers.length === 1 ? "container" : "containers")}</Typography.Text>
        <OverflowList items={containers} max={4} layout="inline" getKey={(item) => item.id} title={`${containers.length} ${t("containers")}`} renderItem={(item) => <Tag color={STATUS_COLOR[item.status]} style={{ margin: 0, fontFamily: "var(--mono)" }}>{item.container_no || t("No box")}</Tag>} />
      </div>;
    },
  },
  {
    id: "load",
    header: "Load summary",
    accessorFn: (row) => row.container.length,
    size: 240,
    cell: (cell) => {
      const products = new Set(cell.row.original.container.flatMap((container) => container.container_item.map((item) => fmtProduct(item.product_category))));
      const sacks = cell.row.original.container.reduce((sum, container) => sum + container.container_item.reduce((subtotal, item) => subtotal + item.qty_sacks, 0), 0);
      return <div className="shipment-primary-cell"><Typography.Text strong>{fmtInt(sacks)} {t("sacks")}</Typography.Text><Typography.Text type="secondary">{products.size} {t(products.size === 1 ? "product" : "products")}</Typography.Text></div>;
    },
  },
  {
    id: "progress",
    header: "Progress",
    accessorFn: (row) => row.container.filter((container) => container.status === "UNLOADED" || container.status === "CANCELLED").length,
    size: 210,
    cell: (cell) => {
      const containers = cell.row.original.container;
      const complete = containers.filter((container) => container.status === "UNLOADED" || container.status === "CANCELLED").length;
      const percent = containers.length ? Math.round((complete / containers.length) * 100) : 0;
      return <div className="shipment-progress-cell"><Flex justify="space-between"><Typography.Text type="secondary">{complete} / {containers.length} {t("complete")}</Typography.Text><Typography.Text strong>{percent}%</Typography.Text></Flex><Progress percent={percent} showInfo={false} size="small" /></div>;
    },
  },
  { id: "actions", header: "", accessorFn: (row) => row.id, size: 96, meta: { fixed: "right" }, cell: (cell) => <ShipmentActions shipment={cell.row.original} /> },
];

const containerOverviewColumns = (t: Translate): ColumnDef<ShipmentContainer, any>[] => [
  {
    id: "container",
    header: "Container / shipping line",
    accessorFn: (row) => row.container_no,
    size: 230,
    cell: (cell) => { const row = cell.row.original; return <div className="shipment-primary-cell"><Typography.Text strong code>{row.container_no || t("No box")}</Typography.Text><Typography.Text type="secondary">{row.shipping_company ? [row.shipping_company.name, row.shipping_company.code].filter(Boolean).join(" · ") : t("No shipping line")}</Typography.Text></div>; },
  },
  {
    id: "status",
    header: "Status / hauling",
    accessorFn: (row) => row.status,
    size: 190,
    cell: (cell) => { const row = cell.row.original; const hauling = row.is_company_truck === null ? t("Hauling not assigned") : row.is_company_truck ? t("Own truck") : row.hauler || t("Third-party hauler"); return <div className="shipment-primary-cell"><div><Tag color={STATUS_COLOR[row.status]} style={{ margin: 0 }}>{t(STATUS_LABEL[row.status])}</Tag></div><Typography.Text type="secondary">{hauling}</Typography.Text></div>; },
  },
  {
    id: "load",
    header: "Declared load",
    accessorFn: (row) => row.container_item.length,
    size: 330,
    cell: (cell) => { const items = cell.row.original.container_item; return items.length ? <OverflowList items={items} max={3} getKey={(item) => item.id} title={`${items.length} ${t("products")}`} renderItem={(item) => <LabelValue label={fmtProduct(item.product_category)} value={fmtInt(item.actual_qty_sacks ?? item.qty_sacks)} />} /> : dash; },
  },
  {
    id: "timeline",
    header: "Timeline",
    accessorFn: (row) => row.date_arrived_at_port,
    size: 310,
    cell: (cell) => { const row = cell.row.original; return <div className="shipment-timeline"><span><small>{t("At port")}</small>{row.date_arrived_at_port ? fmtTableDate(row.date_arrived_at_port) : "—"}</span><span><small>{t("Delivered")}</small>{row.date_delivered ? fmtTableDate(row.date_delivered) : "—"}</span><span><small>{t("Unloaded")}</small>{row.date_unloaded ? fmtTableDate(row.date_unloaded) : "—"}</span></div>; },
  },
  { id: "actions", header: "", accessorFn: (row) => row.id, size: 230, meta: { fixed: "right" }, cell: (cell) => <ContainerActions container={cell.row.original} /> },
];

export function ContainerTable({ data }: { data: ShipmentRow[] }) {
  const { t } = useLanguage();
  const columns = useMemo(() => shipmentOverviewColumns(t), [t]);
  const containerCount = data.reduce((sum, shipment) => sum + shipment.container.length, 0);
  const sacks = data.reduce((sum, shipment) => sum + shipment.container.reduce((subtotal, container) => subtotal + container.container_item.reduce((quantity, item) => quantity + item.qty_sacks, 0), 0), 0);
  const complete = data.reduce((sum, shipment) => sum + shipment.container.filter((container) => container.status === "UNLOADED" || container.status === "CANCELLED").length, 0);
  return (
    <Card size="small" className="shipment-notebook-card" title={<div><Typography.Text strong>{t("Shipment overview")}</Typography.Text><Typography.Text type="secondary" className="port-table-subtitle">{t("Select a row to view and update its containers")}</Typography.Text></div>} extra={<Flex gap={20} className="shipment-table-totals"><span><strong>{data.length}</strong> {t("shipments")}</span><span><strong>{containerCount}</strong> {t("containers")}</span><span><strong>{fmtInt(sacks)}</strong> {t("sacks")}</span><span><strong>{complete}</strong> {t("complete")}</span></Flex>}>
      <DataTable data={data} columns={columns} renderExpanded={(shipment) => shipment.container.length ? <div className="shipment-expanded"><DataTable data={shipment.container} columns={containerOverviewColumns(t)} /></div> : null} />
    </Card>
  );
}
