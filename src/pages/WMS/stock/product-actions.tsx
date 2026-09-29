import { Flex, Form, Input, InputNumber, Switch, message } from "antd";
import { EditOutlined } from "@ant-design/icons";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { StockStatusRow } from "../../../queries/types";
import { useUpdateProduct } from "../../../queries/useHooks";
import { fmtProduct } from "../type-format/format";

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

/** Icon-only edit control for one stock row. */
export function ProductActions({ row }: { row: StockStatusRow }) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const update = useUpdateProduct();
  const product = row.product_category;

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
    </Flex>
  );
}
