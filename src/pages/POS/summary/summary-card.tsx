import { Card, Descriptions, Flex, Tag, Typography } from "antd";

import { LabelValue, OverflowList } from "../../../common/items/overflow-list/overflow-list";
import type { CashierDaySummary, PaymentStatus } from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  fmtProduct,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import { useLanguage } from "../../../common/context/language-context";

const STATUS_ORDER: PaymentStatus[] = ["paid", "partial", "unpaid"];

/** One cashier's day. Clicking it opens that day's slips for the cashier. */
export function CashierDayCard({
  summary,
  onOpen,
}: {
  summary: CashierDaySummary;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const totalSacks = summary.products.reduce((n, p) => n + p.sacks, 0);

  return (
    <Card
      size="small"
      hoverable
      onClick={onOpen}
      style={{ width: 340, height: "100%" }}
      title={
        <Flex align="center" gap={8}>
          <span>{summary.cashier.name}</span>
          {!summary.cashier.isActive && <Tag style={{ margin: 0 }}>{t("Inactive")}</Tag>}
        </Flex>
      }
      extra={
        <Typography.Text type="secondary">
          {fmtInt(summary.slipCount)} {t(summary.slipCount === 1 ? "slip" : "slips")}
        </Typography.Text>
      }
    >
      <Flex vertical gap={12}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t("Total amount")}>
            <strong>{fmtMoney(summary.totalAmount)}</strong>
          </Descriptions.Item>
          <Descriptions.Item label={t("Amount paid")}>
            {fmtMoney(summary.paidAmount)}
          </Descriptions.Item>
        </Descriptions>

        <Flex gap={6} wrap>
          {STATUS_ORDER.map((status) => (
            <Tag key={status} color={PAYMENT_STATUS_COLOR[status]} style={{ margin: 0 }}>
              {t(PAYMENT_STATUS_LABEL[status])}: {fmtInt(summary.statusCounts[status])}
            </Tag>
          ))}
        </Flex>

        <div>
          <Flex justify="space-between" style={{ marginBottom: 4 }}>
            <Typography.Text type="secondary">{t("Sacks per product")}</Typography.Text>
            <Typography.Text type="secondary">{fmtInt(totalSacks)} {t("total")}</Typography.Text>
          </Flex>
          {/* Capped so a busy day doesn't stretch the card; the rest fold
              into a popover. */}
          <OverflowList
            items={summary.products}
            max={5}
            getKey={(p) => p.productId}
            title={`${summary.cashier.name} · ${summary.products.length} ${t("products")}`}
            renderItem={(p) => (
              <LabelValue label={fmtProduct(p)} value={fmtInt(p.sacks)} />
            )}
          />
        </div>
      </Flex>
    </Card>
  );
}
