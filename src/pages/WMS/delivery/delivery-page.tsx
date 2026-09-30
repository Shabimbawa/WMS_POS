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
  Switch,
  Typography,
} from "antd";
import { useNavigate } from "react-router-dom";

import { useDeliveries, useSuppliers } from "../../../queries/useHooks";
import type { SortDir } from "../../../queries/types";
import {
  MonthRangePicker,
  lastMonths,
  monthRangeParams,
  type MonthRange,
} from "../../../common/items/date-range/month-range";
import { DeliveryTable } from "./delivery-table";

export default function DeliveryPage() {
  const navigate = useNavigate();
  // Only local suppliers deliver this way.
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({
    kind: "LOCAL",
  });

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [includeVoided, setIncludeVoided] = useState(false);
  const [range, setRange] = useState<MonthRange>(() => lastMonths(3));
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId,
      includeVoided,
      page,
      pageSize,
      ...monthRangeParams(range),
      sortDir,
    }),
    [supplierId, includeVoided, page, pageSize, range, sortDir],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useDeliveries(params);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Local deliveries
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <Button type="primary" onClick={() => navigate("/deliveries/new")}>
            Log Delivery
          </Button>
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        Truck loads from local suppliers, counted as they arrive. There is no
        packing list to compare against, so stock moves the moment one is
        logged — a wrong count is corrected by voiding it.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            placeholder="All local suppliers"
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
              { label: "Newest", value: "desc" },
              { label: "Oldest", value: "asc" },
            ]}
          />

          <Flex align="center" gap={8}>
            <Switch
              size="small"
              checked={includeVoided}
              onChange={reset(setIncludeVoided)}
            />
            <Typography.Text>Show voided</Typography.Text>
          </Flex>
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
        <Empty description="No deliveries in this date range" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <DeliveryTable data={data.rows} />
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
