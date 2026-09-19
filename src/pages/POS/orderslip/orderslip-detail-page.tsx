import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Descriptions,
  Flex,
  Result,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import type { OrderSlipItem } from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  fmtSlipNumber,
  isOverdue,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import { DateParser } from "../../../common/utils/util";
import { lineAmount } from "../../../queries/pos";
import { useOrderSlip } from "../../../queries/useHooks";
import { EditOrderSlipButton } from "./orderslip-actions";

const itemColumns: ColumnDef<OrderSlipItem, any>[] = [
  {
    id: "quantity",
    header: "Qty",
    accessorFn: (r) => r.quantity,
    size: 80,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "article",
    header: "Articles",
    accessorFn: (r) => `${r.article.brand} ${r.article.variant}`,
    size: 300,
  },
  {
    id: "unitPrice",
    header: "Unit price",
    accessorFn: (r) => r.article.unitPrice,
    size: 140,
    cell: (c) => fmtMoney(c.getValue<number>()),
  },
  {
    id: "amount",
    header: "Amount",
    accessorFn: lineAmount,
    size: 140,
    cell: (c) => fmtMoney(c.getValue<number>()),
  },
];

function BackToList() {
  const navigate = useNavigate();
  return (
    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/order-slip")}>
      Back to order slips
    </Button>
  );
}

export default function OrderSlipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: slip, isLoading, isError } = useOrderSlip(id);
  const columns = useMemo(() => itemColumns, []);

  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError || !slip) {
    return (
      <Result
        status="404"
        title="Order slip not found"
        subTitle={`No order slip exists with id "${id}".`}
        extra={<BackToList />}
      />
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Order slip{" "}
          <span style={{ fontFamily: "monospace" }}>{fmtSlipNumber(slip)}</span>
        </Typography.Title>
        <Flex gap={8}>
          <BackToList />
          <EditOrderSlipButton slip={slip} />
        </Flex>
      </Flex>

      <Card size="small">
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Slip no.">#{slip.slipNumber}</Descriptions.Item>
          <Descriptions.Item label="Date">{DateParser(slip.date)}</Descriptions.Item>
          <Descriptions.Item label="Order by">{slip.orderBy}</Descriptions.Item>
          <Descriptions.Item label="Cashier">
            {slip.cashier.name}
            {!slip.cashier.isActive && (
              <Typography.Text type="secondary"> (inactive)</Typography.Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Address">{slip.address || "—"}</Descriptions.Item>
          <Descriptions.Item label="Payment">
            <Tag color={PAYMENT_STATUS_COLOR[slip.status]} style={{ margin: 0 }}>
              {PAYMENT_STATUS_LABEL[slip.status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Payment due">
            <Space size={8}>
              {DateParser(slip.paymentDueDate)}
              {isOverdue(slip) && <Tag color="error">Overdue</Tag>}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small">
        <DataTable data={slip.items} columns={columns} />
        <Flex justify="end" gap={16} style={{ marginTop: 12, paddingInline: 12 }}>
          <Typography.Text type="secondary">Total amount</Typography.Text>
          <Typography.Text strong style={{ fontSize: 16 }}>
            {fmtMoney(slip.totalAmount)}
          </Typography.Text>
        </Flex>
      </Card>
    </Space>
  );
}
