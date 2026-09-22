import { useState } from "react";
import {
  Alert,
  Card,
  Empty,
  Flex,
  Skeleton,
  Space,
  Switch,
  Typography,
  message,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { useCashiers, useCreateCashier } from "../../../queries/useHooks";
import { CashierNameField } from "./cashier-actions";
import { CashierTable } from "./cashier-table";

type NameValues = { name: string };

export default function CashierPage() {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const [showInactive, setShowInactive] = useState(false);

  const { data = [], isPending, isError, error } = useCashiers(showInactive);
  const create = useCreateCashier();

  const add = async ({ name }: NameValues) => {
    try {
      await create.mutateAsync({ name: name.trim() });
      msg.success("Cashier added");
    } catch (e) {
      showError(e, "Could not add cashier");
      throw e; // keeps the modal open
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {msgHolder}
      {errorHolder}

      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>Cashiers</Typography.Title>
        <CommonModalForm<NameValues>
          title="Add cashier"
          triggerLabel={<><PlusOutlined /> Add Cashier</>}
          okText="Add"
          width={420}
          onSave={add}
        >
          <CashierNameField />
        </CommonModalForm>
      </Flex>
      <Typography.Text type="secondary">
        Every order slip is assigned to a cashier. Cashiers who leave are
        deactivated, not deleted, so their past slips keep their name.
      </Typography.Text>

      <Card size="small">
        <Flex gap={8} align="center">
          <Switch checked={showInactive} onChange={setShowInactive} />
          <Typography.Text>Show inactive cashiers</Typography.Text>
        </Flex>
      </Card>

      {isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : isError ? (
        <Alert type="error" showIcon message="Could not load cashiers" description={error.message} />
      ) : !data.length ? (
        <Empty description={showInactive ? "No cashiers yet" : "No active cashiers"} />
      ) : (
        <CashierTable data={data} />
      )}
    </Space>
  );
}
