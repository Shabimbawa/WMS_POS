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
  Cashier,
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
import { useCashiers, usePosProducts } from "../../../queries/useHooks";
import { useLanguage } from "../../../common/context/language-context";

// ---- form value shapes -------------------------------------------

export type OrderSlipHeaderValues = {
  date: Dayjs;
  orderBy?: string;
  address?: string;
  status: PaymentStatus;
  /** Only shown, and only sent, while the slip is unpaid or partial. */
  paymentDueDate?: Dayjs;
  cashierId: string;
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
  notForSale,
}: {
  products: Product[];
  /** Products already on this slip, excluding the line being edited. */
  takenProductIds: Set<string>;
  /**
   * Saved lines whose product is no longer for sale, with the quantity
   * they were saved at. They can be kept or reduced, never increased.
   */
  notForSale: Map<string, number>;
}) {
  const { t } = useLanguage();
  const form = Form.useFormInstance<ItemValues>();
  const productId = Form.useWatch("productId", form);
  const savedMax = productId ? notForSale.get(productId) : undefined;
  const stock = savedMax ?? products.find((p) => p.id === productId)?.quantity;

  return (
    <>
      <Form.Item
        name="productId"
        label={t("Article")}
        rules={[
          { required: true, message: t("Pick an article") },
          {
            validator: (_, id: string) =>
              id && takenProductIds.has(id)
                ? Promise.reject(
                    new Error(t("This article is already on the slip")),
                  )
                : Promise.resolve(),
          },
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t("Search by brand or variant")}
          options={products.map((p) => {
            const max = notForSale.get(p.id);
            return {
              label: max !== undefined
                ? `${fmtProduct(p)} — ${fmtMoney(p.unitPrice)} · ${t("no longer for sale")}`
                : `${fmtProduct(p)} — ${fmtMoney(p.unitPrice)} · ${
                  p.quantity > 0 ? `${fmtInt(p.quantity)} ${t("in stock")}` : t("out of stock")
                }`,
              value: p.id,
              disabled: max === undefined && p.quantity <= 0,
            };
          })}
        />
      </Form.Item>
      <Form.Item
        name="quantity"
        label={t("Quantity")}
        dependencies={["productId"]}
        extra={
          savedMax !== undefined
            ? t("No longer for sale: keep up to {count}, the quantity already on this slip", { count: fmtInt(savedMax) })
            : stock !== undefined
              ? `${fmtInt(stock)} ${t("in stock")}`
              : undefined
        }
        rules={[
          { required: true, message: t("Enter a quantity") },
          // UX only — stock can change between here and submit, so the
          // backend has to re-check it when the slip is saved.
          {
            validator: (_, qty: number | undefined) =>
              qty !== undefined && stock !== undefined && qty > stock
                ? Promise.reject(
                    new Error(
                      savedMax !== undefined
                        ? t("Can't go above the {count} already on this slip", { count: fmtInt(savedMax) })
                        : t("Only {count} in stock", { count: fmtInt(stock) }),
                    ),
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
  /** The slip's cashier when editing, kept selectable even if deactivated. */
  currentCashier?: Cashier;
  /**
   * The slip's articles as saved, priced at what they sold for. Lets lines
   * whose product is no longer for sale still show and be kept or reduced.
   */
  savedProducts?: Product[];
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
  currentCashier,
  savedProducts,
  submitLabel,
  submitting,
  errorTitle,
  cancelTo,
  onSubmit,
}: OrderSlipFormProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const { data: activeCashiers = [], isPending: loadingCashiers } = useCashiers();
  // Only active cashiers can be picked, but a slip already assigned to one
  // who's since been deactivated keeps showing them.
  const cashierOptions = useMemo(() => {
    const list = [...activeCashiers];
    if (currentCashier && !list.some((c) => c.id === currentCashier.id)) {
      list.push(currentCashier);
    }
    return list.map((c) => ({
      value: c.id,
      label: c.isActive ? c.name : `${c.name} (${t("Inactive")})`,
    }));
  }, [activeCashiers, currentCashier, t]);

  const { data: liveProducts = [] } = usePosProducts();
  // While editing, add the slip's existing quantities back to the displayed
  // availability. The backend does the same inside its locked transaction.
  const existingQuantity = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of initialItems) {
      result.set(item.productId, (result.get(item.productId) ?? 0) + item.quantity);
    }
    return result;
  }, [initialItems]);
  const products = useMemo(
    () => liveProducts.map((product) => ({
      ...product,
      quantity: product.quantity + (existingQuantity.get(product.id) ?? 0),
    })),
    [liveProducts, existingQuantity],
  );
  // The live list only has products for sale. A saved line whose product
  // has since been made unavailable comes from the slip itself instead,
  // capped at the quantity it was saved with (the backend allows no more).
  const notForSaleProducts = useMemo(() => {
    const liveIds = new Set(liveProducts.map((p) => p.id));
    return (savedProducts ?? []).filter((p) => !liveIds.has(p.id));
  }, [liveProducts, savedProducts]);
  const notForSale = useMemo(
    () => new Map(notForSaleProducts.map((p) => [p.id, existingQuantity.get(p.id) ?? 0])),
    [notForSaleProducts, existingQuantity],
  );
  const pickableProducts = useMemo(
    () => [...products, ...notForSaleProducts],
    [products, notForSaleProducts],
  );

  const [form] = Form.useForm<OrderSlipHeaderValues>();
  const status = Form.useWatch("status", form);
  const [items, setItems] = useState<DraftOrderItem[]>(initialItems);
  const [itemsChanged, setItemsChanged] = useState(false);

  const productsById = useMemo(
    () => new Map(pickableProducts.map((p) => [p.id, p])),
    [pickableProducts],
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
        title={t("Edit article")}
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        initialValues={{ productId: item.productId, quantity: item.quantity }}
        onSave={(v) => updateItem(item.key, v)}
      >
        <ItemFormFields
          products={pickableProducts}
          takenProductIds={takenIds(item.key)}
          notForSale={notForSale}
        />
      </CommonModalForm>
      <Popconfirm
        title={t("Remove this article?")}
        okText={t("Remove")}
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
        orderBy: header.orderBy?.trim() ?? "",
        address: header.address?.trim() ?? "",
        status: header.status,
        // A paid slip's due date is the day it's saved; the backend sets it.
        paymentDueDate:
          header.status === "paid"
            ? undefined
            : header.paymentDueDate?.format("YYYY-MM-DD"),
        cashierId: header.cashierId,
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
      title: t("Discard your changes?"),
      content: t("Everything entered on this page will be lost."),
      okText: t("Discard"),
      okButtonProps: { danger: true },
      cancelText: t("Keep editing"),
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
            {fmtInt(items.length)} {t("articles")} · {fmtInt(totalQuantity)} {t("qty")}
          </Typography.Text>
        </Flex>

        <Card size="small" title={t("Order details")}>
          <Form form={form} layout="vertical" initialValues={initialValues}>
            <Flex wrap gap={12}>
              <Form.Item
                name="orderBy"
                label={t("Order by")}
                style={{ flex: 1, minWidth: 220 }}
              >
                <Input placeholder={t("Customer name (optional)")} />
              </Form.Item>
              <Form.Item
                name="date"
                label={t("Date")}
                rules={[{ required: true, message: t("Pick a date") }]}
                style={{ minWidth: 200 }}
              >
                <DatePicker
                  allowClear={false}
                  format="MMMM DD, YYYY"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Flex>
            <Flex wrap gap={12}>
              <Form.Item
                name="address"
                label={t("Address")}
                style={{ flex: 1, minWidth: 220 }}
              >
                <Input placeholder={t("Delivery address (optional)")} />
              </Form.Item>
              <Form.Item
                name="cashierId"
                label={t("Cashier")}
                rules={[{ required: true, message: t("Assign a cashier") }]}
                style={{ minWidth: 200 }}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t("Select cashier")}
                  loading={loadingCashiers}
                  options={cashierOptions}
                  notFoundContent={
                    loadingCashiers ? undefined : t("No active cashiers — add one on the Cashiers page")
                  }
                />
              </Form.Item>
            </Flex>
            <Flex wrap gap={12}>
              <Form.Item
                name="status"
                label={t("Payment status")}
                rules={[{ required: true, message: t("Pick a status") }]}
                style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
              >
                <Select
                  options={(
                    Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]
                  ).map((s) => ({ label: t(PAYMENT_STATUS_LABEL[s]), value: s }))}
                />
              </Form.Item>
              {status !== "paid" && (
                <Form.Item
                  name="paymentDueDate"
                  label={t("Payment due")}
                  dependencies={["date"]}
                  rules={[
                    { required: true, message: t("Pick a due date") },
                    ({ getFieldValue }) => ({
                      validator: (_, v: Dayjs | undefined) =>
                        v && v.isBefore(getFieldValue("date"), "day")
                          ? Promise.reject(
                              new Error(t("Can't be before the slip date")),
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
              )}
            </Flex>
          </Form>
        </Card>

        <Card
          size="small"
          title={t("Articles")}
          extra={
            <CommonModalForm<ItemValues>
              title={t("Add article")}
              triggerLabel={
                <>
                  <PlusOutlined /> {t("Add article")}
                </>
              }
              okText={t("Add")}
              onSave={addItem}
            >
              <ItemFormFields
                products={pickableProducts}
                takenProductIds={takenIds()}
                notForSale={notForSale}
              />
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
                <Typography.Text type="secondary">{t("Total amount")}</Typography.Text>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {fmtMoney(totalAmount)}
                </Typography.Text>
              </Flex>
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("No articles yet")}
            />
          )}
        </Card>

        <Flex justify="end" gap={8}>
          <Button onClick={cancel}>{t("Cancel")}</Button>
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
        title={t("Products")}
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
