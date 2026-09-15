import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
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
import { useNavigate } from "react-router-dom";

import {
  useOpenQuestionCount,
  useShippingContainerNotebook,
  useSuppliers,
} from "../../../queries/useHooks";
import type { SortDir } from "../../../queries/types";
import { ContainerTable } from "./container-table";

const { RangePicker } = DatePicker;

export default function ContainerPage() {
  const navigate = useNavigate();
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers();
  const { data: openQuestionCount } = useOpenQuestionCount();

  // undefined = all suppliers
  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(90, "day"),
    dayjs(),
  ]);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({
      supplierId,
      page,
      pageSize,
      dateField: "date_list_received" as const,
      dateFrom: range[0].format("YYYY-MM-DD"),
      dateTo: range[1].format("YYYY-MM-DD"),
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
          Shipments
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <Badge count={openQuestionCount} size="small">
            <Button onClick={() => navigate("/containers/discrepancies")}>
              View discrepancies
            </Button>
          </Badge>
          <Button type="primary" onClick={() => navigate("/containers/items")}>
            Register Shipment
          </Button>
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        Packing lists with their containers. Only one date applies here, since
        rows are lists rather than boxes.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Select
            allowClear
            placeholder="All suppliers"
            style={{ minWidth: 220 }}
            loading={loadingSuppliers}
            value={supplierId}
            onChange={reset(setSupplierId)}
            options={suppliers?.map((s) => ({ label: s.name, value: s.id }))}
            showSearch
            optionFilterProp="label"
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
          message="Could not load packing lists"
          description={(error as Error)?.message}
        />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description="No packing lists in this date range" />
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
              showTotal={(t, r) => `${r[0]}–${r[1]} of ${t}`}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}