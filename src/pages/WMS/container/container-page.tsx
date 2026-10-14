import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tabs,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";

import {
  useShippingContainerNotebook,
  useSuppliers,
} from "../../../queries/useHooks";
import type { SortDir } from "../../../queries/types";
import { ContainerTable } from "./container-table";
import { StatusLegend } from "./status-legend";
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

  // undefined = all suppliers
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [range, setRange] = useState<MonthRange>(() => lastMonths(3));
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId,
      kind,
      page,
      pageSize,
      dateField: "date_list_received" as const,
      ...monthRangeParams(range),
      sortDir,
      archived: view === "archived" ? true : undefined,
    }),
    [supplierId, kind, page, pageSize, range, sortDir, view],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useShippingContainerNotebook(params);

  console.log("container data", data);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {kind === "INTERNATIONAL"
            ? t("International Shipments")
            : t("National Shipments")}
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
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
          setView(key as "active" | "archived");
          setPage(1);
        }}
        items={[
          { key: "active", label: t("Active") },
          { key: "archived", label: t("Archived") },
        ]}
        tabBarStyle={{ margin: 0 }}
      />
      <Typography.Text type="secondary">
        {view === "archived"
          ? t("Completed shipments archived from the active notebook. They remain part of inventory history and reports and can be restored at any time.")
          : kind === "INTERNATIONAL"
          ? t("Track overseas packing lists and their containers from registration through port arrival, delivery, and unloading. Filter by supplier and receipt month, then open a shipment to update container progress or review counted quantities.")
          : t("Track domestic shipments and their containers from registration through delivery and unloading. Filter by supplier and receipt month, then open a shipment to update container progress or review counted quantities.")}
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
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

          <MonthRangePicker value={range} onChange={reset(setRange)} />

          <Segmented
            value={sortDir}
            onChange={(v) => reset(setSortDir)(v as SortDir)}
            options={[
              { label: t("Newest"), value: "desc" },
              { label: t("Oldest"), value: "asc" },
            ]}
          />

          <StatusLegend />
        </Flex>
      </Card>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message={t("Could not load packing lists")}
          description={t((error as Error)?.message)}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty
          description={t(
            view === "archived"
              ? "No archived shipments in this date range"
              : "No packing lists in this date range",
          )}
        />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <ContainerTable data={data.rows} />
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={data.page}
              pageSize={data.pageSize}
              total={data.total}
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
