import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Space,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";

import { useSuppliers, useTruckNotebook } from "../../../queries/useHooks";
import type { ContainerStatus, SortDir } from "../../../queries/types";
import { TruckTable } from "./truck-table";

const { RangePicker } = DatePicker;

type TruckDateField = "date_delivered" | "date_unloaded";

export default function TruckPage() {
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [status, setStatus] = useState<ContainerStatus[]>([]);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, "day"),
    dayjs(),
  ]);
  const [dateField, setDateField] = useState<TruckDateField>("date_delivered");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId,
      status: status.length ? status : undefined,
      page,
      pageSize,
      dateField,
      dateFrom: range[0].format("YYYY-MM-DD"),
      dateTo: range[1].format("YYYY-MM-DD"),
      sortDir,
    }),
    [supplierId, status, page, pageSize, dateField, range, sortDir],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useTruckNotebook(params);

  console.log("truck data", data);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Company truck notebook
        </Typography.Title>
        <Button onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        Containers hauled in by our own trucks. Third-party deliveries are not
        recorded here.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            placeholder="All suppliers"
            style={{ minWidth: 200 }}
            loading={loadingSuppliers}
            value={supplierId}
            onChange={reset(setSupplierId)}
            options={suppliers?.map((s) => ({ label: s.name, value: s.id }))}
            showSearch
            optionFilterProp="label"
          />

          <Select
            mode="multiple"
            allowClear
            placeholder="Any status"
            style={{ minWidth: 220 }}
            value={status}
            onChange={reset(setStatus)}
            options={[
              { label: "Delivered", value: "DELIVERED" },
              { label: "Unloaded", value: "UNLOADED" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
          />

          <Segmented
            value={dateField}
            onChange={(v) => reset(setDateField)(v as TruckDateField)}
            options={[
              { label: "Delivered", value: "date_delivered" },
              { label: "Unloaded", value: "date_unloaded" },
            ]}
          />

          <RangePicker
            value={range}
            allowClear={false}
            onChange={(v) => v && reset(setRange)(v as [Dayjs, Dayjs])}
            format="MMMM DD, YYYY"
          />

          <Segmented
            value={sortDir}
            onChange={(v) => reset(setSortDir)(v as SortDir)}
            options={[
              { label: "Newest", value: "desc" },
              { label: "Oldest", value: "asc" },
            ]}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Could not load deliveries"
          description={(error as Error)?.message}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="No truck deliveries in this date range" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <TruckTable data={data.rows} />
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
              showTotal={(t, r) => `${r[0]}–${r[1]} of ${t}`}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}