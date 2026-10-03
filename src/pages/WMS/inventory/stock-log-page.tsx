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
  Typography,
} from "antd";

import { useProductCategories, useStockLog } from "../../../queries/useHooks";
import type {
  SortDir,
  StockDirection,
  StockMovementType,
} from "../../../queries/types";
import { StockLogTable } from "./stock-log-table";
import {
  MonthRangePicker,
  lastMonths,
  monthRangeParams,
  type MonthRange,
} from "../../../common/items/date-range/month-range";
import { MOVEMENT_LABEL, fmtInt, fmtProduct } from "../type-format/format";
import { useLanguage } from "../../../common/context/language-context";

type DirectionFilter = "all" | StockDirection;

// Inbound first, then outbound, then the corrections.
const MOVEMENT_OPTIONS = (
  [
    "INBOUND_UNLOAD",
    "INBOUND_LOCAL",
    "OUTBOUND_ORDER",
    "ORDER_REVERSAL",
    "LOCAL_REVERSAL",
    "MANUAL_ADJUSTMENT",
    "OPENING_BALANCE",
  ] as const
).map((t) => ({ label: MOVEMENT_LABEL[t], value: t }));

export default function StockLogPage() {
  const { t } = useLanguage();
  const { data: products = [] } = useProductCategories();

  const [productCategoryId, setProductCategoryId] = useState<
    string | undefined
  >();
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [movementType, setMovementType] = useState<StockMovementType | undefined>();
  const [range, setRange] = useState<MonthRange>(() => lastMonths(3));
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      productCategoryId,
      direction: direction === "all" ? undefined : direction,
      movementType,
      page,
      pageSize,
      ...monthRangeParams(range),
      sortDir,
    }),
    [productCategoryId, direction, movementType, page, pageSize, range, sortDir],
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
  const pageDelta = data?.rows.reduce((n, r) => n + r.quantity_delta, 0) ?? 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("Inventory")}
        </Typography.Title>
        <Button onClick={() => refetch()} loading={isFetching}>
          {t("Refresh")}
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        {t("Every movement behind the on-hand figures, newest first. Each row carries the balance it left behind.")}
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("All products")}
            style={{ minWidth: 240 }}
            value={productCategoryId}
            onChange={reset(setProductCategoryId)}
            options={products.map((p) => ({
              label: fmtProduct(p),
              value: p.id,
            }))}
          />

          <Select
            allowClear
            placeholder={t("All movements")}
            style={{ minWidth: 180 }}
            value={movementType}
            onChange={reset(setMovementType)}
            options={MOVEMENT_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
          />

          <Segmented
            value={direction}
            onChange={(v) => reset(setDirection)(v as DirectionFilter)}
            options={[
              { label: t("All"), value: "all" },
              { label: t("In"), value: "IN" },
              { label: t("Out"), value: "OUT" },
            ]}
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

          <Statistic
            title={t("Net sacks on this page")}
            value={pageDelta > 0 ? `+${fmtInt(pageDelta)}` : fmtInt(pageDelta)}
            valueStyle={{ fontSize: 18 }}
          />
        </Flex>
      </Card>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message={t("Could not load stock logs")}
          description={t((error as Error)?.message)}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description={t("No movements in this date range")} />
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
              showTotal={(total, r) => t("{from}–{to} of {total}", { from: r[0], to: r[1], total })}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}
