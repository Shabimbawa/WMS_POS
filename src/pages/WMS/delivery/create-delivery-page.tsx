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
  Typography,
  message,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import {
  useCreateDelivery,
  useProductCategories,
  useSuppliers,
  useUpdateDelivery,
} from "../../../queries/useHooks";
import type { LocalDeliveryRow, ProductCategory } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import {
  DraftItemTable,
  type DraftItem,
} from "../container/create-shipment-table";
import {
  confirmNegativeInventory,
  isNegativeInventoryError,
} from "../container/negative-inventory";
import { useLanguage } from "../../../common/context/language-context";

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
  const { t } = useLanguage();
  return (
    <>
      <Form.Item
        name="product_category_id"
        label={t("Product")}
        rules={[
          { required: true, message: t("Pick a product") },
          {
            validator: (_, v: string | undefined) =>
              v && taken.has(v)
                ? Promise.reject(new Error(t("Already on this delivery")))
                : Promise.resolve(),
          },
        ]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t("Search by code or brand")}
          options={products.map((p) => ({ label: fmtProduct(p), value: p.id }))}
        />
      </Form.Item>
      <Form.Item
        name="qty_sacks"
        label={t("Sacks counted")}
        rules={[{ required: true, message: t("Enter the counted quantity") }]}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item
        name="price_per_sack"
        label={t("Price / sack")}
        extra={t("What it cost to buy. Optional.")}
      >
        <InputNumber min={0} precision={2} prefix="₱" style={{ width: "100%" }} />
      </Form.Item>
    </>
  );
}

/**
 * One local supplier, one date, a list of counted lines. No containers and no
 * declared quantities — what is entered here is what arrived.
 *
 * At /deliveries/:deliveryId/edit the same form edits a delivery passed in
 * through router state; saving moves only the difference in sacks.
 */
