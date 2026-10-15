import { Form, Input, Select, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { ShippingCompany } from "../../../queries/types";
import { useCreateShippingCompany } from "../../../queries/useHooks";
import { useLanguage } from "../../../common/context/language-context";

type ShippingCompanyValues = {
  name: string;
  codes?: string[];
};

/** "New shipping company" button and modal. */
export function CreateShippingCompanyButton({
  onCreated,
}: {
  onCreated?: (company: ShippingCompany) => void;
}) {
  const { t } = useLanguage();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const create = useCreateShippingCompany();

  const save = async (values: ShippingCompanyValues) => {
    try {
      const company = await create.mutateAsync({
        name: values.name.trim(),
        codes: (values.codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean),
      });
      msg.success(t("Shipping company added"));
      onCreated?.(company);
    } catch (e) {
      showError(e, "Could not add shipping company");
      throw e; // keeps the modal open
    }
  };

  return (
    <>
      {msgHolder}
      {contextHolder}
      <CommonModalForm<ShippingCompanyValues>
        title={t("New shipping company")}
        triggerLabel={
          <>
            <PlusOutlined /> {t("New shipping company")}
          </>
        }
        triggerButtonType="default"
        okText={t("Add")}
        width={440}
        onSave={save}
      >
        <Form.Item
          name="name"
          label={t("Name")}
          rules={[
            { required: true, whitespace: true, message: t("Enter the name") },
          ]}
        >
          <Input maxLength={200} placeholder="e.g. Maersk Line" />
        </Form.Item>
        <Form.Item
          name="codes"
          label={t("Container codes")}
          tooltip={t("Type a code and press Enter. Codes must be unique across shipping companies.")}
        >
          <Select mode="tags" tokenSeparators={[",", " "]} placeholder="e.g. MSK, MAEU" maxTagCount="responsive" />
        </Form.Item>
      </CommonModalForm>
    </>
  );
}
