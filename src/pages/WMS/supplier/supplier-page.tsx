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

import { useSupplierNotebook, useSuppliers } from "../../../queries/useHooks";
import type { ContainerDateField, SortDir } from "../../../queries/types";
import { SupplierTable } from "./supplier-table";

const { RangePicker } = DatePicker;

const DATE_FIELDS: { label: string; value: ContainerDateField }[] = [
  { label: "List received", value: "date_list_received" },
  { label: "Delivered", value: "date_delivered" },
  { label: "Unloaded", value: "date_unloaded" },
];

export default function SupplierPage() {
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(90, "day"),
    dayjs(),
  ]);
  const [dateField, setDateField] =
    useState<ContainerDateField>("date_list_received");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId: supplierId ?? "",
      page,
      pageSize,
      dateField,
      dateFrom: range[0].format("YYYY-MM-DD"),
      dateTo: range[1].format("YYYY-MM-DD"),
      sortDir,
    }),
    [supplierId, page, pageSize, dateField, range, sortDir],
  );

  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    isFetching,
    refetch,
  } = useSupplierNotebook(params, Boolean(supplierId));

  console.log("supplier data", data);

  // any filter change invalidates the current page number
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Supplier notebook
        </Typography.Title>
        <Button
          onClick={() => refetch()}
          loading={isFetching}
          disabled={!supplierId}
        >
          Refresh
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        Itemised contents and cost per container. One supplier at a time, the
        way the paper notebooks are kept.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            placeholder="Select supplier"
            style={{ minWidth: 220 }}
            loading={loadingSuppliers}
            value={supplierId}
            onChange={reset(setSupplierId)}
            options={suppliers?.map((s) => ({ label: s.name, value: s.id }))}
            showSearch
            optionFilterProp="label"
          />

          <Segmented
            value={dateField}
            onChange={(v) => reset(setDateField)(v as ContainerDateField)}
            options={DATE_FIELDS}
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

      {!supplierId ? (
        <Empty description="Pick a supplier to open their notebook" />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Could not load the notebook"
          description={(error as Error)?.message}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="No containers in this date range" />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <SupplierTable data={data.rows} />
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