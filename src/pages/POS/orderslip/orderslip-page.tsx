import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Input,
  Pagination,
  Segmented,
  Skeleton,
  Space,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { PlusOutlined, UndoOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import type { SortDir } from "../../../queries/posTypes";
import { useOrderSlips } from "../../../queries/useHooks";
import { OrderSlipTable } from "./orderslip-table";
import {
  MonthRangePicker,
  lastMonths,
  monthRangeParams,
  type MonthRange,
} from "../../../common/items/date-range/month-range";

const defaultRange = (): MonthRange => lastMonths(3);

export default function OrderSlipPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<MonthRange>(defaultRange);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(() => ({
    search: search.trim() || undefined,
    ...monthRangeParams(range),
    sortDir,
    page,
    pageSize,
  }), [search, range, sortDir, page, pageSize]);

  const { data, isPending, isError, error, isPlaceholderData } = useOrderSlips(params);

  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };
  const [defaultFrom, defaultTo] = defaultRange();
  const isDefaultRange =
    range[0].isSame(defaultFrom, "month") && range[1].isSame(defaultTo, "month");

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>Order slips</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/order-slip/new")}>
          New Order Slip
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        One row per order slip. Click a slip number to open it.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Input.Search
            allowClear
            placeholder="Search customer or slip no."
            style={{ width: 260 }}
            value={search}
            onChange={(event) => reset(setSearch)(event.target.value)}
          />
          <MonthRangePicker value={range} onChange={reset(setRange)} />
          <Button
            icon={<UndoOutlined />}
            disabled={isDefaultRange}
            onClick={() => reset(setRange)(defaultRange())}
          />
          <Segmented
            value={sortDir}
            onChange={(value) => reset(setSortDir)(value as SortDir)}
            options={[{ label: "Newest", value: "desc" }, { label: "Oldest", value: "asc" }]}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert type="error" showIcon message="Could not load order slips" description={(error as Error).message} />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="No order slips in this date range" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <OrderSlipTable data={data.rows} />
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={data.page}
              pageSize={data.pageSize}
              total={data.total}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(nextPage, nextPageSize) => {
                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                setPageSize(nextPageSize);
              }}
              showTotal={(total, bounds) => `${bounds[0]}–${bounds[1]} of ${total}`}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}
