import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Skeleton,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { UndoOutlined } from "@ant-design/icons";
import { type Dayjs } from "dayjs";

import { DateParser } from "../../../common/utils/util";
import type { CashierDaySummary } from "../../../queries/posTypes";
import { useOrderSlipSummary } from "../../../queries/useHooks";
import { fmtInt, fmtMoney, posToday } from "../type-format/format";
import { CashierDayCard } from "./summary-card";
import { SummarySlipsDrawer, type SummarySelection } from "./summary-slips-drawer";

const { RangePicker } = DatePicker;

/** Today only, in Philippine time. */
const defaultRange = (): [Dayjs, Dayjs] => [posToday(), posToday()];

/**
 * Order slips per cashier per day, one card each, grouped by date.
 *
 * Possible later additions (not needed yet): printing a day's summary and
 * exporting it to a spreadsheet.
 */
export default function OrderSlipSummaryPage() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(defaultRange);
  const [selection, setSelection] = useState<SummarySelection | null>(null);

  const params = useMemo(() => ({
    dateFrom: range[0].format("YYYY-MM-DD"),
    dateTo: range[1].format("YYYY-MM-DD"),
  }), [range]);
  const { data = [], isPending, isError, error, isPlaceholderData } = useOrderSlipSummary(params);

  // The API returns rows ordered by date then cashier name.
  const days = useMemo(() => {
    const byDate = new Map<string, CashierDaySummary[]>();
    for (const row of data) {
      const list = byDate.get(row.date);
      if (list) list.push(row);
      else byDate.set(row.date, [row]);
    }
    return [...byDate.entries()];
  }, [data]);

  const [defaultFrom, defaultTo] = defaultRange();
  const isDefaultRange =
    range[0].isSame(defaultFrom, "day") && range[1].isSame(defaultTo, "day");

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Daily summary</Typography.Title>
      <Typography.Text type="secondary">
        Order slips per cashier per day. Click a cashier to see their slips for that day.
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <RangePicker
            value={range}
            allowClear={false}
            onChange={(value) => value && setRange(value as [Dayjs, Dayjs])}
            format="MMMM DD, YYYY"
          />
          <Tooltip title="Back to today">
            <Button
              icon={<UndoOutlined />}
              aria-label="Reset dates to today"
              disabled={isDefaultRange}
              onClick={() => setRange(defaultRange())}
            />
          </Tooltip>
        </Flex>
      </Card>

      {isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : isError ? (
        <Alert type="error" showIcon message="Could not load the summary" description={error.message} />
      ) : !days.length ? (
        <Empty description="No order slips in this date range" />
      ) : (
        <Flex vertical gap={24} style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          {days.map(([date, cashiers]) => {
            const slipCount = cashiers.reduce((n, c) => n + c.slipCount, 0);
            const total = cashiers.reduce((n, c) => n + c.totalAmount, 0);
            return (
              <Flex key={date} vertical gap={12}>
                <Flex justify="space-between" align="baseline" wrap gap={8}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {DateParser(date)}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {fmtInt(slipCount)} {slipCount === 1 ? "slip" : "slips"} · {fmtMoney(total)}
                  </Typography.Text>
                </Flex>
                <Flex wrap gap={16} align="start">
                  {cashiers.map((summary) => (
                    <CashierDayCard
                      key={summary.cashier.id}
                      summary={summary}
                      onOpen={() => setSelection({ date, cashier: summary.cashier })}
                    />
                  ))}
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      )}

      <SummarySlipsDrawer
        key={selection ? `${selection.date}|${selection.cashier.id}` : "closed"}
        selection={selection}
        onClose={() => setSelection(null)}
      />
    </Space>
  );
}
