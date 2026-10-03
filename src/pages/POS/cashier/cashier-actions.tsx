import { Button, Flex, Form, Input, Popconfirm, message } from "antd";
import { EditOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { Cashier } from "../../../queries/posTypes";
import { useUpdateCashier } from "../../../queries/useHooks";
import { useLanguage } from "../../../common/context/language-context";

type NameValues = { name: string };

export function CashierNameField() {
  const { t } = useLanguage();
  return (
    <Form.Item
      name="name"
      label={t("Name")}
      rules={[{ required: true, whitespace: true, message: t("Enter a name") }]}
    >
      <Input placeholder="e.g. Maria" maxLength={200} />
    </Form.Item>
  );
}

/** Rename and activate/deactivate controls for one cashier row. */
export function CashierActions({ cashier }: { cashier: Cashier }) {
  const { t } = useLanguage();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const update = useUpdateCashier();

  const rename = async ({ name }: NameValues) => {
    try {
      await update.mutateAsync({ id: cashier.id, name: name.trim() });
      msg.success(t("Cashier renamed"));
    } catch (e) {
      showError(e, "Could not rename cashier");
      throw e; // keeps the modal open
    }
  };

  const toggleActive = async () => {
    try {
      await update.mutateAsync({ id: cashier.id, isActive: !cashier.isActive });
      msg.success(t(cashier.isActive ? "Cashier deactivated" : "Cashier reactivated"));
    } catch (e) {
      showError(e, "Could not update cashier");
    }
  };

  return (
    <Flex gap={8} justify="end">
      {msgHolder}
      {errorHolder}

      <CommonModalForm<NameValues>
        title={t("Rename cashier")}
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        okText={t("Save")}
        width={420}
        initialValues={{ name: cashier.name }}
        onSave={rename}
      >
        <CashierNameField />
      </CommonModalForm>

      <Popconfirm
        title={t(cashier.isActive ? "Deactivate this cashier?" : "Reactivate this cashier?")}
        description={
          cashier.isActive
            ? t("They'll no longer be offered for new slips. Existing slips keep them.")
            : t("They'll be offered for new slips again.")
        }
        okText={t(cashier.isActive ? "Deactivate" : "Reactivate")}
        okButtonProps={{ danger: cashier.isActive }}
        onConfirm={toggleActive}
      >
        <Button danger={cashier.isActive} loading={update.isPending}>
          {t(cashier.isActive ? "Deactivate" : "Reactivate")}
        </Button>
      </Popconfirm>
    </Flex>
  );
}
