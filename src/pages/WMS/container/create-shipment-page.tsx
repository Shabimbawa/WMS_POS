import { useMemo, useState } from "react";
import { Button, Card, DatePicker, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Typography, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { confirmNegativeInventory, isNegativeInventoryError } from "./negative-inventory";
import { useCreateShipment, useProductCategories, useShippingCompanies, useSuppliers, useUpdateShipment } from "../../../queries/useHooks";
import type { ShipmentRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import type { DraftContainer, DraftItem } from "./create-shipment-table";
import { useLanguage } from "../../../common/context/language-context";

type HeaderValues = { supplier_id: string; date_list_received: Dayjs };
const newKey = () => crypto.randomUUID();
const blankContainer = (): DraftContainer => ({ key: newKey(), container_no: null, shipping_company_id: "", notes: null, items: [] });

export default function CreateShipmentPage({ kind = "INTERNATIONAL" }: { kind?: "INTERNATIONAL" | "NATIONAL" }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { shipmentId } = useParams();
  const editingShipment = (location.state as { shipment?: ShipmentRow } | null)?.shipment;
  const isEditing = Boolean(shipmentId && editingShipment);
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const listPath = kind === "INTERNATIONAL" ? "/containers" : "/national";
  const { data: suppliers, isLoading: loadingSuppliers } = useSuppliers({ kind });
  const { data: products = [], isPending: loadingProducts } = useProductCategories();
  const { data: shippingCompanies = [], isPending: loadingShipping } = useShippingCompanies();
  const createShipment = useCreateShipment();
  const updateShipment = useUpdateShipment();
  const [form] = Form.useForm<HeaderValues>();
  const supplierId = Form.useWatch("supplier_id", form);
  const [containers, setContainers] = useState<DraftContainer[]>(() => editingShipment ? editingShipment.container.map((container) => ({ key: container.id, container_no: container.container_no, shipping_company_id: container.shipping_company?.id ?? "", notes: container.notes, items: container.container_item.map((item) => ({ key: item.id, product_category_id: item.product_category.id, qty_sacks: item.qty_sacks, price_per_sack: item.price_per_sack })) })) : [blankContainer()]);

  const productOptions = useMemo(() => products.map((p) => ({ label: fmtProduct(p), value: p.id })), [products]);
  const shippingOptions = useMemo(() => shippingCompanies.map((company) => ({
    label: company.codes?.length ? `${company.name} (${company.codes.join(", ")})` : company.code ? `${company.name} (${company.code})` : company.name,
    value: company.id,
  })), [shippingCompanies]);

  const updateContainer = (key: string, fields: Partial<DraftContainer>) => setContainers((current) => current.map((container) => container.key === key ? { ...container, ...fields } : container));
  const updateItem = (containerKey: string, itemKey: string, fields: Partial<DraftItem>) => setContainers((current) => current.map((container) => container.key === containerKey ? { ...container, items: container.items.map((item) => item.key === itemKey ? { ...item, ...fields } : item) } : container));
  const selectProducts = (container: DraftContainer, productIds: string[]) => {
    const existing = new Map(container.items.map((item) => [item.product_category_id, item]));
    updateContainer(container.key, {
      items: productIds.map((productId) => existing.get(productId) ?? { key: newKey(), product_category_id: productId, qty_sacks: 1, price_per_sack: null }),
    });
  };
  const addContainer = () => setContainers((current) => [...current, blankContainer()]);

  const detectShippingCompany = (containerKey: string, containerNo: string) => {
    const normalized = containerNo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) {
      updateContainer(containerKey, { container_no: null, shipping_company_id: "" });
      return;
    }
    const match = shippingCompanies.flatMap((company) => {
      const codes = company.codes?.length ? company.codes : company.code ? [company.code] : [];
      return codes.map((code) => ({ id: company.id, code: code.toUpperCase().replace(/[^A-Z0-9]/g, "") }));
    }).filter(({ code }) => code && normalized.startsWith(code)).sort((a, b) => b.code.length - a.code.length)[0];
    updateContainer(containerKey, { container_no: containerNo.trim() || null, ...(match ? { shipping_company_id: match.id } : {}) });
  };

  const allSacks = containers.reduce((total, c) => total + c.items.reduce((subtotal, item) => subtotal + (item.qty_sacks || 0), 0), 0);
  const isComplete = Boolean(supplierId) && containers.length > 0 && containers.every((c) => Boolean(c.container_no?.trim()) && Boolean(c.shipping_company_id) && c.items.length > 0 && c.items.every((item) => Boolean(item.product_category_id) && item.qty_sacks > 0));

  const submit = async (allowNegativeInventory = false) => {
    const header = await form.validateFields();
    if (!isComplete) return;
    try {
      const input = {
        supplierId: header.supplier_id,
        dateListReceived: header.date_list_received.format("YYYY-MM-DD"),
        reference: null,
        allowNegativeInventory,
        containers: containers.map((c) => ({ id: isEditing ? c.key : undefined, container_no: c.container_no, shipping_company_id: c.shipping_company_id, notes: c.notes?.trim() || null, items: c.items.map((item) => ({ id: isEditing ? item.key : undefined, product_category_id: item.product_category_id, qty_sacks: item.qty_sacks, price_per_sack: item.price_per_sack })) })),
      };
      if (isEditing && shipmentId) await updateShipment.mutateAsync({ id: shipmentId, input });
      else await createShipment.mutateAsync(input);
      msg.success(t(isEditing ? "Shipment updated" : "Shipment registered"));
      navigate(listPath);
    } catch (error) {
      if (isNegativeInventoryError(error)) {
        confirmNegativeInventory({
          error,
          t,
          intro: t("Saving these corrections will result in negative stock:"),
          okText: t("Save anyway"),
          cancelText: t("Review changes"),
          labelOf: (productId) => productOptions.find((product) => product.value === productId)?.label ?? productId,
          onOk: () => submit(true),
        });
        return;
      }
      showError(error, isEditing ? "Could not update shipment" : "Could not register shipment");
    }
  };

  const cancel = () => {
    const untouchedDraft = containers.length === 1 && !containers[0].container_no && !containers[0].shipping_company_id && containers[0].items.length === 0;
    if (!form.isFieldsTouched() && untouchedDraft) return navigate(listPath);
    Modal.confirm({ title: t("Discard this shipment?"), content: t("Everything entered on this page will be lost."), okText: t("Discard"), okButtonProps: { danger: true }, cancelText: t("Keep editing"), onOk: () => navigate(listPath) });
  };

  return <div className="shipment-register-page">
    {msgHolder}{errorHolder}
    <Flex justify="space-between" align="center" gap={12} wrap>
      <div><Typography.Title level={4} style={{ margin: 0 }}>{isEditing ? t("Edit Shipment") : kind === "INTERNATIONAL" ? t("Register Shipment") : t("Register National Delivery")}</Typography.Title><Typography.Text type="secondary">{t("Enter the shipment, containers, and products in one form.")}</Typography.Text></div>
      <Flex gap={16} className="shipment-register-summary"><span><strong>{fmtInt(containers.length)}</strong> {t("containers")}</span><span><strong>{fmtInt(allSacks)}</strong> {t("sacks")}</span></Flex>
    </Flex>

    <Card size="small" title={t("Shipment details")}>
      <Form form={form} layout="vertical" initialValues={{ supplier_id: editingShipment?.supplier.id, date_list_received: editingShipment ? dayjs(editingShipment.date_list_received) : dayjs() }}><div className="shipment-header-fields">
        <Form.Item name="supplier_id" label={t("Supplier")} rules={[{ required: true, message: t("Pick a supplier") }]}><Select showSearch optionFilterProp="label" placeholder={t("Select supplier")} loading={loadingSuppliers} options={suppliers?.map((s) => ({ label: s.name, value: s.id }))} /></Form.Item>
        <Form.Item name="date_list_received" label={t("List received")} rules={[{ required: true, message: t("Pick a date") }]}><DatePicker allowClear={false} format="MMMM DD, YYYY" style={{ width: "100%" }} /></Form.Item>
      </div></Form>
    </Card>

    <Flex vertical gap={10}>
      {containers.map((container, index) => {
        return <Card key={container.key} size="small" className="shipment-entry-card" title={<Flex gap={8} align="center"><span className="shipment-entry-index">{index + 1}</span><span>{t("Container")}</span></Flex>} extra={<Popconfirm title={t("Remove this container?")} description={t("Its product rows are removed with it.")} okText={t("Remove")} okButtonProps={{ danger: true }} onConfirm={() => setContainers((current) => current.filter((item) => item.key !== container.key))}><Button type="text" danger icon={<DeleteOutlined />}>{t("Remove")}</Button></Popconfirm>}>
          <div className="shipment-container-fields">
            <label><span className="shipment-required-label">{t("Container no.")}</span><Input status={!container.container_no?.trim() ? "error" : undefined} value={container.container_no ?? ""} placeholder={t("Enter container number")} style={{ fontFamily: "var(--mono)", textTransform: "uppercase" }} onChange={(event) => detectShippingCompany(container.key, event.target.value.toUpperCase())} /></label>
            <label><span>{t("Shipping company")}</span><Select value={container.shipping_company_id || undefined} showSearch optionFilterProp="label" placeholder={t("Select shipping company")} loading={loadingShipping} options={shippingOptions} onChange={(value) => updateContainer(container.key, { shipping_company_id: value })} /></label>
            <label className="shipment-container-notes"><span>{t("Notes (optional)")}</span><Input.TextArea rows={2} maxLength={2000} showCount value={container.notes ?? ""} placeholder={t("Add notes about this container")} onChange={(event) => updateContainer(container.key, { notes: event.target.value })} /></label>
          </div>
          <div className="shipment-item-editor">
            <label className="shipment-product-picker"><span>{t("Products")}</span><Select mode="multiple" value={container.items.map((item) => item.product_category_id)} showSearch optionFilterProp="label" placeholder={t("Select one or more products")} loading={loadingProducts} options={productOptions} onChange={(values) => selectProducts(container, values)} maxTagCount="responsive" /></label>
            {!!container.items.length && <div className="shipment-item-header"><span>{t("Product")}</span><span>{t("Sacks")}</span><span>{t("Price / sack")}</span><span>{t("Subtotal")}</span><span /></div>}
            {container.items.map((item) => <div className="shipment-item-row" key={item.key}>
              <Typography.Text strong>{productOptions.find((option) => option.value === item.product_category_id)?.label ?? item.product_category_id}</Typography.Text>
              <InputNumber min={1} precision={0} value={item.qty_sacks} onChange={(value) => updateItem(container.key, item.key, { qty_sacks: value ?? 1 })} />
              <InputNumber min={0} precision={2} prefix="₱" placeholder={t("Optional")} value={item.price_per_sack} onChange={(value) => updateItem(container.key, item.key, { price_per_sack: value })} />
              <Typography.Text>{item.price_per_sack === null ? "—" : fmtMoney(item.qty_sacks * item.price_per_sack)}</Typography.Text>
              <Button type="text" danger aria-label={t("Remove product")} icon={<DeleteOutlined />} onClick={() => updateContainer(container.key, { items: container.items.filter((row) => row.key !== item.key) })} />
            </div>)}
          </div>
        </Card>;
      })}
      <Button type="dashed" className="shipment-add-container" icon={<PlusOutlined />} onClick={addContainer}>{t("Add container")}</Button>
    </Flex>

    <Flex justify="space-between" align="center" gap={12} wrap className="shipment-register-footer">
      <Typography.Text type="secondary">{!containers.length ? t("Add at least one container to continue.") : !isComplete ? t("Complete all required container and product fields.") : t("Ready to submit.")}</Typography.Text>
      <Flex gap={8}><Button onClick={cancel}>{t("Cancel")}</Button><Button type="primary" disabled={!isComplete} loading={createShipment.isPending || updateShipment.isPending} onClick={() => submit()}>{t(isEditing ? "Save changes" : "Submit shipment")}</Button></Flex>
    </Flex>
  </div>;
}
