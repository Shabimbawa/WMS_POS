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
  Statistic,
  Switch,
  Typography,
} from "antd";

import { useProductCategories, useStockStatus } from "../../../queries/useHooks";
import type { SortDir, StockSortField } from "../../../queries/types";
import { StockTable } from "./stock-table";
import { fmtInt } from "../type-format/format";

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
  const [sortBy, setSortBy] = useState<StockSortField>("brand");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const brands = useMemo(
    () => [...new Set(categories?.map((c) => c.brand) ?? [])],
    [categories],
  );

  const params = useMemo(
    // No date range: this lists what is on hand, not what changed recently.
    () => ({ brand, inStockOnly, availableOnly, page, pageSize, sortBy, sortDir }),
    [brand, inStockOnly, availableOnly, page, pageSize, sortBy, sortDir],
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
        On-hand sacks per product. Quantities are written by the stock ledger,
        never edited here.
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
