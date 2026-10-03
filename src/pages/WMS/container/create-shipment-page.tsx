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
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import {
  useCreateShipment,
  useProductCategories,
  useSuppliers,
} from "../../../queries/useHooks";
import type { ProductCategory } from "../../../queries/types";
import { fmtInt, fmtProduct } from "../type-format/format";
import {
  DraftItemTable,
  ProductReferenceTable,
  type DraftContainer,
  type DraftItem,
} from "./create-shipment-table";
import { CreateSupplierButton } from "../supplier/create-supplier-button";
import { useLanguage } from "../../../common/context/language-context";

// ---- form value shapes -------------------------------------------

type HeaderValues = {
  supplier_id: string;
  date_list_received: Dayjs;
  reference?: string;
};

type ContainerValues = {
  container_no?: string;
  is_company_truck: boolean;
};

type ItemValues = {
  product_category_id: string;
  qty_sacks: number;
  price_per_sack?: number | null;
};

const newKey = () => crypto.randomUUID();

const toContainerFields = (v: ContainerValues) => ({
  container_no: v.container_no?.trim() || null,
  is_company_truck: Boolean(v.is_company_truck),
});

const toItemFields = (v: ItemValues) => ({
  product_category_id: v.product_category_id,
  qty_sacks: v.qty_sacks,
  price_per_sack: v.price_per_sack ?? null,
});

// ---- modal forms ---------------------------------------------------

function ContainerFormFields() {
  const { t } = useLanguage();
  return (
    <>
      <Form.Item name="container_no" label={t("Container no.")}>
        <Input
          placeholder={t("e.g. OCLU1395985 — leave blank if none")}
          style={{ fontFamily: "monospace" }}
        />
      </Form.Item>
      <Form.Item
        name="is_company_truck"
        label={t("Hauled by our own truck")}
        valuePropName="checked"
        initialValue={false}
      >
        <Switch />
      </Form.Item>
    </>
  );
}

