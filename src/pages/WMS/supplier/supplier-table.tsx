import { Flex, Form, Input, Tag, Tooltip, Typography, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { Supplier, SupplierKind } from "../../../queries/types";
import { useUpdateSupplier, useDeleteSupplier } from "../../../queries/useHooks";

const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = {
  INTERNATIONAL: "International",
  LOCAL: "Local",
  NATIONAL: "National",
};

const SUPPLIER_KIND_COLOR: Record<SupplierKind, string> = {
  INTERNATIONAL: "blue",
  LOCAL: "green",
  NATIONAL: "geekblue",
};

type EditValues = {
  name: string;
  code?: string | null;
  origin?: string | null;
};

function SupplierActions({
  supplier,
  onRefresh,
}: {
  supplier: Supplier;
  onRefresh: () => void;
}) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const updateMutation = useUpdateSupplier();
  const deleteMutation = useDeleteSupplier();

  const handleEdit = async (values: EditValues) => {
    try {
      await updateMutation.mutateAsync({
        id: supplier.id,
        input: {
          name: values.name.trim(),
          code: values.code?.trim() || null,
          origin: values.origin?.trim() || null,
        },
      });
      msg.success("Supplier updated");
      onRefresh();
    } catch (e) {
      showError(e, "Could not update supplier");
      throw e; // keeps the modal open
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(supplier.id);
      msg.success("Supplier deactivated");
      onRefresh();
    } catch (e) {
      showError(e, "Could not deactivate supplier");
    }
  };

  if (!supplier.is_active) {
    return (
      <Tooltip title="This supplier is inactive">
        <Tag style={{ margin: 0 }}>Inactive</Tag>
      </Tooltip>
    );
  }

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {errorHolder}
      <Tooltip title="Edit supplier">
        <span>
          <CommonModalForm<EditValues>
            title="Edit supplier"
            triggerLabel={<EditOutlined />}
            triggerButtonType="text"
            okText="Save"
            width={400}
            initialValues={{
              name: supplier.name,
              code: supplier.code ?? undefined,
              origin: supplier.origin ?? undefined,
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
            <Form.Item name="origin" label="Origin">
              <Input maxLength={200} placeholder="e.g. China, Beijing" />
            </Form.Item>
          </CommonModalForm>
        </span>
      </Tooltip>
      <Tooltip title="Deactivate supplier">
        <span>
          <CommonModalForm<{ reason: string }>
            title="Deactivate supplier?"
            triggerLabel={<DeleteOutlined />}
            triggerButtonType="text"
            okText="Deactivate"
            width={400}
            onSave={() => handleDelete()}
          >
            <Form.Item>
              <Typography.Text type="secondary">
                Active shipments and deliveries will remain intact. This supplier
                will no longer appear in dropdowns.
              </Typography.Text>
            </Form.Item>
          </CommonModalForm>
        </span>
      </Tooltip>
    </Flex>
  );
}

const supplierColumns: ColumnDef<Supplier, any>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (s) => s.name,
    size: 200,
    meta: { fixed: "left" },
  },
  {
    id: "code",
    header: "Code",
    accessorFn: (s) => s.code,
    size: 100,
    cell: (c) => c.getValue<string | null>() ?? "—",
  },
  {
    id: "origin",
    header: "Origin",
    accessorFn: (s) => s.origin,
    size: 160,
    cell: (c) => c.getValue<string | null>() ?? "-",
  },
  {
    id: "kind",
    header: "Type",
    accessorFn: (s) => s.kind,
    size: 120,
    cell: (c) => {
      const kind = c.getValue<SupplierKind>();
      return (
        <Tag color={SUPPLIER_KIND_COLOR[kind]}>{SUPPLIER_KIND_LABEL[kind]}</Tag>
      );
    },
  },
  {
    id: "actions",
    header: "",
    accessorFn: (s) => s.id,
    size: 100,
    meta: { fixed: "right" },
    cell: (c) => (
      <SupplierActions
        supplier={c.row.original}
        onRefresh={() => {
          // Trigger parent refresh
          window.location.reload();
        }}
      />
    ),
  },
];

export function SupplierTable({
  data,
  onRefresh,
}: {
  data: Supplier[];
  onRefresh: () => void;
}) {
  const columns = supplierColumns.map((col) => {
    if (col.id === "actions") {
      return {
        ...col,
        cell: (c: any) => (
          <SupplierActions supplier={c.row.original} onRefresh={onRefresh} />
        ),
      };
    }
    return col;
  });

  return <DataTable data={data} columns={columns} />;
}
