import { useMemo } from "react";
import { Flex, Form, Input, Tag, Tooltip, message } from "antd";
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
  code?: string | null;
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
          code: values.code?.trim() || null,
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
              code: company.code ?? undefined,
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
            <Form.Item name="code" label="Code">
              <Input maxLength={50} placeholder="Optional" />
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
              <span style={{ color: "rgba(0, 0, 0, 0.65)" }}>
                Existing containers keep this shipping company. It will no longer
                appear in dropdowns.
              </span>
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
        id: "code",
        header: "Code",
        accessorFn: (s) => s.code,
        size: 140,
        cell: (c) => c.getValue<string | null>() ?? "-",
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