function ItemFormFields({
  products,
  takenProductIds,
}: {
  products: ProductCategory[];
  /** Products already on this container, excluding the line being edited. */
  takenProductIds: Set<string>;
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
            validator: (_, id: string) =>
              id && takenProductIds.has(id)
                ? Promise.reject(
                    new Error(t("This product is already on this container")),
                  )
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
      <Flex gap={12}>
        <Form.Item
          name="qty_sacks"
          label={t("Sacks")}
          rules={[{ required: true, message: t("Enter a quantity") }]}
          style={{ flex: 1 }}
        >
          <InputNumber min={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="price_per_sack" label={t("Price / sack")} style={{ flex: 1 }}>
          <InputNumber
            min={0}
            precision={2}
            prefix="₱"
            placeholder={t("Optional")}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Flex>
    </>
  );
}

// ---- page ----------------------------------------------------------

export default function CreateShipmentPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({ kind: "INTERNATIONAL" });
  const { data: products = [], isPending: loadingProducts } =
    useProductCategories();
  const createShipment = useCreateShipment();

  const [form] = Form.useForm<HeaderValues>();
  const supplierId = Form.useWatch("supplier_id", form);
  const [containers, setContainers] = useState<DraftContainer[]>([]);

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // ---- draft state helpers ----

  const addContainer = (v: ContainerValues) =>
    setContainers((cs) => [
      ...cs,
      { key: newKey(), ...toContainerFields(v), items: [] },
    ]);

  const updateContainer = (key: string, v: ContainerValues) =>
    setContainers((cs) =>
      cs.map((c) => (c.key === key ? { ...c, ...toContainerFields(v) } : c)),
    );

  const removeContainer = (key: string) =>
    setContainers((cs) => cs.filter((c) => c.key !== key));

  const addItem = (containerKey: string, v: ItemValues) =>
    setContainers((cs) =>
      cs.map((c) =>
        c.key === containerKey
          ? { ...c, items: [...c.items, { key: newKey(), ...toItemFields(v) }] }
          : c,
      ),
    );

  const updateItem = (containerKey: string, itemKey: string, v: ItemValues) =>
    setContainers((cs) =>
      cs.map((c) =>
        c.key === containerKey
          ? {
              ...c,
              items: c.items.map((i) =>
                i.key === itemKey ? { ...i, ...toItemFields(v) } : i,
              ),
            }
          : c,
      ),
    );

  const removeItem = (containerKey: string, itemKey: string) =>
    setContainers((cs) =>
      cs.map((c) =>
        c.key === containerKey
          ? { ...c, items: c.items.filter((i) => i.key !== itemKey) }
          : c,
      ),
    );

  const takenIds = (container: DraftContainer, exceptItemKey?: string) =>
    new Set(
      container.items
        .filter((i) => i.key !== exceptItemKey)
        .map((i) => i.product_category_id),
    );

  const renderItemActions = (container: DraftContainer) => (item: DraftItem) => (
      <Flex gap={4} justify="end">
        <CommonModalForm<ItemValues>
          title={t("Edit item")}
          triggerLabel={<EditOutlined />}
          triggerButtonType="text"
          initialValues={{
            product_category_id: item.product_category_id,
            qty_sacks: item.qty_sacks,
            price_per_sack: item.price_per_sack,
          }}
          onSave={(v) => updateItem(container.key, item.key, v)}
        >
          <ItemFormFields
            products={products}
            takenProductIds={takenIds(container, item.key)}
          />
        </CommonModalForm>
        <Popconfirm
          title={t("Remove this item?")}
          okText={t("Remove")}
          okButtonProps={{ danger: true }}
          onConfirm={() => removeItem(container.key, item.key)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Flex>
  );

  // ---- submit ----

  const allSacks = containers.reduce(
    (n, c) => n + c.items.reduce((m, i) => m + i.qty_sacks, 0),
    0,
  );

  const canSubmit =
    Boolean(supplierId) &&
    containers.length > 0 &&
    containers.every((c) => c.items.length > 0);

  const submit = async () => {
    const header = await form.validateFields();
    try {
      await createShipment.mutateAsync({
        supplierId: header.supplier_id,
        dateListReceived: header.date_list_received.format("YYYY-MM-DD"),
        reference: header.reference?.trim() || null,
        // client-side keys stay behind
        containers: containers.map((c) => ({
          container_no: c.container_no,
          is_company_truck: c.is_company_truck,
          items: c.items.map((i) => ({
            product_category_id: i.product_category_id,
            qty_sacks: i.qty_sacks,
            price_per_sack: i.price_per_sack,
          })),
        })),
      });
      msg.success(t("Shipment registered"));
      navigate("/containers");
    } catch (e) {
      showError(e, "Could not register shipment");
    }
  };

  const cancel = () => {
    if (!form.isFieldsTouched() && containers.length === 0) {
      navigate("/containers");
      return;
    }
    Modal.confirm({
      title: t("Discard this shipment?"),
      content: t("Everything entered on this page will be lost."),
      okText: t("Discard"),
      okButtonProps: { danger: true },
      cancelText: t("Keep editing"),
      onOk: () => navigate("/containers"),
    });
  };

  return (
    <Flex gap={16} align="start">
      {msgHolder}
      {errorHolder}

      {/* ---- main: shipment being built ---- */}
      <Flex vertical gap={16} style={{ flex: 1, minWidth: 0 }}>
        <Flex justify="space-between" align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t("Register Shipment")}
          </Typography.Title>
          <Typography.Text type="secondary">
            {fmtInt(containers.length)} {t("containers")} · {fmtInt(allSacks)} {t("sacks")}
          </Typography.Text>
        </Flex>

        <Card size="small" title={t("Packing list")}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ date_list_received: dayjs() }}
          >
            <Flex wrap gap={12}>
              <Form.Item
                name="supplier_id"
                label={t("Supplier")}
                rules={[{ required: true, message: t("Pick a supplier") }]}
                style={{ flex: 1, minWidth: 220, marginBottom: 0 }}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t("Select supplier")}
                  loading={loadingSuppliers}
                  options={suppliers?.map((s) => ({
                    label: s.name,
                    value: s.id,
                  }))}
                />
              </Form.Item>
              <Form.Item label=" " colon={false} style={{ marginBottom: 0 }}>
                <CreateSupplierButton
                  kind="INTERNATIONAL"
                  onCreated={(supplier) => form.setFieldValue("supplier_id", supplier.id)}
                />
              </Form.Item>
              <Form.Item
                name="date_list_received"
                label={t("List received")}
                rules={[{ required: true, message: t("Pick a date") }]}
                style={{ minWidth: 200, marginBottom: 0 }}
              >
                <DatePicker
                  allowClear={false}
                  format="MMMM DD, YYYY"
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                name="reference"
                label={t("Reference")}
                style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
              >
                <Input placeholder="e.g. PL-2026-0915 (optional)" />
              </Form.Item>
            </Flex>
          </Form>
        </Card>

        {containers.map((container, index) => (
          <Card
            key={container.key}
            size="small"
            title={
              <Flex align="center" gap={8}>
                <Typography.Text type="secondary">#{index + 1}</Typography.Text>
                <span style={{ fontFamily: "monospace" }}>
                  {container.container_no ?? t("No container no.")}
                </span>
                {container.is_company_truck && <Tag color="blue">{t("Own truck")}</Tag>}
              </Flex>
            }
            extra={
              <Flex gap={8} align="center">
                <CommonModalForm<ItemValues>
                  title={t("Add item")}
                  triggerLabel={
                    <>
                      <PlusOutlined /> {t("Add New Item")}
                    </>
                  }
                  okText={t("Add")}
                  onSave={(v) => addItem(container.key, v)}
                >
                  <ItemFormFields
                    products={products}
                    takenProductIds={takenIds(container)}
                  />
                </CommonModalForm>
                <CommonModalForm<ContainerValues>
                  title={t("Edit container")}
                  triggerLabel={<EditOutlined />}
                  triggerButtonType="default"
                  initialValues={{
                    container_no: container.container_no ?? undefined,
                    is_company_truck: container.is_company_truck,
                  }}
                  onSave={(v) => updateContainer(container.key, v)}
                >
                  <ContainerFormFields />
                </CommonModalForm>
                <Popconfirm
                  title={t("Remove this container?")}
                  description={t("Its items are removed with it.")}
                  okText={t("Remove")}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeContainer(container.key)}
                >
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Flex>
            }
          >
            {container.items.length ? (
              <DraftItemTable
                items={container.items}
                productsById={productsById}
                renderActions={renderItemActions(container)}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("No items yet")}
              />
            )}
          </Card>
        ))}

        <CommonModalForm<ContainerValues>
          title={t("Add container")}
          triggerLabel={
            <>
              <PlusOutlined /> {t("Add New Container")}
            </>
          }
          triggerButtonType="dashed"
          triggerButtonStyle={{ width: "100%", height: 48 }}
          okText={t("Add")}
          onSave={addContainer}
        >
          <ContainerFormFields />
        </CommonModalForm>

        <Flex justify="end" gap={8}>
          <Button onClick={cancel}>{t("Cancel")}</Button>
          <Button
            type="primary"
            onClick={submit}
            disabled={!canSubmit}
            loading={createShipment.isPending}
          >
            {t("Submit shipment")}
          </Button>
        </Flex>
      </Flex>

      {/* ---- side: registered products reference ---- */}
      <Card
        size="small"
        title={t("Registered products")}
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