export default function CreateDeliveryPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { deliveryId } = useParams();
  const editing = (location.state as { delivery?: LocalDeliveryRow } | null)?.delivery;
  const isEditing = Boolean(deliveryId && editing);
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({
    kind: "LOCAL",
  });
  const { data: products = [] } =
    useProductCategories();
  const create = useCreateDelivery();
  const update = useUpdateDelivery();

  const [supplierId, setSupplierId] = useState<string | undefined>(editing?.supplier.id);
  const [dateReceived, setDateReceived] = useState<Dayjs>(() =>
    editing ? dayjs(editing.date_received) : dayjs(),
  );
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [items, setItems] = useState<DraftItem[]>(() =>
    (editing?.items ?? []).map((item) => ({
      key: item.id,
      product_category_id: item.product_category.id,
      qty_sacks: item.qty_sacks,
      price_per_sack: item.price_per_sack,
    })),
  );
  const [dirty, setDirty] = useState(false);

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

  const addItem = (v: ItemValues) => {
    setDirty(true);
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_category_id: v.product_category_id,
        qty_sacks: v.qty_sacks,
        price_per_sack: v.price_per_sack ?? null,
      },
    ]);
  };

  const editItem = (key: string, v: ItemValues) => {
    setDirty(true);
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
  };

  const removeItem = (key: string) => {
    setDirty(true);
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const renderActions = (item: DraftItem) => (
    <Flex gap={4} justify="end">
      <CommonModalForm<ItemValues>
        title={t("Edit item")}
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        okText={t("Save")}
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
        title={t("Remove this item?")}
        okText={t("Remove")}
        okButtonProps={{ danger: true }}
        onConfirm={() => removeItem(item.key)}
      >
        <Button type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </Flex>
  );

  const canSubmit = Boolean(supplierId) && items.length > 0;

  // Opened at the edit URL without a delivery (e.g. after a refresh): there is
  // nothing to edit, and submitting would log a new delivery instead.
  if (deliveryId && !editing) return <Navigate to="/deliveries" replace />;

  const submit = async (allowNegativeInventory = false) => {
    if (!supplierId) return;
    const input = {
      supplierId,
      dateReceived: dateReceived.format("YYYY-MM-DD"),
      reference: reference.trim() || null,
      // the client-side key is not part of the payload
      items: items.map((item) => ({
        product_category_id: item.product_category_id,
        qty_sacks: item.qty_sacks,
        price_per_sack: item.price_per_sack,
      })),
    };
    try {
      if (isEditing && deliveryId) {
        await update.mutateAsync({ id: deliveryId, input: { ...input, allowNegativeInventory } });
        msg.success(t("Delivery updated — stock adjusted"));
      } else {
        await create.mutateAsync(input);
        msg.success(t("Delivery logged — stock updated"));
      }
      navigate("/deliveries");
    } catch (e) {
      if (isNegativeInventoryError(e)) {
        confirmNegativeInventory({
          error: e,
          t,
          intro: t("Saving these corrections will result in negative stock:"),
          okText: t("Save anyway"),
          labelOf: (productId) => {
            const product = productsById.get(productId);
            return product ? fmtProduct(product) : productId;
          },
          onOk: () => submit(true),
        });
        return;
      }
      showError(e, isEditing ? "Could not update delivery" : "Could not log delivery");
    }
  };

  const cancel = () => {
    if (isEditing ? !dirty : !items.length && !supplierId) {
      navigate("/deliveries");
      return;
    }
    Modal.confirm({
      title: t(isEditing ? "Discard your changes?" : "Discard this delivery?"),
      content: t(isEditing ? "The delivery and its stock stay as they were." : "Nothing is saved and no stock moves."),
      okText: t("Discard"),
      okButtonProps: { danger: true },
      cancelText: t("Keep editing"),
      onOk: () => navigate("/deliveries"),
    });
  };

  return (
    <Flex vertical gap={16}>
      {msgHolder}
      {errorHolder}

      <Typography.Title level={4} style={{ margin: 0 }}>
        {t(isEditing ? "Edit local delivery" : "Log local delivery")}
      </Typography.Title>
      <Typography.Text type="secondary">
        {t(
          isEditing
            ? "Saving moves only the difference: added sacks go into stock, removed sacks come out."
            : "Counted as it came off the truck. Submitting moves stock immediately.",
        )}
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="start">
          <Form layout="vertical" style={{ marginBottom: 0 }}>
            <Form.Item label={t("Supplier")} required style={{ marginBottom: 0 }}>
              <Select
                placeholder={t("Select local supplier")}
                style={{ minWidth: 240 }}
                loading={loadingSuppliers}
                value={supplierId}
                onChange={(v) => {
                  setDirty(true);
                  setSupplierId(v);
                }}
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
            <Form.Item label={t("Date received")} style={{ marginBottom: 0 }}>
              <DatePicker
                value={dateReceived}
                allowClear={false}
                format="MMMM DD, YYYY"
                onChange={(d) => {
                  if (!d) return;
                  setDirty(true);
                  setDateReceived(d);
                }}
              />
            </Form.Item>
          </Form>
          <Form layout="vertical">
            <Form.Item label={t("Reference")} style={{ marginBottom: 0 }}>
              <Input
                placeholder={t("Delivery receipt no. (optional)")}
                style={{ minWidth: 220 }}
                value={reference}
                onChange={(e) => {
                  setDirty(true);
                  setReference(e.target.value);
                }}
                maxLength={500}
              />
            </Form.Item>
          </Form>
        </Flex>
      </Card>

      <Card
        size="small"
        title={t("Items counted")}
        extra={
          <CommonModalForm<ItemValues>
            title={t("Add item")}
            triggerLabel={
              <>
                <PlusOutlined /> {t("Add Item")}
              </>
            }
            okText={t("Add")}
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
          <Empty description={t("No items yet")} />
        )}
      </Card>

      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text type="secondary">
          {fmtInt(items.length)} {t("items")} · {fmtInt(totals.sacks)} {t("sacks")} ·{" "}
          {fmtMoney(totals.value)}
        </Typography.Text>
        <Flex gap={8}>
          <Button onClick={cancel}>{t("Cancel")}</Button>
          <Button
            type="primary"
            onClick={() => submit()}
            disabled={!canSubmit}
            loading={create.isPending || update.isPending}
          >
            {t(isEditing ? "Save changes" : "Log delivery")}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
