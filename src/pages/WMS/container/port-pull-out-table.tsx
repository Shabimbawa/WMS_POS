import { useMemo, useState } from "react";
import { Alert, Card, Empty, Flex, Input, Segmented, Skeleton, Table, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import { usePortPullOuts } from "../../../queries/useHooks";
import type { PortPullOutRow } from "../../../queries/types";
import { fmtTableDate } from "../../../common/utils/util";
import { useLanguage } from "../../../common/context/language-context";

type UrgencyLevel = "overdue" | "soon" | "on-track";
type Filter = "all" | UrgencyLevel;

function urgency(row: PortPullOutRow) {
  const days = dayjs(row.pull_out_before).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days < 0) return { days, level: "overdue" as const, color: "red", label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` };
  if (days === 0) return { days, level: "overdue" as const, color: "red", label: "Due today" };
  if (days <= 3) return { days, level: "soon" as const, color: "orange", label: `${days} day${days === 1 ? "" : "s"} remaining` };
  return { days, level: "on-track" as const, color: "default", label: `${days} days remaining` };
}

function exactDeadlineText(row: PortPullOutRow) {
  const { days } = urgency(row);
  const container = row.container_no ? `Container ${row.container_no}` : "Container";
  const deadline = fmtTableDate(row.pull_out_before);
  if (days < 0) return `${container} is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue (deadline ${deadline}).`;
  if (days === 0) return `${container} is due today (${deadline}).`;
  if (days === 1) return `${container} is due tomorrow (${deadline}).`;
  return `${container} is due in ${days} days (${deadline}).`;
}

export function PortPullOutTable({ kind }: { kind: "INTERNATIONAL" | "NATIONAL" }) {
  const { t } = useLanguage();
  const { data = [], isPending, isError, error } = usePortPullOuts(kind);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const counts = useMemo(() => data.reduce((result, row) => {
    result[urgency(row).level] += 1;
    return result;
  }, { overdue: 0, soon: 0, "on-track": 0 }), [data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.filter((row) => {
      if (filter !== "all" && urgency(row).level !== filter) return false;
      if (!needle) return true;
      return [row.container_no, row.shipping_company, row.shipping_company_code, row.supplier, row.shipment_reference]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [data, filter, search]);
  const attentionRows = data.filter((row) => urgency(row).days <= 3);
  const attentionDescription = attentionRows.length === 1
    ? exactDeadlineText(attentionRows[0])
    : attentionRows.length > 1
      ? `${attentionRows.length} containers need attention. Nearest deadline: ${exactDeadlineText(attentionRows[0])}`
      : "";

  if (isPending) return <Card size="small"><Skeleton active paragraph={{ rows: 6 }} /></Card>;
  if (isError) return <Alert type="error" showIcon message={t("Could not load port pull-out deadlines")} description={(error as Error).message} />;

  return <div className="port-pullout-view">
    <Alert
      type="info"
      showIcon
      message={t("Read-only monitoring view")}
      description={t("This tab is for monitoring pull-out deadlines only. To make changes, return to the Active tab and open the shipment or container.")}
    />

    <div className="port-summary-grid">
      <button type="button" className={`port-summary-item${filter === "all" ? " is-active" : ""}`} onClick={() => setFilter("all")}>
        <span>{t("At port")}</span><strong>{data.length}</strong><small>{t("Active containers")}</small>
      </button>
      <button type="button" className={`port-summary-item port-summary-danger${filter === "overdue" ? " is-active" : ""}`} onClick={() => setFilter("overdue")}>
        <span>{t("Overdue / due today")}</span><strong>{counts.overdue}</strong><small>{t("Requires immediate action")}</small>
      </button>
      <button type="button" className={`port-summary-item port-summary-warning${filter === "soon" ? " is-active" : ""}`} onClick={() => setFilter("soon")}>
        <span>{t("Due within 3 days")}</span><strong>{counts.soon}</strong><small>{t("Plan pull-out now")}</small>
      </button>
      <button type="button" className={`port-summary-item${filter === "on-track" ? " is-active" : ""}`} onClick={() => setFilter("on-track")}>
        <span>{t("On track")}</span><strong>{counts["on-track"]}</strong><small>{t("More than 3 days")}</small>
      </button>
    </div>

    {(counts.overdue > 0 || counts.soon > 0) && <Alert
      type={counts.overdue > 0 ? "error" : "warning"}
      showIcon
      message={t("Port pull-out attention required")}
      description={t(attentionDescription)}
    />}

    <Card
      size="small"
      title={<div><Typography.Text strong>{t("Containers awaiting pull-out")}</Typography.Text><Typography.Text type="secondary" className="port-table-subtitle">{t("Sorted by the nearest deadline first")}</Typography.Text></div>}
      extra={<Input allowClear prefix={<SearchOutlined />} placeholder={t("Search container, company, or supplier")} value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 290 }} />}
    >
      <Flex justify="space-between" align="center" wrap gap={10} className="port-table-toolbar">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[
          { label: t("All"), value: "all" },
          { label: t("Overdue"), value: "overdue" },
          { label: t("Due soon"), value: "soon" },
          { label: t("On track"), value: "on-track" },
        ]} />
        <Typography.Text type="secondary">{t("{count} container(s)", { count: filtered.length })}</Typography.Text>
      </Flex>
      {filtered.length ? <Table<PortPullOutRow>
        className="port-pullout-table"
        rowKey="id"
        size="middle"
        pagination={filtered.length > 25 ? { pageSize: 25, showSizeChanger: false } : false}
        scroll={{ x: 980 }}
        dataSource={filtered}
        rowClassName={(row) => `port-row-${urgency(row).level}`}
        columns={[
          { title: t("Container"), dataIndex: "container_no", width: 145, fixed: "left", render: (value) => <Typography.Text strong code>{value || t("No box")}</Typography.Text> },
          { title: t("Shipping company"), width: 190, render: (_, row) => <div><Typography.Text strong>{row.shipping_company || "—"}</Typography.Text>{row.shipping_company_code && <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>{row.shipping_company_code}</Typography.Text>}</div> },
          { title: t("Supplier / shipment"), width: 210, render: (_, row) => <div><Typography.Text>{row.supplier}</Typography.Text><Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>{row.shipment_reference || t("No reference")}</Typography.Text></div> },
          { title: t("Arrived at port"), dataIndex: "date_arrived_at_port", width: 145, render: fmtTableDate },
          { title: t("Pull out before"), dataIndex: "pull_out_before", width: 150, render: (value) => <Typography.Text strong>{fmtTableDate(value)}</Typography.Text> },
          { title: t("Deadline status"), width: 170, fixed: "right", render: (_, row) => { const item = urgency(row); return <Tag color={item.color} style={{ margin: 0 }}>{t(item.label)}</Tag>; } },
        ]}
      /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search || filter !== "all" ? t("No containers match these filters") : t("No containers are currently waiting at the port")} />}
    </Card>
  </div>;
}
