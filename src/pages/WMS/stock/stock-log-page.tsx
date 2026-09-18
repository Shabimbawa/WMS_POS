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
  Statistic,
  Typography,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import { useProductCategories, useStockLog } from "../../../queries/useHooks";
import type { SortDir, StockDirection } from "../../../queries/types";
import { StockLogTable } from "./stock-log-table";
import { fmtInt, fmtProduct } from "../type-format/format";

const { RangePicker } = DatePicker;

type DirectionFilter = "all" | StockDirection;

export default function StockLogPage() {
  const navigate = useNavigate();
  const { data: products = [] } = useProductCategories();

  const [productCategoryId, setProductCategoryId] = useState<
    string | undefined
  >();
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(90, "day"),
    dayjs(),
  ]);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      productCategoryId,
      direction: direction === "all" ? undefined : direction,
      page,
      pageSize,
      dateFrom: range[0].format("YYYY-MM-DD"),
      dateTo: range[1].format("YYYY-MM-DD"),
      sortDir,
    }),
    [productCategoryId, direction, page, pageSize, range, sortDir],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useStockLog(params);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  // Net of this page only — the ledger is paged server-side.
  const pageDelta = data?.rows.reduce((n, r) => n + r.qty_delta, 0) ?? 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap={8}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/stock")}
          />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Stock logs
          </Typography.Title>
        </Flex>
        <Button onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        Every movement behind the on-hand figures, newest first. Each row
        carries the balance it left behind.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All products"
            style={{ minWidth: 240 }}
            value={productCategoryId}
            onChange={reset(setProductCategoryId)}
            options={products.map((p) => ({
              label: fmtProduct(p),
              value: p.id,
            }))}
          />

          <Segmented
            value={direction}
            onChange={(v) => reset(setDirection)(v as DirectionFilter)}
            options={[
              { label: "All", value: "all" },
              { label: "In", value: "IN" },
              { label: "Out", value: "OUT" },
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

          <Statistic
            title="Net sacks on this page"
            value={pageDelta > 0 ? `+${fmtInt(pageDelta)}` : fmtInt(pageDelta)}
            valueStyle={{ fontSize: 18 }}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Could not load stock logs"
          description={(error as Error)?.message}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="No movements in this date range" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <StockLogTable data={data.rows} />
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
