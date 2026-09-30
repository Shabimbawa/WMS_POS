import { Flex, Form, Input, Tag, Tooltip, message } from "antd";
import { StopOutlined } from "@ant-design/icons";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { DateParser } from "../../../common/utils/util";
import type { LocalDeliveryRow } from "../../../queries/types";
import { useVoidDelivery } from "../../../queries/useHooks";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";

const dash = <span style={{ opacity: 0.45 }}>—</span>;

const totalSacks = (r: LocalDeliveryRow) =>
  r.items.reduce((n, i) => n + i.qty_sacks, 0);

const totalValue = (r: LocalDeliveryRow) =>
  r.items.reduce((n, i) => n + i.qty_sacks * (i.price_per_sack ?? 0), 0);

type VoidValues = { reason: string };

/**
 * Voiding reverses the stock the delivery added, so it is refused once those
 * sacks have been sold. There is no edit: the record stays, marked voided.
 */
function DeliveryActions({ delivery }: { delivery: LocalDeliveryRow }) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const voidIt = useVoidDelivery();

  if (delivery.voided_at) {
    return (
      <Tooltip title={delivery.void_reason ?? undefined}>
        <Tag style={{ margin: 0 }}>Voided</Tag>
      </Tooltip>
    );
  }

  const save = async ({ reason }: VoidValues) => {
    try {
      await voidIt.mutateAsync({ id: delivery.id, reason: reason.trim() });
      msg.success("Delivery voided — its stock has been reversed");
    } catch (e) {
      showError(e, "Could not void delivery");
      throw e; // keeps the modal open
    }
  };

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {errorHolder}
      <Tooltip title="Void delivery">
        <span>
          <CommonModalForm<VoidValues>
            title="Void this delivery?"
            triggerLabel={<StopOutlined />}
            triggerButtonType="text"
            okText="Void"
            width={460}
            onSave={save}
          >
            <Form.Item
              name="reason"
              label="Reason"
              rules={[
                { required: true, whitespace: true, message: "Enter a reason" },
                { min: 3, message: "At least 3 characters" },
              ]}
              extra="The sacks this delivery added are removed from stock again."
            >
              <Input.TextArea
                rows={3}
                maxLength={2000}
                placeholder="e.g. Counted twice by mistake"
              />
            </Form.Item>
          </CommonModalForm>
        </span>
      </Tooltip>
    </Flex>
  );
}

const deliveryColumns: ColumnDef<LocalDeliveryRow, any>[] = [
  {
    id: "date_received",
    header: "Received",
    accessorFn: (r) => r.date_received,
    size: 140,
    meta: { fixed: "left" },
    cell: (c) => DateParser(c.getValue<string>()),
  },
  {
    id: "supplier",
    header: "Supplier",
    accessorFn: (r) => r.supplier.name,
    size: 140,
  },
  {
    id: "reference",
    header: "Reference",
    accessorFn: (r) => r.reference,
    size: 150,
    cell: (c) => c.getValue<string | null>() ?? dash,
  },
  {
    id: "items",
    header: "Products",
    accessorFn: (r) => r.items.length,
    size: 300,
    // Sacks per brand, as the expanded container rows show them.
    cell: (c) => {
      const items = c.row.original.items;
      if (!items.length) return dash;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((i) => (
            <div
              key={i.id}
              style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
            >
              <span>{fmtProduct(i.product_category)}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtInt(i.qty_sacks)}
              </span>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    id: "total_sacks",
    header: "Sacks",
    accessorFn: totalSacks,
    size: 100,
    cell: (c) => fmtInt(c.getValue<number>()),
  },
  {
    id: "total_value",
    header: "Value",
    accessorFn: totalValue,
    size: 150,
    cell: (c) => {
      const partial = c.row.original.items.some((i) => i.price_per_sack === null);
      const v = c.getValue<number>();
      return partial ? (
        <Tooltip title="Some lines have no price recorded">
          <span style={{ opacity: 0.6 }}>{fmtMoney(v)}*</span>
        </Tooltip>
      ) : (
        fmtMoney(v)
      );
    },
  },
  {
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 100,
    meta: { fixed: "right" },
    cell: (c) => <DeliveryActions delivery={c.row.original} />,
  },
];

export function DeliveryTable({ data }: { data: LocalDeliveryRow[] }) {
  return <DataTable data={data} columns={deliveryColumns} />;
}
