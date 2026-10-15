import { useMemo } from "react";
import { Flex, Form, Input, InputNumber, Select, Tag, Tooltip, Typography, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { ShippingCompany } from "../../../queries/types";
import {
  useDeleteShippingCompany,
  useUpdateShippingCompany,
} from "../../../queries/useHooks";

type EditValues = {
  name: string;
  codes?: string[];
  grace_period_days: number;
};

function ShippingCompanyActions({
  company,
  onRefresh,
}: {
  company: ShippingCompany;
  onRefresh: () => void;
}) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const updateMutation = useUpdateShippingCompany();
  const deleteMutation = useDeleteShippingCompany();

  const handleEdit = async (values: EditValues) => {
    try {
      await updateMutation.mutateAsync({
        id: company.id,
        input: {
          name: values.name.trim(),
          codes: (values.codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean),
          gracePeriodDays: values.grace_period_days,
        },
      });
      msg.success("Shipping company updated");
      onRefresh();
    } catch (e) {
      showError(e, "Could not update shipping company");
      throw e; // keeps the modal open
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(company.id);
      msg.success("Shipping company deactivated");
      onRefresh();
    } catch (e) {
      showError(e, "Could not deactivate shipping company");
    }
  };

  if (!company.is_active) {
    return (
      <Tooltip title="This shipping company is inactive">
        <Tag style={{ margin: 0 }}>Inactive</Tag>
      </Tooltip>
    );
  }

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {errorHolder}
      <Tooltip title="Edit shipping company">
        <span>
          <CommonModalForm<EditValues>
            title="Edit shipping company"
            triggerLabel={<EditOutlined />}
            triggerButtonType="text"
            okText="Save"
            width={400}
            initialValues={{
              name: company.name,
              codes: company.codes?.length ? company.codes : company.code ? [company.code] : [],
              grace_period_days: company.grace_period_days ?? undefined,
            }}
            onSave={handleEdit}
          >
            <Form.Item
              name="name"
              label="Name"
              rules={[
                { required: true, whitespace: true, message: "Enter the name" },
              ]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              name="codes"
              label="Container codes"
              tooltip="Type a code and press Enter. Each code can belong to only one shipping company."
            >
              <Select mode="tags" tokenSeparators={[",", " "]} placeholder="e.g. MSK, MAEU" maxTagCount="responsive" />
            </Form.Item>
            <Form.Item
              name="grace_period_days"
              label="Grace period"
              extra="Used to calculate the pull-out deadline from the port arrival date."
              rules={[{ required: true, message: "Enter the grace period" }]}
            >
              <InputNumber min={1} max={3650} precision={0} addonAfter="days" style={{ width: "100%" }} />
            </Form.Item>
          </CommonModalForm>
        </span>
      </Tooltip>
      <Tooltip title="Deactivate shipping company">
        <span>
          <CommonModalForm<{ reason?: string }>
            title="Deactivate shipping company?"
            triggerLabel={<DeleteOutlined />}
            triggerButtonType="text"
            okText="Deactivate"
            width={400}
            onSave={() => handleDelete()}
          >
            <Form.Item>
              <Typography.Text type="secondary">
                Existing containers keep this shipping company. It will no longer
                appear in dropdowns.
              </Typography.Text>
            </Form.Item>
          </CommonModalForm>
        </span>
      </Tooltip>
    </Flex>
  );
}

export function ShippingCompanyTable({
  data,
  onRefresh,
}: {
  data: ShippingCompany[];
  onRefresh: () => void;
}) {
  const columns = useMemo<ColumnDef<ShippingCompany, any>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorFn: (s) => s.name,
        size: 220,
        meta: { fixed: "left" },
      },
      {
        id: "codes",
        header: "Container codes",
        accessorFn: (s) => s.codes,
        size: 260,
        cell: (c) => {
          const company = c.row.original;
          const codes = company.codes?.length ? company.codes : company.code ? [company.code] : [];
          return codes.length
            ? <Flex gap={4} wrap>{codes.map((code) => <Tag key={code} style={{ margin: 0 }}>{code}</Tag>)}</Flex>
            : "-";
        },
      },
      {
        id: "grace_period_days",
        header: "Grace period",
        accessorFn: (s) => s.grace_period_days,
        size: 160,
        cell: (c) => c.getValue<number | null>()
          ? `${c.getValue<number>()} days`
          : <Tag color="warning" style={{ margin: 0 }}>Not configured</Tag>,
      },
      {
        id: "actions",
        header: "",
        accessorFn: (s) => s.id,
        size: 100,
        meta: { fixed: "right" },
        cell: (c) => (
          <ShippingCompanyActions company={c.row.original} onRefresh={onRefresh} />
        ),
      },
    ],
    [onRefresh],
  );

  return <DataTable data={data} columns={columns} />;
}
