import { Alert, Card, Empty, Skeleton, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";

import { usePortPullOuts } from "../../../queries/useHooks";
import type { PortPullOutRow } from "../../../queries/types";
import { fmtTableDate } from "../../../common/utils/util";
import { useLanguage } from "../../../common/context/language-context";

function urgency(row: PortPullOutRow) {
  const days = dayjs(row.pull_out_before).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days < 0) return { days, color: "red", label: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` };
  if (days === 0) return { days, color: "red", label: "Due today" };
  if (days <= 3) return { days, color: "orange", label: `${days} day${days === 1 ? "" : "s"} remaining` };
  return { days, color: "default", label: `${days} days remaining` };
}

export function PortPullOutTable() {
  const { t } = useLanguage();
  const { data = [], isPending, isError, error } = usePortPullOuts();
  if (isPending) return <Card size="small"><Skeleton active paragraph={{ rows: 6 }} /></Card>;
  if (isError) return <Alert type="error" showIcon message={t("Could not load port pull-out deadlines")} description={(error as Error).message} />;
  const urgent = data.filter((row) => urgency(row).days <= 3).length;
  return <>
    {urgent > 0 && <Alert type="warning" showIcon message={t("Port pull-out attention required")} description={t("{count} container(s) are due within 3 days or overdue.", { count: urgent })} />}
    <Card size="small" style={{ marginTop: urgent ? 16 : 0 }}>
      {data.length ? <Table<PortPullOutRow>
        rowKey="id"
        pagination={false}
        scroll={{ x: 900 }}
        dataSource={data}
        columns={[
          { title: t("Container no."), dataIndex: "container_no", width: 150, fixed: "left", render: (value) => <Typography.Text code>{value || t("No box")}</Typography.Text> },
          { title: t("Shipping company"), width: 190, render: (_, row) => row.shipping_company_code ? `${row.shipping_company} (${row.shipping_company_code})` : row.shipping_company || "—" },
          { title: t("Supplier"), dataIndex: "supplier", width: 180 },
          { title: t("Shipment reference"), dataIndex: "shipment_reference", width: 170, render: (value) => value || "—" },
          { title: t("Arrival at port"), dataIndex: "date_arrived_at_port", width: 140, render: fmtTableDate },
          { title: t("Pull out before"), dataIndex: "pull_out_before", width: 150, render: (value) => <strong>{fmtTableDate(value)}</strong> },
          { title: t("Time remaining"), width: 160, fixed: "right", render: (_, row) => { const item = urgency(row); return <Tag color={item.color}>{t(item.label)}</Tag>; } },
        ]}
      /> : <Empty description={t("No containers are currently waiting at the port")} />}
    </Card>
  </>;
}
