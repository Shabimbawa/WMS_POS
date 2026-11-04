import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, DatePicker, Flex, Form, Input, InputNumber, Modal, Popconfirm, Select, Typography, message } from "antd";
import type { GetRef, InputRef, RefSelectProps } from "antd";
import { CopyOutlined, DeleteOutlined, PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { confirmNegativeInventory, isNegativeInventoryError } from "./negative-inventory";
import { useCreateShipment, useOpenContainerNumbers, useProductCategories, useShippingCompanies, useSuppliers, useUpdateShipment } from "../../../queries/useHooks";
import type { OpenContainerNumber, ShipmentRow } from "../../../queries/types";
import { fmtInt, fmtMoney, fmtProduct } from "../type-format/format";
import type { DraftContainer, DraftItem } from "./create-shipment-table";
import { useLanguage } from "../../../common/context/language-context";

type HeaderValues = { supplier_id: string; date_list_received: Dayjs };
const newKey = () => crypto.randomUUID();
/** Compared without spaces or dashes, so "ABCU 123" and "ABCU-123" are the same box. */
const normalizeNo = (value: string | null) => (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const blankContainer = (): DraftContainer => ({ key: newKey(), container_no: null, shipping_company_id: "", notes: null, items: [] });
/** Quick setup's paste box: one container number per line, blank lines ignored. */
const parseNumbers = (text: string) => text.split(/\r?\n/).map((line) => line.trim().toUpperCase()).filter(Boolean);
const hasEntries = (c: DraftContainer) => Boolean(c.container_no?.trim() || c.notes?.trim() || c.items.length);

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
  const { data: openNumbers = [] } = useOpenContainerNumbers(kind);
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
  // Keyboard flow for product rows: picking a product focuses its Sacks box,
  // Tab goes on to Price, and Tab from the last row's Price returns to the
  // product picker for the next product.
  const pickerRefs = useRef(new Map<string, RefSelectProps>());
  const qtyRefs = useRef(new Map<string, GetRef<typeof InputNumber>>());
  const numberRefs = useRef(new Map<string, InputRef>());
  const submitRef = useRef<HTMLButtonElement>(null);
  const focusQtyOf = useRef<string | null>(null);
  // Focus asked for before the target exists (e.g. cards quick setup is
  // about to create); applied after the next render.
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    const itemKey = focusQtyOf.current;
    if (itemKey) {
      focusQtyOf.current = null;
      // Next frame, once the picker has finished closing its list.
      requestAnimationFrame(() => qtyRefs.current.get(itemKey)?.focus({ cursor: "all" }));
    }
    const focus = pendingFocus.current;
    if (focus) {
      pendingFocus.current = null;
      requestAnimationFrame(focus);
    }
  });
  /** A card's first empty spot: its number if it has none, else the product picker. */
  const focusContainer = (container: DraftContainer) => {
    if (!container.container_no?.trim()) numberRefs.current.get(container.key)?.focus();
    else pickerRefs.current.get(container.key)?.focus();
  };
  /** Ctrl+Enter: on to the next card, or to Submit after the last one. */
  const goToNextContainer = (index: number) => {
    const next = containers[index + 1];
    if (next) focusContainer(next);
    else submitRef.current?.focus();
  };
  const tabFromPrice = (event: React.KeyboardEvent, container: DraftContainer, rowIndex: number) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault();
    const next = container.items[rowIndex + 1];
    if (next) qtyRefs.current.get(next.key)?.focus({ cursor: "all" });
    else pickerRefs.current.get(container.key)?.focus();
  };

  // The picker's tags are rows, not products: picking a product always adds a
  // row, so picking it again adds a second line of it (e.g. at another price).
  const addItem = (container: DraftContainer, productId: string) => {
    const key = newKey();
    focusQtyOf.current = key;
    // Price memory: reuse the latest price already entered for this product
    // anywhere in the shipment. It stays editable.
    const rememberedPrice = containers.flatMap((c) => c.items).reverse()
      .find((item) => item.product_category_id === productId && item.price_per_sack !== null)?.price_per_sack ?? null;
    updateContainer(container.key, {
      items: [...container.items, { key, product_category_id: productId, qty_sacks: 1, price_per_sack: rememberedPrice }],
    });
  };
  /** Copies the previous card's product rows (sacks and prices included). */
  const copyItemsFrom = (source: DraftContainer, target: DraftContainer) => {
    updateContainer(target.key, { items: source.items.map((item) => ({ ...item, key: newKey() })) });
    pendingFocus.current = () => pickerRefs.current.get(target.key)?.focus();
  };
  const removeItem = (container: DraftContainer, itemKey: string) => updateContainer(container.key, { items: container.items.filter((row) => row.key !== itemKey) });
  const productLabel = (productId: string) => productOptions.find((option) => option.value === productId)?.label ?? productId;
  /** Label per row, numbered when the product is on the container more than once. */
  const rowLabels = (container: DraftContainer) => {
    const totals = new Map<string, number>();
    container.items.forEach((item) => totals.set(item.product_category_id, (totals.get(item.product_category_id) ?? 0) + 1));
    const seen = new Map<string, number>();
    return new Map(container.items.map((item) => {
      const n = (seen.get(item.product_category_id) ?? 0) + 1;
      seen.set(item.product_category_id, n);
      const label = productLabel(item.product_category_id);
      return [item.key, totals.get(item.product_category_id)! > 1 ? `${label} #${n}` : label];
    }));
  };
  const addContainer = () => setContainers((current) => [...current, blankContainer()]);

  /** The shipping company whose code (longest match wins) prefixes the number. */
  const companyForNumber = (containerNo: string): string | undefined => {
    const normalized = normalizeNo(containerNo);
    if (!normalized) return undefined;
    return shippingCompanies.flatMap((company) => {
      const codes = company.codes?.length ? company.codes : company.code ? [company.code] : [];
      return codes.map((code) => ({ id: company.id, code: normalizeNo(code) }));
    }).filter(({ code }) => code && normalized.startsWith(code)).sort((a, b) => b.code.length - a.code.length)[0]?.id;
  };
  const detectShippingCompany = (containerKey: string, containerNo: string) => {
    if (!normalizeNo(containerNo)) {
      updateContainer(containerKey, { container_no: null, shipping_company_id: "" });
      return;
    }
    const companyId = companyForNumber(containerNo);
    updateContainer(containerKey, { container_no: containerNo.trim() || null, ...(companyId ? { shipping_company_id: companyId } : {}) });
  };

  // ---- quick setup (new shipments only) ----
  // Enter a count and/or paste the numbers, and the container cards are
  // built in one go instead of clicking Add container for each.
  const [setupCount, setSetupCount] = useState<number | null>(null);
  const [setupNumbers, setSetupNumbers] = useState("");
  const pastedNumbers = parseNumbers(setupNumbers);
  const setupTarget = Math.max(setupCount ?? 0, pastedNumbers.length);
  const applyQuickSetup = () => {
    if (setupTarget < 1) return;
    const build = () => {
      // Existing cards keep everything entered on them; a pasted number
      // fills (or replaces) the number on the card in the same position.
      const next = Array.from({ length: setupTarget }, (_, i) => {
        const base = containers[i] ?? blankContainer();
        const no = pastedNumbers[i];
        if (!no) return base;
        return { ...base, container_no: no, shipping_company_id: companyForNumber(no) ?? base.shipping_company_id };
      });
      setContainers(next);
      setSetupCount(null);
      setSetupNumbers("");
      pendingFocus.current = () => { if (next[0]) focusContainer(next[0]); };
    };
    // Fewer containers than cards: the extra cards come off the end, and
    // only after a confirm if anything was entered on them.
    const dropped = containers.slice(setupTarget).filter(hasEntries);
    if (!dropped.length) return build();
    Modal.confirm({
      title: t("Remove {count} container(s)?", { count: containers.length - setupTarget }),
      content: t("Cards after container {index} have entries that will be lost.", { index: setupTarget }),
      okText: t("Remove"),
      okButtonProps: { danger: true },
      cancelText: t("Keep them"),
      onOk: build,
    });
  };

  // Container numbers repeated within this shipment.
  const firstIndexByNo = new Map<string, number>();
  const duplicateOf = new Map<string, number>(); // container key -> 1-based index of the first one
  containers.forEach((c, index) => {
    const no = normalizeNo(c.container_no);
    if (!no) return;
    const first = firstIndexByNo.get(no);
    if (first === undefined) firstIndexByNo.set(no, index);
    else duplicateOf.set(c.key, first + 1);
  });
  // The same numbers on other active shipments of this kind. The shipment
  // being edited is skipped, since its own containers are checked above.
  const otherShipmentNos = useMemo(() => new Map(openNumbers
    .filter((open) => open.shipment_id !== shipmentId)
    .map((open) => [normalizeNo(open.container_no), open] as const)), [openNumbers, shipmentId]);
  const onOtherShipment = new Map<string, OpenContainerNumber>(); // container key -> where it's open
  containers.forEach((c) => {
    const open = otherShipmentNos.get(normalizeNo(c.container_no));
    if (open && !duplicateOf.has(c.key)) onOtherShipment.set(c.key, open);
  });
  const hasDuplicates = duplicateOf.size > 0 || onOtherShipment.size > 0;

  const allSacks = containers.reduce((total, c) => total + c.items.reduce((subtotal, item) => subtotal + (item.qty_sacks || 0), 0), 0);
  const isComplete = Boolean(supplierId) && containers.length > 0 && containers.every((c) => Boolean(c.container_no?.trim()) && Boolean(c.shipping_company_id) && c.items.length > 0 && c.items.every((item) => Boolean(item.product_category_id) && item.qty_sacks > 0)) && !hasDuplicates;

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

    {!isEditing && <Card size="small" title={<Flex gap={8} align="center"><ThunderboltOutlined /><span>{t("Quick setup")}</span></Flex>}>
      <Flex gap={12} wrap align="start">
        <label style={{ display: "grid", gap: 5 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("Number of containers")}</Typography.Text>
          <InputNumber min={1} max={200} precision={0} value={setupCount} placeholder="0" style={{ width: 140 }} onChange={setSetupCount} onPressEnter={applyQuickSetup} />
        </label>
        <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 260 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("Container numbers (optional): paste or type one per line")}</Typography.Text>
          <Input.TextArea
            rows={3}
            value={setupNumbers}
            placeholder={"ABCU1234567\nABCU7654321"}
            style={{ fontFamily: "var(--mono)", textTransform: "uppercase" }}
            onChange={(event) => setSetupNumbers(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); applyQuickSetup(); } }}
          />
        </label>
        <Flex vertical gap={5} style={{ alignSelf: "end" }}>
          <Button type="primary" icon={<ThunderboltOutlined />} disabled={setupTarget < 1} onClick={applyQuickSetup}>
            {setupTarget > 0 ? t("Set up {count} container(s)", { count: setupTarget }) : t("Set up containers")}
          </Button>
        </Flex>
      </Flex>
      <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 8 }}>
        {t("Enter in the count box or Ctrl+Enter in the numbers box sets up the cards. Then, in any card, Ctrl+Enter jumps to the next container.")}
      </Typography.Text>
    </Card>}

    <Flex vertical gap={10}>
      {containers.map((container, index) => {
        const labels = rowLabels(container);
        const previous = containers[index - 1];
        return <div key={container.key} onKeyDownCapture={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); goToNextContainer(index); } }}><Card size="small" className="shipment-entry-card" title={<Flex gap={8} align="center"><span className="shipment-entry-index">{index + 1}</span><span>{t("Container")}</span></Flex>} extra={<Flex gap={4}>{previous && previous.items.length > 0 && (container.items.length === 0
          ? <Button type="text" icon={<CopyOutlined />} onClick={() => copyItemsFrom(previous, container)}>{t("Same products as container {index}", { index })}</Button>
          : <Popconfirm title={t("Replace this container's products?")} description={t("Its rows are replaced with container {index}'s.", { index })} okText={t("Replace")} onConfirm={() => copyItemsFrom(previous, container)}><Button type="text" icon={<CopyOutlined />}>{t("Same products as container {index}", { index })}</Button></Popconfirm>)}<Popconfirm title={t("Remove this container?")} description={t("Its product rows are removed with it.")} okText={t("Remove")} okButtonProps={{ danger: true }} onConfirm={() => setContainers((current) => current.filter((item) => item.key !== container.key))}><Button type="text" danger icon={<DeleteOutlined />}>{t("Remove")}</Button></Popconfirm></Flex>}>
          <div className="shipment-container-fields">
            <label><span className="shipment-required-label">{t("Container no.")}</span><Input ref={(input) => { if (input) numberRefs.current.set(container.key, input); else numberRefs.current.delete(container.key); }} onPressEnter={() => pickerRefs.current.get(container.key)?.focus()} status={!container.container_no?.trim() || duplicateOf.has(container.key) || onOtherShipment.has(container.key) ? "error" : undefined} value={container.container_no ?? ""} placeholder={t("Enter container number")} style={{ fontFamily: "var(--mono)", textTransform: "uppercase" }} onChange={(event) => detectShippingCompany(container.key, event.target.value.toUpperCase())} />{duplicateOf.has(container.key) && <Typography.Text type="danger" style={{ fontSize: 12 }}>{t("Same number as container {index}", { index: duplicateOf.get(container.key)! })}</Typography.Text>}{onOtherShipment.has(container.key) && <Typography.Text type="danger" style={{ fontSize: 12 }}>{t("Already on an active shipment: {supplier}, list received {date}", { supplier: onOtherShipment.get(container.key)!.supplier, date: dayjs(onOtherShipment.get(container.key)!.date_list_received).format("MMMM DD, YYYY") })}</Typography.Text>}</label>
            <label><span>{t("Shipping company")}</span><Select value={container.shipping_company_id || undefined} showSearch optionFilterProp="label" placeholder={t("Select shipping company")} loading={loadingShipping} options={shippingOptions} onChange={(value) => updateContainer(container.key, { shipping_company_id: value })} /></label>
            {/* Notes are rarely used, so they sit behind a link and add no Tab stop until opened. */}
            {container.notes === null
              ? <div className="shipment-container-notes"><Button type="link" size="small" style={{ padding: 0 }} tabIndex={-1} icon={<PlusOutlined />} onClick={() => { updateContainer(container.key, { notes: "" }); }}>{t("Add note")}</Button></div>
              : <label className="shipment-container-notes"><span>{t("Notes (optional)")}</span><Input.TextArea autoFocus={!container.notes} rows={2} maxLength={2000} showCount value={container.notes} placeholder={t("Add notes about this container")} onChange={(event) => updateContainer(container.key, { notes: event.target.value })} /></label>}
          </div>
          <div className="shipment-item-editor">
            <label className="shipment-product-picker"><span>{t("Products")}</span><Select<string | null>
              // An "add" box, not a multi-select: each pick adds a row below,
              // then the list closes and the box clears for the next product.
              // Rows are removed with their own delete button.
              ref={(select) => { if (select) pickerRefs.current.set(container.key, select); else pickerRefs.current.delete(container.key); }}
              value={null}
              showSearch
              optionFilterProp="label"
              placeholder={t("Add a product — type to search")}
              loading={loadingProducts}
              options={productOptions}
              optionRender={(option) => {
                const count = container.items.filter((item) => item.product_category_id === option.value).length;
                return <Flex justify="space-between" gap={8}><span>{option.label}</span>{count > 0 && <Typography.Text type="secondary">×{count}</Typography.Text>}</Flex>;
              }}
              onSelect={(picked) => picked && addItem(container, picked)}
            /></label>
            {!!container.items.length && <div className="shipment-item-header"><span>{t("Product")}</span><span>{t("Sacks")}</span><span>{t("Price / sack")}</span><span>{t("Subtotal")}</span><span /></div>}
            {container.items.map((item, rowIndex) => <div className="shipment-item-row" key={item.key}>
              <Typography.Text strong>{labels.get(item.key)}</Typography.Text>
              <InputNumber ref={(input) => { if (input) qtyRefs.current.set(item.key, input); else qtyRefs.current.delete(item.key); }} min={1} precision={0} value={item.qty_sacks} onChange={(value) => updateItem(container.key, item.key, { qty_sacks: value ?? 1 })} />
              <InputNumber min={0} precision={2} prefix="₱" placeholder={t("Optional")} value={item.price_per_sack} onChange={(value) => updateItem(container.key, item.key, { price_per_sack: value })} onKeyDown={(event) => tabFromPrice(event, container, rowIndex)} />
              <Typography.Text>{item.price_per_sack === null ? "—" : fmtMoney(item.qty_sacks * item.price_per_sack)}</Typography.Text>
              <Button type="text" danger aria-label={t("Remove product")} icon={<DeleteOutlined />} onClick={() => removeItem(container, item.key)} />
            </div>)}
          </div>
        </Card></div>;
      })}
      <Button type="dashed" className="shipment-add-container" icon={<PlusOutlined />} onClick={addContainer}>{t("Add container")}</Button>
    </Flex>

    {duplicateOf.size > 0 && <Alert type="error" showIcon message={t("The same container number is entered more than once")} description={t("Each container in a shipment needs its own number. Check the containers marked in red before submitting.")} />}
    {onOtherShipment.size > 0 && <Alert type="error" showIcon message={t("A container number is already on another active shipment")} description={t("A container can only be on one shipment until it is unloaded or cancelled. Check the containers marked in red before submitting.")} />}

    <Flex justify="space-between" align="center" gap={12} wrap className="shipment-register-footer">
      <Typography.Text type="secondary">{!containers.length ? t("Add at least one container to continue.") : hasDuplicates ? t("Fix the repeated container numbers to continue.") : !isComplete ? t("Complete all required container and product fields.") : t("Ready to submit.")}</Typography.Text>
      <Flex gap={8}><Button onClick={cancel}>{t("Cancel")}</Button><Button ref={submitRef} type="primary" disabled={!isComplete} loading={createShipment.isPending || updateShipment.isPending} onClick={() => submit()}>{t(isEditing ? "Save changes" : "Submit shipment")}</Button></Flex>
    </Flex>
  </div>;
}
