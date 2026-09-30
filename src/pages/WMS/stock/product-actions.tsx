import {
  Flex,
  Form,
  Input,
  InputNumber,
  Segmented,
  Switch,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { FormInstance } from "antd";
import { EditOutlined, SlidersOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { StockStatusRow } from "../../../queries/types";
import { useAdjustStock, useUpdateProduct } from "../../../queries/useHooks";
import { fmtInt, fmtProduct } from "../type-format/format";

/** What both product modals collect. */
export type ProductValues = {
  brand: string;
  variety?: string;
  code?: string;
  sizeKg: number;
  isAvailable: boolean;
  sellingPrice?: number | null;
};

/** Blank optional text is stored as null, not "" — the label logic reads null. */
const trimmed = (v: string | undefined) => v?.trim() || null;

/**
 * Shared by Add Product and the row editor. `lockSize` disables the size
 * field: brand + variety + size is the product's identity, and every past
 * container item and stock movement points at it.
 */
export function ProductFields({ lockSize = false }: { lockSize?: boolean }) {
  return (
    <>
      <Flex gap={12}>
        <Form.Item
          name="brand"
          label="Brand"
          rules={[{ required: true, whitespace: true, message: "Enter a brand" }]}
          style={{ flex: 1 }}
        >
          <Input placeholder="e.g. Ganador" maxLength={200} />
        </Form.Item>
        <Form.Item name="variety" label="Variety" style={{ flex: 1 }}>
          <Input placeholder="Optional, e.g. Japonica" maxLength={200} />
        </Form.Item>
      </Flex>

      <Flex gap={12}>
        <Form.Item
          name="sizeKg"
          label="Size (kg)"
          rules={[{ required: true, message: "Enter a sack size" }]}
          extra={lockSize ? "Fixed after creation" : undefined}
          style={{ flex: 1 }}
        >
          <InputNumber min={0.001} disabled={lockSize} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="code"
          label="Notebook code"
          extra="Shorthand like G or P/LAMI"
          style={{ flex: 1 }}
        >
          <Input placeholder="Optional" maxLength={50} />
        </Form.Item>
      </Flex>

      <Form.Item
        name="isAvailable"
        label="Available for sale"
        valuePropName="checked"
        initialValue={false}
      >
        <Switch />
      </Form.Item>

      <Form.Item
        name="sellingPrice"
        label="Selling price / sack"
        extra="POS hides products with no price. A price on an unavailable product is a leftover."
      >
        <InputNumber
          min={0}
          precision={2}
          prefix="₱"
          placeholder="Optional"
          style={{ width: "100%" }}
        />
      </Form.Item>
    </>
  );
}

type AdjustValues = {
  direction: "add" | "remove";
  quantity: number;
  reason: string;
};

/**
 * A signed delta, never a target figure — working out the difference is what
 * keeps the ledger and the balance in agreement.
 */
function AdjustFields({
  form,
  onHand,
}: {
  form: FormInstance<AdjustValues>;
  onHand: number;
}) {
  const direction = Form.useWatch("direction", form) ?? "add";
  const quantity = Form.useWatch("quantity", form) ?? 0;
  const next = direction === "add" ? onHand + quantity : onHand - quantity;

  return (
    <>
      <Typography.Paragraph type="secondary">
        On hand now: <b>{fmtInt(onHand)}</b> sacks
      </Typography.Paragraph>

      <Form.Item name="direction" label="Direction">
        <Segmented
          options={[
            { label: "Add", value: "add" },
            { label: "Remove", value: "remove" },
          ]}
        />
      </Form.Item>

      <Form.Item
        name="quantity"
        label="Sacks"
        rules={[
          { required: true, message: "Enter a quantity" },
          {
            validator: (_, v: number | undefined) =>
              direction === "remove" && (v ?? 0) > onHand
                ? Promise.reject(
                    new Error(`Only ${fmtInt(onHand)} sacks are on hand`),
                  )
                : Promise.resolve(),
          },
        ]}
        extra={
          quantity > 0 ? `Balance becomes ${fmtInt(next)} sacks` : undefined
        }
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>

      <Form.Item
        name="reason"
        label="Reason"
        rules={[
          { required: true, whitespace: true, message: "Enter a reason" },
          { min: 3, message: "At least 3 characters" },
        ]}
        extra="Recorded on the movement — the only provenance a manual adjustment has."
      >
        <Input.TextArea
          rows={3}
          maxLength={2000}
          placeholder="e.g. Opening count, warehouse audit"
        />
      </Form.Item>
    </>
  );
}

/** Icon-only edit and stock-adjustment controls for one stock row. */
export function ProductActions({ row }: { row: StockStatusRow }) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const update = useUpdateProduct();
  const adjust = useAdjustStock();
  const product = row.product_category;

  const saveAdjustment = async (v: AdjustValues) => {
    try {
      const { remainingQty } = await adjust.mutateAsync({
        productCategoryId: product.id,
        quantityDelta: v.direction === "add" ? v.quantity : -v.quantity,
        reason: v.reason.trim(),
      });
      msg.success(`Stock adjusted — ${fmtInt(remainingQty)} sacks on hand`);
    } catch (e) {
      showError(e, "Could not adjust stock");
      throw e; // keeps the modal open
    }
  };

  const save = async (v: ProductValues) => {
    try {
      await update.mutateAsync({
        id: product.id,
        brand: v.brand.trim(),
        variety: trimmed(v.variety),
        code: trimmed(v.code),
        isAvailable: v.isAvailable,
        sellingPrice: v.sellingPrice ?? null,
      });
      msg.success("Product updated");
    } catch (e) {
      showError(e, "Could not update product");
      throw e; // keeps the modal open
    }
  };

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {errorHolder}

      <Tooltip title="Edit product">
        <span>
          <CommonModalForm<ProductValues>
            title={`Edit ${fmtProduct(product)}`}
            triggerLabel={<EditOutlined />}
            triggerButtonType="text"
            okText="Save"
            width={520}
            initialValues={{
              brand: product.brand,
              variety: product.variety ?? undefined,
              code: product.code ?? undefined,
              sizeKg: product.size_kg,
              isAvailable: product.is_available,
              sellingPrice: product.selling_price ?? undefined,
            }}
            onSave={save}
          >
            <ProductFields lockSize />
          </CommonModalForm>
        </span>
      </Tooltip>

      <Tooltip title="Adjust stock">
        <span>
          <CommonModalForm<AdjustValues>
            title={`Adjust stock · ${fmtProduct(product)}`}
            triggerLabel={<SlidersOutlined />}
            triggerButtonType="text"
            okText="Save adjustment"
            width={480}
            initialValues={{ direction: "add" }}
            onSave={saveAdjustment}
          >
            {(form) => <AdjustFields form={form} onHand={row.remaining_qty} />}
          </CommonModalForm>
        </span>
      </Tooltip>
    </Flex>
  );
}
