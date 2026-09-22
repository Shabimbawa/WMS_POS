import { Card, Descriptions, Flex, Tag, Typography } from "antd";

import type { CashierDaySummary, PaymentStatus } from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  fmtProduct,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";

const STATUS_ORDER: PaymentStatus[] = ["paid", "partial", "unpaid"];

/** One cashier's day. Clicking it opens that day's slips for the cashier. */
export function CashierDayCard({
  summary,
  onOpen,
}: {
  summary: CashierDaySummary;
  onOpen: () => void;
}) {
  const totalSacks = summary.products.reduce((n, p) => n + p.sacks, 0);

  return (
    <Card
      size="small"
      hoverable
      onClick={onOpen}
      style={{ width: 340 }}
      title={
        <Flex align="center" gap={8}>
          <span>{summary.cashier.name}</span>
          {!summary.cashier.isActive && <Tag style={{ margin: 0 }}>Inactive</Tag>}
        </Flex>
      }
      extra={
        <Typography.Text type="secondary">
          {fmtInt(summary.slipCount)} {summary.slipCount === 1 ? "slip" : "slips"}
        </Typography.Text>
      }
    >
      <Flex vertical gap={12}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="Total amount">
            <strong>{fmtMoney(summary.totalAmount)}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Amount paid">
            {fmtMoney(summary.paidAmount)}
          </Descriptions.Item>
        </Descriptions>

        <Flex gap={6} wrap>
          {STATUS_ORDER.map((status) => (
            <Tag key={status} color={PAYMENT_STATUS_COLOR[status]} style={{ margin: 0 }}>
              {PAYMENT_STATUS_LABEL[status]}: {fmtInt(summary.statusCounts[status])}
            </Tag>
          ))}
        </Flex>

        <div>
          <Flex justify="space-between" style={{ marginBottom: 4 }}>
            <Typography.Text type="secondary">Sacks per product</Typography.Text>
            <Typography.Text type="secondary">{fmtInt(totalSacks)} total</Typography.Text>
          </Flex>
          {summary.products.map((p) => (
            <Flex key={p.productId} justify="space-between" gap={12}>
              <span>{fmtProduct(p)}</span>
              <span style={{ whiteSpace: "nowrap" }}>{fmtInt(p.sacks)}</span>
            </Flex>
          ))}
        </div>
      </Flex>
    </Card>
  );
}
