import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Flex,
  Input,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";

import { useAuditLogs } from "../../queries/useHooks";
import type { AuditLogRow, SortDir } from "../../queries/types";
import { useLanguage } from "../../common/context/language-context";

const MODULES = [
  "Authentication",
  "Shipments",
  "Containers",
  "Local deliveries",
  "Inventory",
  "Discrepancies",
  "Shipping companies",
  "Suppliers",
  "Products",
  "Cashiers",
  "Order slips",
  "System",
];

export default function AuditLogPage() {
  const { t } = useLanguage();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().subtract(29, "day"), dayjs()]);
  const [module, setModule] = useState<string>();
  const [result, setResult] = useState<"true" | "false">();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const params = useMemo(() => ({
    page,
    pageSize,
    dateFrom: range[0].format("YYYY-MM-DD"),
    dateTo: range[1].format("YYYY-MM-DD"),
    module,
    success: result === undefined ? undefined : result === "true",
    search: search || undefined,
    sortDir,
  }), [page, pageSize, range, module, result, search, sortDir]);

  const { data, isPending, isFetching, isError, error, refetch } = useAuditLogs(params);
  const resetPage = () => setPage(1);

  const columns = useMemo<TableColumnsType<AuditLogRow>>(() => [
    {
      title: t("Date and time"),
      dataIndex: "occurredAt",
      width: 180,
      render: (value: string) => (
        <div>
          <Typography.Text>{dayjs(value).format("MMM D, YYYY")}</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            {dayjs(value).format("h:mm:ss A")}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t("Action"),
      dataIndex: "action",
      width: 260,
      render: (value: string, row) => (
        <div>
          <Typography.Text strong>{t(value)}</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            {t(row.module)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t("Performed by"),
      dataIndex: "actorEmail",
      width: 230,
      render: (value: string | null, row) => (
        <div>
          <Typography.Text>{value || t("Unknown user")}</Typography.Text>
          {row.actorRole && (
            <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              {row.actorRole === "warehouse_admin" ? t("Warehouse admin") : t("POS admin")}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: t("Result"),
      dataIndex: "success",
      width: 110,
      render: (value: boolean, row) => (
        <Tag color={value ? "success" : "error"} style={{ margin: 0 }}>
          {value ? t("Success") : `${t("Failed")} · ${row.statusCode}`}
        </Tag>
      ),
    },
    {
      title: t("Record"),
      dataIndex: "recordId",
      width: 180,
      ellipsis: true,
      render: (value: string | null) => value
        ? <Typography.Text code copyable>{value}</Typography.Text>
        : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "",
      key: "view",
      width: 70,
      fixed: "right",
      render: (_, row) => (
        <Button type="text" icon={<EyeOutlined />} aria-label={t("View details")} onClick={() => setSelected(row)} />
      ),
    },
  ], [t]);

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" gap={12} wrap>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>{t("Audit Log")}</Typography.Title>
          <Typography.Text type="secondary">
            {t("Review state-changing actions performed throughout the IMS. Audit entries are append-only and cannot be edited or deleted.")}
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>{t("Refresh")}</Button>
      </Flex>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <DatePicker.RangePicker
            value={range}
            allowClear={false}
            format="MMM D, YYYY"
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setRange([value[0], value[1]]);
                resetPage();
              }
            }}
          />
          <Select
            allowClear
            placeholder={t("All modules")}
            value={module}
            style={{ minWidth: 190 }}
            options={MODULES.map((value) => ({ value, label: t(value) }))}
            onChange={(value) => { setModule(value); resetPage(); }}
          />
          <Select<"true" | "false">
            allowClear
            placeholder={t("All results")}
            value={result}
            style={{ minWidth: 140 }}
            options={[
              { value: "true", label: t("Successful") },
              { value: "false", label: t("Failed") },
            ]}
            onChange={(value) => { setResult(value); resetPage(); }}
          />
          <Select<SortDir>
            value={sortDir}
            style={{ minWidth: 130 }}
            options={[
              { value: "desc", label: t("Newest") },
              { value: "asc", label: t("Oldest") },
            ]}
            onChange={(value) => { setSortDir(value); resetPage(); }}
          />
          <Input
            allowClear
            value={searchDraft}
            prefix={<SearchOutlined />}
            placeholder={t("Search action, user, or record")}
            style={{ minWidth: 280, flex: 1 }}
            onChange={(event) => {
              setSearchDraft(event.target.value);
              if (!event.target.value) { setSearch(""); resetPage(); }
            }}
            onPressEnter={() => { setSearch(searchDraft.trim()); resetPage(); }}
            suffix={<Button type="link" size="small" onClick={() => { setSearch(searchDraft.trim()); resetPage(); }}>{t("Search")}</Button>}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert type="error" showIcon message={t("Could not load audit logs")} description={(error as Error).message} />
      ) : !isPending && !data?.rows.length ? (
        <Empty description={t("No actions found for these filters")} />
      ) : (
        <>
          <Table<AuditLogRow>
            rowKey="id"
            columns={columns}
            dataSource={data?.rows ?? []}
            loading={isPending || isFetching}
            pagination={false}
            size="middle"
            scroll={{ x: 1050 }}
          />
          <Flex justify="end">
            <Pagination
              current={data?.page ?? page}
              pageSize={data?.pageSize ?? pageSize}
              total={data?.total ?? 0}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              showTotal={(total, bounds) => t("{from}–{to} of {total}", { from: bounds[0], to: bounds[1], total })}
              onChange={(nextPage, nextSize) => {
                setPage(nextSize !== pageSize ? 1 : nextPage);
                setPageSize(nextSize);
              }}
            />
          </Flex>
        </>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={t("Audit entry details")}
        width="min(620px, 95vw)"
        destroyOnHidden
      >
        {selected && (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div><Typography.Text type="secondary">{t("Action")}</Typography.Text><Typography.Title level={5} style={{ margin: "2px 0 0" }}>{t(selected.action)}</Typography.Title></div>
            <Flex gap={8} wrap><Tag>{t(selected.module)}</Tag><Tag color={selected.success ? "success" : "error"}>{selected.success ? t("Success") : t("Failed")}</Tag><Tag>{selected.method}</Tag><Tag>HTTP {selected.statusCode}</Tag></Flex>
            <Card size="small">
              <Space orientation="vertical" size={6}>
                <Typography.Text><strong>{t("Date and time")}:</strong> {dayjs(selected.occurredAt).format("MMMM D, YYYY h:mm:ss A")}</Typography.Text>
                <Typography.Text><strong>{t("User")}:</strong> {selected.actorEmail || t("Unknown user")}</Typography.Text>
                <Typography.Text><strong>{t("Route")}:</strong> <Typography.Text code>{selected.route}</Typography.Text></Typography.Text>
                <Typography.Text><strong>{t("Record")}:</strong> {selected.recordId || "—"}</Typography.Text>
                <Typography.Text><strong>{t("IP address")}:</strong> {selected.ipAddress || "—"}</Typography.Text>
              </Space>
            </Card>
            <div>
              <Typography.Text strong>{t("Submitted details")}</Typography.Text>
              <pre style={{ marginTop: 8, padding: 12, border: "1px solid var(--border-color)", borderRadius: 8, overflow: "auto", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {selected.details == null ? t("No submitted details") : JSON.stringify(selected.details, null, 2)}
              </pre>
            </div>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
