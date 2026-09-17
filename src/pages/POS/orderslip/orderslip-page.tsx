import { useMemo, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Input,
  Pagination,
  Segmented,
  Space,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { PlusOutlined, UndoOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import type { SortDir } from "../../../queries/posTypes";
import { OrderSlipTable } from "./orderslip-table";
// TODO: mock data — move the filtering/sorting/paging below to the server
// once this comes from a query hook.
import { MOCK_SLIPS } from "./orderslip-data";

const { RangePicker } = DatePicker;

/** The last 90 days, ending today. */
const defaultRange = (): [Dayjs, Dayjs] => [dayjs().subtract(90, "day"), dayjs()];

export default function OrderSlipPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Compare as YYYY-MM-DD strings so the whole end day is included.
    const from = range[0].format("YYYY-MM-DD");
    const to = range[1].format("YYYY-MM-DD");

    return MOCK_SLIPS.filter(
      (s) =>
        s.date >= from &&
        s.date <= to &&
        (!q ||
          s.orderBy.toLowerCase().includes(q) ||
          String(s.slipNumber).includes(q)),
    ).sort((a, b) => {
      const byDate = a.date.localeCompare(b.date) || a.slipNumber - b.slipNumber;
      return sortDir === "asc" ? byDate : -byDate;
    });
  }, [search, range, sortDir]);

  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  // Compared by day, so the reset stays disabled while the range is the default.
  const [defaultFrom, defaultTo] = defaultRange();
  const isDefaultRange =
    range[0].isSame(defaultFrom, "day") && range[1].isSame(defaultTo, "day");

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Order slips
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/order-slip/new")}
        >
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
            onChange={(e) => reset(setSearch)(e.target.value)}
          />

          <RangePicker
            value={range}
            allowClear={false}
            onChange={(v) => v && reset(setRange)(v as [Dayjs, Dayjs])}
            format="MMMM DD, YYYY"
          />
          <Button
            icon={<UndoOutlined />}
            disabled={isDefaultRange}
            onClick={() => reset(setRange)(defaultRange())}
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

      {!filtered.length ? (
        <Empty description="No order slips in this date range" />
      ) : (
        <div>
          <OrderSlipTable data={rows} />
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={filtered.length}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(p, ps) => {
                // Changing page size can leave `page` past the end; start over.
                setPage(ps !== pageSize ? 1 : p);
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
