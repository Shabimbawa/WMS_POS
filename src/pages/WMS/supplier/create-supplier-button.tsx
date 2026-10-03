import { Form, Input, Radio, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { Supplier, SupplierKind } from "../../../queries/types";
import { useCreateSupplier } from "../../../queries/useHooks";
import { useLanguage } from "../../../common/context/language-context";

type SupplierValues = {
  name: string;
  code?: string;
  kind: SupplierKind;
};

const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = {
  INTERNATIONAL: "International (containers)",
  LOCAL: "Local (truck deliveries)",
};

/**
 * "New supplier" button and modal. Pass `kind` where only one kind makes
 * sense (the shipment page is international, local deliveries are local)
 * and the choice is hidden. `onCreated` gets the new row, so the caller can
 * select it straight away.
 */
export function CreateSupplierButton({
  kind,
  onCreated,
}: {
  kind?: SupplierKind;
  onCreated?: (supplier: Supplier) => void;
}) {
  const { t } = useLanguage();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const create = useCreateSupplier();

  const save = async (values: SupplierValues) => {
    try {
      const supplier = await create.mutateAsync({
        name: values.name.trim(),
        code: values.code?.trim() || null,
        kind: kind ?? values.kind,
      });
      msg.success(t("Added supplier {name}", { name: supplier.name }));
      onCreated?.(supplier);
    } catch (e) {
      showError(e, "Could not add supplier");
      throw e; // keeps the modal open
    }
  };

  return (
    <>
      {msgHolder}
      {contextHolder}
      <CommonModalForm<SupplierValues>
        title={t(kind ? (kind === "LOCAL" ? "New local supplier" : "New international supplier") : "New supplier")}
        triggerLabel={<><PlusOutlined /> {t("New supplier")}</>}
        triggerButtonType="default"
        okText={t("Add supplier")}
        width={440}
        initialValues={{ kind: kind ?? "INTERNATIONAL" }}
        onSave={save}
      >
        <Form.Item
          name="name"
          label={t("Name")}
          rules={[{ required: true, whitespace: true, message: t("Enter the supplier's name") }]}
        >
          <Input maxLength={200} placeholder="e.g. Vinh Phat Rice Co." />
        </Form.Item>
        <Form.Item name="code" label={t("Code")} tooltip={t("Optional short code, unique across suppliers")}>
          <Input maxLength={50} placeholder="e.g. VPR" />
        </Form.Item>
        {!kind && (
          <Form.Item
            name="kind"
            label={t("Type")}
            extra={t("Can't be changed once the supplier has shipments or deliveries.")}
            rules={[{ required: true }]}
          >
            <Radio.Group
              options={(["INTERNATIONAL", "LOCAL"] as const).map((value) => ({
                value,
                label: t(SUPPLIER_KIND_LABEL[value]),
              }))}
            />
          </Form.Item>
        )}
      </CommonModalForm>
    </>
  );
}
