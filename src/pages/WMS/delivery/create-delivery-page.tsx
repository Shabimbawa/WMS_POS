import { useMemo, useState } from "react";
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
  Skeleton,
  Typography,
  message,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import {
  useCreateDelivery,
  useProductCategories,
  useSuppliers,
} from "../../../queries/useHooks";
import type { ProductCategory } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import {
  DraftItemTable,
  ProductReferenceTable,
  type DraftItem,
} from "../container/create-shipment-table";

type ItemValues = {
  product_category_id: string;
  qty_sacks: number;
  price_per_sack?: number | null;
};

function ItemFields({
  products,
  taken,
}: {
  products: ProductCategory[];
  taken: Set<string>;
}) {
  return (
    <>
      <Form.Item
        name="product_category_id"
        label="Product"
        rules={[
          { required: true, message: "Pick a product" },
          {
            validator: (_, v: string | undefined) =>
              v && taken.has(v)
                ? Promise.reject(new Error("Already on this delivery"))
                : Promise.resolve(),
          },
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Search by code or brand"
          options={products.map((p) => ({ label: fmtProduct(p), value: p.id }))}
        />
      </Form.Item>
      <Form.Item
        name="qty_sacks"
        label="Sacks counted"
        rules={[{ required: true, message: "Enter the counted quantity" }]}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item
        name="price_per_sack"
        label="Price / sack"
        extra="What it cost to buy. Optional."
      >
        <InputNumber min={0} precision={2} prefix="₱" style={{ width: "100%" }} />
      </Form.Item>
    </>
  );
}

/**
 * One local supplier, one date, a list of counted lines. No containers and no
 * declared quantities — what is entered here is what arrived.
 */
export default function CreateDeliveryPage() {
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({
    kind: "LOCAL",
  });
  const { data: products = [], isPending: loadingProducts } =
    useProductCategories();
  const create = useCreateDelivery();

  const [supplierId, setSupplierId] = useState<string | undefined>();
  const [dateReceived, setDateReceived] = useState<Dayjs>(() => dayjs());
  const [reference, setReference] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const taken = useMemo(
    () => new Set(items.map((i) => i.product_category_id)),
    [items],
  );

  const totals = items.reduce(
    (t, i) => ({
      sacks: t.sacks + i.qty_sacks,
      value: t.value + i.qty_sacks * (i.price_per_sack ?? 0),
    }),
    { sacks: 0, value: 0 },
  );

  const addItem = (v: ItemValues) =>
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_category_id: v.product_category_id,
        qty_sacks: v.qty_sacks,
        price_per_sack: v.price_per_sack ?? null,
      },
    ]);

  const editItem = (key: string, v: ItemValues) =>
    setItems((prev) =>
      prev.map((i) =>
        i.key === key
          ? {
              key,
              product_category_id: v.product_category_id,
              qty_sacks: v.qty_sacks,
              price_per_sack: v.price_per_sack ?? null,
            }
          : i,
      ),
    );

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const renderActions = (item: DraftItem) => (
    <Flex gap={4} justify="end">
      <CommonModalForm<ItemValues>
        title="Edit item"
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        okText="Save"
        initialValues={{
          product_category_id: item.product_category_id,
          qty_sacks: item.qty_sacks,
          price_per_sack: item.price_per_sack ?? undefined,
        }}
        onSave={(v) => editItem(item.key, v)}
      >
        <ItemFields
          products={products}
          // its own product is still allowed
          taken={new Set([...taken].filter((id) => id !== item.product_category_id))}
        />
      </CommonModalForm>
      <Popconfirm
        title="Remove this item?"
        okText="Remove"
        okButtonProps={{ danger: true }}
        onConfirm={() => removeItem(item.key)}
      >
        <Button type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </Flex>
  );

  const canSubmit = Boolean(supplierId) && items.length > 0;

  const submit = async () => {
    if (!supplierId) return;
    try {
      await create.mutateAsync({
        supplierId,
        dateReceived: dateReceived.format("YYYY-MM-DD"),
        reference: reference.trim() || null,
        // the client-side key is not part of the payload
        items: items.map((item) => ({
          product_category_id: item.product_category_id,
          qty_sacks: item.qty_sacks,
          price_per_sack: item.price_per_sack,
        })),
      });
      msg.success("Delivery logged — stock updated");
      navigate("/deliveries");
    } catch (e) {
      showError(e, "Could not log delivery");
    }
  };

  const cancel = () => {
    if (!items.length && !supplierId) {
      navigate("/deliveries");
      return;
    }
    Modal.confirm({
      title: "Discard this delivery?",
      content: "Nothing is saved and no stock moves.",
      okText: "Discard",
      okButtonProps: { danger: true },
      cancelText: "Keep editing",
      onOk: () => navigate("/deliveries"),
    });
  };

  return (
    <Flex gap={16} align="start">
      {msgHolder}
      {errorHolder}

      <Flex vertical gap={16} style={{ flex: 1, minWidth: 0 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Log local delivery
        </Typography.Title>
        <Typography.Text type="secondary">
          Counted as it came off the truck. Submitting moves stock immediately.
        </Typography.Text>

        <Card size="small">
          <Flex wrap gap={12} align="start">
            <Form layout="vertical" style={{ marginBottom: 0 }}>
              <Form.Item label="Supplier" required style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Select local supplier"
                  style={{ minWidth: 240 }}
                  loading={loadingSuppliers}
                  value={supplierId}
                  onChange={setSupplierId}
                  options={suppliers?.map((s) => ({
                    label: s.name,
                    value: s.id,
                  }))}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Form>
            <Form layout="vertical">
              <Form.Item label="Date received" style={{ marginBottom: 0 }}>
                <DatePicker
                  value={dateReceived}
                  allowClear={false}
                  format="MMMM DD, YYYY"
                  onChange={(d) => d && setDateReceived(d)}
                />
              </Form.Item>
            </Form>
            <Form layout="vertical">
              <Form.Item label="Reference" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="Delivery receipt no. (optional)"
                  style={{ minWidth: 220 }}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={500}
                />
              </Form.Item>
            </Form>
          </Flex>
        </Card>

        <Card
          size="small"
          title="Items counted"
          extra={
            <CommonModalForm<ItemValues>
              title="Add item"
              triggerLabel={
                <>
                  <PlusOutlined /> Add Item
                </>
              }
              okText="Add"
              onSave={addItem}
            >
              <ItemFields products={products} taken={taken} />
            </CommonModalForm>
          }
        >
          {items.length ? (
            <DraftItemTable
              items={items}
              productsById={productsById}
              renderActions={renderActions}
            />
          ) : (
            <Empty description="No items yet" />
          )}
        </Card>

        <Flex justify="space-between" align="center" wrap gap={8}>
          <Typography.Text type="secondary">
            {fmtInt(items.length)} items · {fmtInt(totals.sacks)} sacks ·{" "}
            {fmtMoney(totals.value)}
          </Typography.Text>
          <Flex gap={8}>
            <Button onClick={cancel}>Cancel</Button>
            <Button
              type="primary"
              onClick={submit}
              disabled={!canSubmit}
              loading={create.isPending}
            >
              Log delivery
            </Button>
          </Flex>
        </Flex>
      </Flex>

      <Card
        size="small"
        title="Registered products"
        style={{ width: 380, flexShrink: 0, position: "sticky", top: 0 }}
      >
        {loadingProducts ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <div style={{ maxHeight: "calc(100vh - 220px)", overflow: "auto" }}>
            <ProductReferenceTable data={products} />
          </div>
        )}
      </Card>
    </Flex>
  );
}
