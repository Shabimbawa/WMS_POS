import { useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Typography,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type {
  CreateOrderSlipInput,
  PaymentStatus,
  Product,
} from "../../../queries/posTypes";
import {
  fmtInt,
  fmtMoney,
  fmtProduct,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import {
  DraftOrderItemTable,
  ProductPriceTable,
  type DraftOrderItem,
} from "./create-orderslip-table";
// TODO(backend): mock data. PRODUCTS becomes a products query hook.
import { PRODUCTS } from "./orderslip-data";

// ---- form value shapes -------------------------------------------

export type OrderSlipHeaderValues = {
  date: Dayjs;
  orderBy: string;
  address?: string;
  status: PaymentStatus;
  paymentDueDate: Dayjs;
};

type ItemValues = {
  productId: string;
  quantity: number;
};

const newKey = () => crypto.randomUUID();

// ---- modal form ----------------------------------------------------

function ItemFormFields({
  products,
  takenProductIds,
}: {
  products: Product[];
  /** Products already on this slip, excluding the line being edited. */
  takenProductIds: Set<string>;
}) {
  const form = Form.useFormInstance<ItemValues>();
  const productId = Form.useWatch("productId", form);
  const stock = products.find((p) => p.id === productId)?.quantity;

  return (
    <>
      <Form.Item
        name="productId"
        label="Article"
        rules={[
          { required: true, message: "Pick an article" },
          {
            validator: (_, id: string) =>
              id && takenProductIds.has(id)
                ? Promise.reject(
                    new Error("This article is already on the slip"),
                  )
                : Promise.resolve(),
          },
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Search by brand or variant"
          options={products.map((p) => ({
            label: `${fmtProduct(p)} — ${fmtMoney(p.unitPrice)} · ${
              p.quantity > 0 ? `${fmtInt(p.quantity)} in stock` : "out of stock"
            }`,
            value: p.id,
            disabled: p.quantity <= 0,
          }))}
        />
      </Form.Item>
      <Form.Item
        name="quantity"
        label="Quantity"
        dependencies={["productId"]}
        extra={stock !== undefined ? `${fmtInt(stock)} in stock` : undefined}
        rules={[
          { required: true, message: "Enter a quantity" },
          // UX only — stock can change between here and submit, so the
          // backend has to re-check it when the slip is saved.
          {
            validator: (_, qty: number | undefined) =>
              qty !== undefined && stock !== undefined && qty > stock
                ? Promise.reject(
                    new Error(`Only ${fmtInt(stock)} in stock`),
                  )
                : Promise.resolve(),
          },
        ]}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
    </>
  );
}

// ---- shared create / edit form -----------------------------------

interface OrderSlipFormProps {
  title: ReactNode;
  initialValues: Partial<OrderSlipHeaderValues>;
  initialItems?: DraftOrderItem[];
  submitLabel: string;
  submitting: boolean;
  /** Error notification title when onSubmit throws. */
  errorTitle: string;
  /** Where Cancel goes, after confirming if anything changed. */
  cancelTo: string;
  /** Sends the payload. Throw to keep the user on the page. */
  onSubmit: (input: CreateOrderSlipInput) => Promise<void>;
}

/**
 * The order slip draft: header fields, article lines and a price reference.
 * Used by both the create and edit pages, which only differ in their
 * starting values and what they do on submit.
 */
export function OrderSlipForm({
  title,
  initialValues,
  initialItems = [],
  submitLabel,
  submitting,
  errorTitle,
  cancelTo,
  onSubmit,
}: OrderSlipFormProps) {
  const navigate = useNavigate();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const products = PRODUCTS;

  const [form] = Form.useForm<OrderSlipHeaderValues>();
  const [items, setItems] = useState<DraftOrderItem[]>(initialItems);
  const [itemsChanged, setItemsChanged] = useState(false);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // ---- draft state helpers ----

  const changeItems = (next: (is: DraftOrderItem[]) => DraftOrderItem[]) => {
    setItems(next);
    setItemsChanged(true);
  };

  const addItem = (v: ItemValues) =>
    changeItems((is) => [...is, { key: newKey(), ...v }]);

  const updateItem = (key: string, v: ItemValues) =>
    changeItems((is) => is.map((i) => (i.key === key ? { ...i, ...v } : i)));

  const removeItem = (key: string) =>
    changeItems((is) => is.filter((i) => i.key !== key));

  const takenIds = (exceptKey?: string) =>
    new Set(items.filter((i) => i.key !== exceptKey).map((i) => i.productId));

  const renderItemActions = (item: DraftOrderItem) => (
    <Flex gap={4} justify="end">
      <CommonModalForm<ItemValues>
        title="Edit article"
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        initialValues={{ productId: item.productId, quantity: item.quantity }}
        onSave={(v) => updateItem(item.key, v)}
      >
        <ItemFormFields
          products={products}
          takenProductIds={takenIds(item.key)}
        />
      </CommonModalForm>
      <Popconfirm
        title="Remove this article?"
        okText="Remove"
        okButtonProps={{ danger: true }}
        onConfirm={() => removeItem(item.key)}
      >
        <Button type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </Flex>
  );

  // ---- submit ----

  // Display only. The backend should compute the stored total from its own
  // prices rather than trust this figure.
  const totalAmount = items.reduce(
    (n, i) => n + i.quantity * (productsById.get(i.productId)?.unitPrice ?? 0),
    0,
  );
  const totalQuantity = items.reduce((n, i) => n + i.quantity, 0);

  const submit = async () => {
    const header = await form.validateFields();
    try {
      await onSubmit({
        date: header.date.format("YYYY-MM-DD"),
        orderBy: header.orderBy.trim(),
        address: header.address?.trim() ?? "",
        status: header.status,
        paymentDueDate: header.paymentDueDate.format("YYYY-MM-DD"),
        // client-side keys stay behind
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      });
    } catch (e) {
      showError(e, errorTitle);
    }
  };

  const cancel = () => {
    if (!form.isFieldsTouched() && !itemsChanged) {
      navigate(cancelTo);
      return;
    }
    Modal.confirm({
      title: "Discard your changes?",
      content: "Everything entered on this page will be lost.",
      okText: "Discard",
      okButtonProps: { danger: true },
      cancelText: "Keep editing",
      onOk: () => navigate(cancelTo),
    });
  };

  return (
    <Flex gap={16} align="start">
      {errorHolder}

      {/* ---- main: slip being built ---- */}
      <Flex vertical gap={16} style={{ flex: 1, minWidth: 0 }}>
        <Flex justify="space-between" align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          <Typography.Text type="secondary">
            {fmtInt(items.length)} articles · {fmtInt(totalQuantity)} qty
          </Typography.Text>
        </Flex>

        <Card size="small" title="Order details">
          <Form form={form} layout="vertical" initialValues={initialValues}>
            <Flex wrap gap={12}>
              <Form.Item
                name="orderBy"
                label="Order by"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "Enter the customer",
                  },
                ]}
                style={{ flex: 1, minWidth: 220 }}
              >
                <Input placeholder="Customer name" />
              </Form.Item>
              <Form.Item
                name="date"
                label="Date"
                rules={[{ required: true, message: "Pick a date" }]}
                style={{ minWidth: 200 }}
              >
                <DatePicker
                  allowClear={false}
                  format="MMMM DD, YYYY"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Flex>
            <Form.Item name="address" label="Address">
              <Input placeholder="Delivery address (optional)" />
            </Form.Item>
            <Flex wrap gap={12}>
              <Form.Item
                name="status"
                label="Payment status"
                rules={[{ required: true, message: "Pick a status" }]}
                style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
              >
                <Select
                  options={(
                    Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]
                  ).map((s) => ({ label: PAYMENT_STATUS_LABEL[s], value: s }))}
                />
              </Form.Item>
              <Form.Item
                name="paymentDueDate"
                label="Payment due"
                dependencies={["date"]}
                rules={[
                  { required: true, message: "Pick a due date" },
                  ({ getFieldValue }) => ({
                    validator: (_, v: Dayjs | undefined) =>
                      v && v.isBefore(getFieldValue("date"), "day")
                        ? Promise.reject(
                            new Error("Can't be before the slip date"),
                          )
                        : Promise.resolve(),
                  }),
                ]}
                style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
              >
                <DatePicker
                  allowClear={false}
                  format="MMMM DD, YYYY"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Flex>
          </Form>
        </Card>

        <Card
          size="small"
          title="Articles"
          extra={
            <CommonModalForm<ItemValues>
              title="Add article"
              triggerLabel={
                <>
                  <PlusOutlined /> Add Article
                </>
              }
              okText="Add"
              onSave={addItem}
            >
              <ItemFormFields products={products} takenProductIds={takenIds()} />
            </CommonModalForm>
          }
        >
          {items.length ? (
            <>
              <DraftOrderItemTable
                items={items}
                productsById={productsById}
                renderActions={renderItemActions}
              />
              <Flex
                justify="end"
                gap={16}
                style={{ marginTop: 12, paddingInline: 12 }}
              >
                <Typography.Text type="secondary">Total amount</Typography.Text>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {fmtMoney(totalAmount)}
                </Typography.Text>
              </Flex>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No articles yet"
            />
          )}
        </Card>

        <Flex justify="end" gap={8}>
          <Button onClick={cancel}>Cancel</Button>
          <Button
            type="primary"
            onClick={submit}
            disabled={items.length === 0}
            loading={submitting}
          >
            {submitLabel}
          </Button>
        </Flex>
      </Flex>

      {/* ---- side: price reference ---- */}
      <Card
        size="small"
        title="Products"
        style={{ width: 400, flexShrink: 0, position: "sticky", top: 0 }}
      >
        {/* paddingBottom: the antd table overhangs its box by 1px, which made
            this div show a vertical scrollbar that ate ~15px of width and
            pushed the Stock column out of view. */}
        <div
          style={{
            maxHeight: "calc(100vh - 220px)",
            overflow: "auto",
            paddingBottom: 1,
          }}
        >
          <ProductPriceTable data={products} />
        </div>
      </Card>
    </Flex>
  );
}
