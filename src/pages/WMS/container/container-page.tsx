import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tabs,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  useContainers,
  useShippingContainerNotebook,
  usePortPullOuts,
  useShippingCompanies,
  useSuppliers,
} from "../../../queries/useHooks";
import type { ContainerStatus, SortDir } from "../../../queries/types";
import { ContainerStatusTable, ContainerTable } from "./container-table";
import { STATUS_LABEL } from "../type-format/format";
import { StatusLegend } from "./status-legend";
import { PortPullOutTable } from "./port-pull-out-table";
import {
  MonthRangePicker,
  lastMonths,
  monthRangeParams,
  type MonthRange,
} from "../../../common/items/date-range/month-range";
import { useLanguage } from "../../../common/context/language-context";

export default function ContainerPage({
  kind = "INTERNATIONAL",
}: {
  kind?: "INTERNATIONAL" | "NATIONAL";
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({ kind });
  const { data: shippingCompanies = [], isLoading: loadingShippingCompanies } = useShippingCompanies();
  const { data: pullOutRows = [] } = usePortPullOuts(kind);
  const today = dayjs().startOf("day");
  const overduePullOuts = pullOutRows.filter((row) => dayjs(row.pull_out_before).startOf("day").diff(today, "day") <= 0).length;
  const urgentPullOuts = pullOutRows.filter((row) => dayjs(row.pull_out_before).startOf("day").diff(today, "day") <= 3).length;

  // undefined = all suppliers
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [shippingCompanyId, setShippingCompanyId] = useState<string | undefined>();
  const [range, setRange] = useState<MonthRange>(() => lastMonths(3));
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"active" | "port" | "archived">("active");
  const [page, setPage] = useState(1);
  // ?view=archived opens a tab directly, e.g. from the auto-archive pop-up's
  // View button. Consumed once, so the tabs work normally afterwards.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  // Applied while rendering (React's "adjust state when a prop changes"
  // pattern); handledView makes each request apply once.
  const [handledView, setHandledView] = useState<string | null>(null);
  if (requestedView !== handledView) {
    setHandledView(requestedView);
    if (requestedView === "active" || requestedView === "port" || requestedView === "archived") {
      setView(requestedView);
      setPage(1);
    }
  }
  useEffect(() => {
    if (requestedView === null) return;
    setSearchParams((params) => { params.delete("view"); return params; }, { replace: true });
  }, [requestedView, setSearchParams]);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState<ContainerStatus | undefined>();
  const [containerSearch, setContainerSearch] = useState("");
  const deferredContainerSearch = useDeferredValue(containerSearch);

  const params = useMemo(
    () => ({
      supplierId,
      shippingCompanyId,
      containerNo: deferredContainerSearch.trim() || undefined,
      kind,
      page,
      pageSize,
      dateField: "date_list_received" as const,
      ...monthRangeParams(range),
      sortDir,
      archived: view === "archived" ? true : undefined,
    }),
    [supplierId, shippingCompanyId, deferredContainerSearch, kind, page, pageSize, range, sortDir, view],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useShippingContainerNotebook(params, view !== "port" && !statusFilter);
  // A status chip switches the notebook to a flat list of containers.
  const containerList = useContainers(
    { ...params, status: statusFilter ?? "DOCUMENTED" },
    view !== "port" && Boolean(statusFilter),
  );
  const active = statusFilter ? containerList : { data, isPending, isError, error, isPlaceholderData, isFetching };

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" gap={12} wrap className="shipment-page-header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {kind === "INTERNATIONAL"
            ? t("International Shipments")
            : t("National Shipments")}
        </Typography.Title>
        <Flex gap={8} align="center" className="shipment-page-actions">
          <Button onClick={() => (statusFilter ? containerList.refetch() : refetch())} loading={active.isFetching}>
            {t("Refresh")}
          </Button>
          <Button
            type="primary"
            onClick={() =>
              navigate(
                kind === "INTERNATIONAL" ? "/containers/items" : "/national/items",
              )
            }
          >
            {kind === "INTERNATIONAL"
              ? t("Register Shipment")
              : t("Register National Delivery")}
          </Button>
        </Flex>
      </Flex>
      <Tabs
        activeKey={view}
        onChange={(key) => {
          setView(key as "active" | "port" | "archived");
          setPage(1);
        }}
        items={[
          { key: "active", label: t("Active") },
          {
            key: "port",
            label: (
              <Badge
                count={urgentPullOuts}
                size="small"
                color={overduePullOuts > 0 ? "#cf1322" : "#d46b08"}
                offset={[10, -2]}
              >
                <span style={{ paddingInlineEnd: urgentPullOuts ? 8 : 0 }}>{t("Port Pull-Out")}</span>
              </Badge>
            ),
          },
          { key: "archived", label: t("Archived") },
        ]}
        tabBarStyle={{ margin: 0 }}
      />
      <Typography.Text type="secondary">
        {view === "port"
          ? t("Read-only monitoring of containers currently at the port and their pull-out deadlines. Make all changes from the Active tab.")
          : view === "archived"
          ? t("Completed shipments archived from the active notebook. They remain part of inventory history and reports and can be restored at any time.")
          : kind === "INTERNATIONAL"
          ? t("Track overseas packing lists and their containers from registration through port arrival, delivery, and unloading. Filter by supplier and receipt month, then open a shipment to update container progress or review counted quantities.")
          : t("Track domestic shipments and their containers from registration through delivery and unloading. Filter by supplier and receipt month, then open a shipment to update container progress or review counted quantities.")}
      </Typography.Text>

      {view !== "port" && <Card size="small">
        <Flex wrap gap={12} align="center" className="shipment-filter-toolbar">
          <Select
            allowClear
            placeholder={t("All suppliers")}
            style={{ minWidth: 220 }}
            loading={loadingSuppliers}
            value={supplierId}
            onChange={reset(setSupplierId)}
            options={suppliers?.map((s) => ({ label: s.name, value: s.id }))}
            showSearch
            optionFilterProp="label"
          />

          <Select
            allowClear
            placeholder={t("All shipping companies")}
            style={{ minWidth: 210 }}
            loading={loadingShippingCompanies}
            value={shippingCompanyId}
            onChange={reset(setShippingCompanyId)}
            options={shippingCompanies.map((company) => ({
              label: company.code ? `${company.name} (${company.code})` : company.name,
              value: company.id,
            }))}
            showSearch
            optionFilterProp="label"
          />

          <Input.Search
            allowClear
            value={containerSearch}
            placeholder={t("Search container no.")}
            style={{ minWidth: 220, maxWidth: 280 }}
            onChange={(event) => {
              setContainerSearch(event.target.value.toUpperCase());
              setPage(1);
            }}
          />

          <MonthRangePicker value={range} onChange={reset(setRange)} />

          <Segmented
            value={sortDir}
            onChange={(v) => reset(setSortDir)(v as SortDir)}
            options={[
              { label: t("Newest"), value: "desc" },
              { label: t("Oldest"), value: "asc" },
            ]}
          />

          <StatusLegend value={statusFilter} onChange={reset(setStatusFilter)} />
        </Flex>
      </Card>}

      {view === "port" ? <PortPullOutTable kind={kind} /> : active.isError ? (
        <Alert
          type="error"
          showIcon
          message={t(statusFilter ? "Could not load containers" : "Could not load packing lists")}
          description={t((active.error as Error)?.message)}
        />
      ) : active.isPending || (active.isFetching && active.isPlaceholderData) ? (
        <Card size="small" aria-busy="true" aria-label={t("Loading shipments")}>
          <Skeleton active title={false} paragraph={{ rows: 7 }} />
        </Card>
      ) : !active.data?.rows.length ? (
        <Empty
          description={statusFilter
            ? t("No {status} containers in this date range", { status: t(STATUS_LABEL[statusFilter]).toLowerCase() })
            : t(
              view === "archived"
                ? "No archived shipments in this date range"
                : "No packing lists in this date range",
            )}
        />
      ) : (
        <div>
          {statusFilter && containerList.data
            ? <ContainerStatusTable data={containerList.data.rows} status={statusFilter} total={containerList.data.total} />
            : data && <ContainerTable containerSearch={deferredContainerSearch} data={data.rows} />}
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={active.data.page}
              pageSize={active.data.pageSize}
              total={active.data.total}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showTotal={(total, r) => t("{from}–{to} of {total}", { from: r[0], to: r[1], total })}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}
