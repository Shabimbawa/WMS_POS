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

export default function ContainerPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({ kind: "INTERNATIONAL" });

  // undefined = all suppliers
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [range, setRange] = useState<MonthRange>(() => lastMonths(3));
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId,
      page,
      pageSize,
      dateField: "date_list_received" as const,
      ...monthRangeParams(range),
      sortDir,
    }),
    [supplierId, page, pageSize, range, sortDir],
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
          {t("Shipments")}
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            {t("Refresh")}
          </Button>
          <Button type="primary" onClick={() => navigate("/containers/items")}>
            {t("Register Shipment")}
          </Button>
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        {t("Packing lists with their containers. Only one date applies here, since rows are lists rather than boxes.")}
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
        <Empty description={t("No packing lists in this date range")} />
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
