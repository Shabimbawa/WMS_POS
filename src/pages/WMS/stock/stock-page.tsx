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
  Switch,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";

import { useProductCategories, useStockStatus } from "../../../queries/useHooks";
import type { SortDir, StockSortField } from "../../../queries/types";
import { StockTable } from "./stock-table";
import { fmtInt } from "../type-format/format";

const { RangePicker } = DatePicker;

const SORT_FIELDS: { label: string; value: StockSortField }[] = [
  { label: "Updated", value: "updated_at" },
  { label: "Brand", value: "brand" },
  { label: "Size", value: "size_kg" },
  { label: "On hand", value: "remaining_qty" },
  { label: "Price", value: "selling_price" },
];

export default function StockPage() {
  const { data: categories } = useProductCategories();

  const [brand, setBrand] = useState<string | undefined>();
  const [inStockOnly, setInStockOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(365, "day"),
    dayjs(),
  ]);
  const [sortBy, setSortBy] = useState<StockSortField>("brand");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const brands = useMemo(
    () => [...new Set(categories?.map((c) => c.brand) ?? [])],
    [categories],
  );

  const params = useMemo(
    () => ({
      brand,
      inStockOnly,
      availableOnly,
      page,
      pageSize,
      dateField: "updated_at" as const,
      dateFrom: range[0].format("YYYY-MM-DD"),
      dateTo: range[1].endOf("day").format("YYYY-MM-DD"),
      sortBy,
      sortDir,
    }),
    [brand, inStockOnly, availableOnly, page, pageSize, range, sortBy, sortDir],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useStockStatus(params);

  console.log("stock data", data);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const pageSacks = data?.rows.reduce((n, r) => n + r.remaining_qty, 0) ?? 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Stock status
        </Typography.Title>
        <Button onClick={() => refetch()} loading={isFetching}>
          Refresh
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        On-hand sacks per product.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            placeholder="All brands"
            style={{ minWidth: 180 }}
            value={brand}
            onChange={reset(setBrand)}
            options={brands.map((b) => ({ label: b, value: b }))}
          />

          <Flex align="center" gap={8}>
            <Switch
              checked={inStockOnly}
              onChange={reset(setInStockOnly)}
              size="small"
            />
            <Typography.Text>Hide zero stock</Typography.Text>
          </Flex>

          <Flex align="center" gap={8}>
            <Switch
              checked={availableOnly}
              onChange={reset(setAvailableOnly)}
              size="small"
            />
            <Typography.Text>Available only</Typography.Text>
          </Flex>

          <RangePicker
            value={range}
            allowClear={false}
            onChange={(v) => v && reset(setRange)(v as [Dayjs, Dayjs])}
            format="MMMM DD, YYYY"
          />

          <Select
            style={{ minWidth: 150 }}
            value={sortBy}
            onChange={reset(setSortBy)}
            options={SORT_FIELDS}
          />

          <Segmented
            value={sortDir}
            onChange={(v) => reset(setSortDir)(v as SortDir)}
            options={[
              { label: "Asc", value: "asc" },
              { label: "Desc", value: "desc" },
            ]}
          />

          <Statistic
            title="Sacks on this page"
            value={fmtInt(pageSacks)}
            valueStyle={{ fontSize: 18 }}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Could not load stock"
          description={(error as Error)?.message}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="Nothing matches these filters" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <StockTable data={data.rows} />
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