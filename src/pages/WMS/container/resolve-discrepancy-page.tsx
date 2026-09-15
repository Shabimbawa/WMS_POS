import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Tag,
  Typography,
  message,
} from "antd";
import type { FormInstance } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { DateParser } from "../../../common/utils/util";
import {
  useContainer,
  useProductCategories,
  useUnloadContainer,
} from "../../../queries/useHooks";
import type {
  DiscrepancyInput,
  DiscrepancyReason,
  ProductCategory,
} from "../../../queries/types";
import { REASON_LABEL, STATUS_LABEL, fmtInt, fmtProduct } from "../type-format/format";
import { ProductReferenceTable } from "./create-shipment-table";
import {
  DiscrepancyLineTable,
  actualOf,
  type DiscrepancyLine,
} from "./resolve-discrepancy-table";

// ---- form value shapes -------------------------------------------

type LineIssueValues = {
  reason: Exclude<DiscrepancyReason, "UNDECLARED">;
  actual_qty?: number;
  note?: string;
};

type UnlistedValues = {
  product_category_id: string;
  actual_qty: number;
  note?: string;
};

const LINE_REASONS = (["SHORT", "OVER", "DAMAGED", "OTHER"] as const).map(
  (r) => ({ label: REASON_LABEL[r], value: r }),
);

// ---- modal forms ---------------------------------------------------

function LineIssueFields({
  form,
  declared,
}: {
  form: FormInstance<LineIssueValues>;
  declared: number;
}) {
  const reason = Form.useWatch("reason", form);
  const isOther = reason === "OTHER";

  return (
    <>
      <Typography.Paragraph type="secondary">
        Declared on the packing list: <b>{fmtInt(declared)}</b> sacks
      </Typography.Paragraph>
      <Form.Item
        name="reason"
        label="Reason"
        rules={[{ required: true, message: "Pick a reason" }]}
      >
        <Select options={LINE_REASONS} />
      </Form.Item>
      {!isOther && (
        <Form.Item
          name="actual_qty"
          label="Actual sacks counted"
          dependencies={["reason"]}
          rules={[
            { required: true, message: "Enter the counted quantity" },
            {
              validator: (_, v: number | undefined) => {
                if (v === undefined || v === null) return Promise.resolve();
                if (reason === "SHORT" && v >= declared)
                  return Promise.reject(
                    new Error(`Short means fewer than ${fmtInt(declared)}`),
                  );
                if (reason === "OVER" && v <= declared)
                  return Promise.reject(
                    new Error(`Over means more than ${fmtInt(declared)}`),
                  );
                return Promise.resolve();
              },
            },
          ]}
        >
          <InputNumber min={0} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      )}
      <Form.Item
        name="note"
        label="Note"
        rules={
          isOther
            ? [{ required: true, whitespace: true, message: "Explain the issue" }]
            : []
        }
        extra={
          isOther
            ? "Other logs the note only — no quantity changes."
            : undefined
        }
      >
        <Input.TextArea rows={3} placeholder={isOther ? "Required" : "Optional"} />
      </Form.Item>
    </>
  );
}

function UnlistedFields({ products }: { products: ProductCategory[] }) {
  return (
    <>
      <Form.Item
        name="product_category_id"
        label="Product"
        rules={[{ required: true, message: "Pick a product" }]}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Search by code or brand"
          options={products.map((p) => ({ label: fmtProduct(p), value: p.id }))}
        />
      </Form.Item>
      <Form.Item
        name="actual_qty"
        label="Sacks counted"
        rules={[{ required: true, message: "Enter the counted quantity" }]}
      >
        <InputNumber min={1} precision={0} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item name="note" label="Note">
        <Input.TextArea rows={3} placeholder="Optional" />
      </Form.Item>
    </>
  );
}

// ---- page ----------------------------------------------------------

export default function ResolveDiscrepancyPage() {
  const navigate = useNavigate();
  const { containerId } = useParams();
  const [searchParams] = useSearchParams();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();

  const { data: container, isPending, isError, error } = useContainer(containerId);
  const { data: products = [], isPending: loadingProducts } =
    useProductCategories();
  const unload = useUnloadContainer();

  const [dateUnloaded, setDateUnloaded] = useState<Dayjs>(() => {
    const d = dayjs(searchParams.get("date"));
    return d.isValid() ? d : dayjs();
  });
  /** Keyed by product_category_id — one discrepancy per line. */
  const [drafts, setDrafts] = useState<Map<string, DiscrepancyInput>>(
    () => new Map(),
  );

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const declaredIds = useMemo(
    () =>
      new Set(container?.container_item.map((i) => i.product_category.id) ?? []),
    [container],
  );

  // Declared lines first, then unlisted items in the order they were added.
  const lines = useMemo<DiscrepancyLine[]>(() => {
    if (!container) return [];
    const declared = container.container_item.map((i) => ({
      key: i.product_category.id,
      product: i.product_category,
      declared: i.qty_sacks,
      discrepancy: drafts.get(i.product_category.id),
    }));
    const unlisted = [...drafts.values()]
      .filter((d) => d.reason === "UNDECLARED")
      .flatMap((d) => {
        const p = productsById.get(d.product_category_id);
        return p
          ? [{ key: p.id, product: p, declared: 0, discrepancy: d }]
          : [];
      });
    return [...declared, ...unlisted];
  }, [container, drafts, productsById]);

  // ---- draft helpers ----

  const setDraft = (d: DiscrepancyInput, replacesProductId?: string) =>
    setDrafts((prev) => {
      const next = new Map(prev);
      if (replacesProductId) next.delete(replacesProductId);
      next.set(d.product_category_id, d);
      return next;
    });

  const removeDraft = (productId: string) =>
    setDrafts((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });

  const saveLineIssue = (productId: string, v: LineIssueValues) =>
    setDraft({
      product_category_id: productId,
      reason: v.reason,
      // OTHER writes nothing, so it carries no quantity.
      actual_qty: v.reason === "OTHER" ? undefined : v.actual_qty,
      note: v.note?.trim() || null,
    });

  const saveUnlisted = (v: UnlistedValues, replacesProductId?: string) =>
    setDraft(
      {
        product_category_id: v.product_category_id,
        reason: "UNDECLARED",
        actual_qty: v.actual_qty,
        note: v.note?.trim() || null,
      },
      replacesProductId,
    );

  /** Products not on the container and not already added as unlisted. */
  const unlistedOptions = (exceptProductId?: string) =>
    products.filter(
      (p) =>
        !declaredIds.has(p.id) &&
        (p.id === exceptProductId || !drafts.has(p.id)),
    );

  // ---- row actions ----

  const renderActions = (line: DiscrepancyLine) => {
    const d = line.discrepancy;
    const isUnlisted = d?.reason === "UNDECLARED";

    const editModal = isUnlisted ? (
      <CommonModalForm<UnlistedValues>
        title="Edit unlisted item"
        triggerLabel={<EditOutlined />}
        triggerButtonType="text"
        initialValues={{
          product_category_id: d.product_category_id,
          actual_qty: d.actual_qty,
          note: d.note ?? undefined,
        }}
        onSave={(v) => saveUnlisted(v, line.key)}
      >
        <UnlistedFields products={unlistedOptions(line.key)} />
      </CommonModalForm>
    ) : (
      <CommonModalForm<LineIssueValues>
        title={`${d ? "Edit" : "Log"} issue · ${fmtProduct(line.product)}`}
        triggerLabel={d ? <EditOutlined /> : "Log issue"}
        triggerButtonType={d ? "text" : "default"}
        initialValues={
          d
            ? {
                reason: d.reason as LineIssueValues["reason"],
                actual_qty: d.actual_qty,
                note: d.note ?? undefined,
              }
            : undefined
        }
        onSave={(v) => saveLineIssue(line.key, v)}
      >
        {(form) => <LineIssueFields form={form} declared={line.declared} />}
      </CommonModalForm>
    );

    return (
      <Flex gap={4} justify="end">
        {editModal}
        {d && (
          <Popconfirm
            title={isUnlisted ? "Remove this unlisted item?" : "Clear this issue?"}
            description={isUnlisted ? undefined : "The line goes back to matched."}
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeDraft(line.key)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Flex>
    );
  };

  // ---- submit ----

  const totals = lines.reduce(
    (t, l) => ({ declared: t.declared + l.declared, actual: t.actual + actualOf(l) }),
    { declared: 0, actual: 0 },
  );
  const variance = totals.actual - totals.declared;

  const submit = async () => {
    if (!container) return;
    try {
      await unload.mutateAsync({
        containerId: container.id,
        dateUnloaded: dateUnloaded.format("YYYY-MM-DD"),
        discrepancies: [...drafts.values()].map((d) =>
          d.reason === "OTHER"
            ? { product_category_id: d.product_category_id, reason: d.reason, note: d.note }
            : d,
        ),
      });
      msg.success("Container unloaded");
      navigate("/containers");
    } catch (e) {
      showError(e, "Could not unload container");
    }
  };

  const cancel = () => {
    if (drafts.size === 0) {
      navigate("/containers");
      return;
    }
    Modal.confirm({
      title: "Discard logged issues?",
      content: "The container stays delivered and nothing is saved.",
      okText: "Discard",
      okButtonProps: { danger: true },
      cancelText: "Keep editing",
      onOk: () => navigate("/containers"),
    });
  };

  // ---- render ----

  if (isPending) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError || !container) {
    return (
      <Alert
        type="error"
        showIcon
        message="Could not load this container"
        description={(error as Error)?.message}
        action={<Button onClick={() => navigate("/containers")}>Back</Button>}
      />
    );
  }

  if (container.status !== "DELIVERED") {
    return (
      <Alert
        type="warning"
        showIcon
        message={
          container.status === "UNLOADED"
            ? "This container is already unloaded"
            : `Only delivered containers can be unloaded (this one is ${STATUS_LABEL[container.status]})`
        }
        action={<Button onClick={() => navigate("/containers")}>Back to shipments</Button>}
      />
    );
  }

  const deliveredOn = container.date_delivered
    ? dayjs(container.date_delivered)
    : null;
  const { shipment } = container;

  return (
    <Flex gap={16} align="start">
      {msgHolder}
      {errorHolder}

      {/* ---- main: the container being unloaded ---- */}
      <Flex vertical gap={16} style={{ flex: 1, minWidth: 0 }}>
        <Flex vertical gap={4}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Resolve discrepancies
          </Typography.Title>
          <Typography.Text type="secondary">
            {shipment.supplier.name} · list received{" "}
            {DateParser(shipment.date_list_received)}
            {shipment.reference ? ` · ${shipment.reference}` : ""}
            {container.date_delivered
              ? ` · delivered ${DateParser(container.date_delivered)}`
              : ""}
          </Typography.Text>
        </Flex>

        <Card size="small" title="Unload">
          <Flex align="center" gap={12} wrap>
            <Typography.Text>Date unloaded</Typography.Text>
            <DatePicker
              value={dateUnloaded}
              allowClear={false}
              format="MMMM DD, YYYY"
              onChange={(d) => d && setDateUnloaded(d)}
              disabledDate={(d) => !!deliveredOn && d.isBefore(deliveredOn, "day")}
            />
            <Typography.Text type="secondary">
              Lines without an issue are recorded as matching the packing list.
            </Typography.Text>
          </Flex>
        </Card>

        <Card
          size="small"
          title={
            <Flex align="center" gap={8}>
              <span style={{ fontFamily: "monospace" }}>
                {container.container_no ?? "No container no."}
              </span>
              {container.is_company_truck && <Tag color="blue">Own truck</Tag>}
            </Flex>
          }
          extra={
            <CommonModalForm<UnlistedValues>
              title="Add unlisted item"
              triggerLabel={
                <>
                  <PlusOutlined /> Add unlisted item
                </>
              }
              okText="Add"
              onSave={(v) => saveUnlisted(v)}
            >
              <UnlistedFields products={unlistedOptions()} />
            </CommonModalForm>
          }
        >
          <DiscrepancyLineTable lines={lines} renderActions={renderActions} />
        </Card>

        <Flex justify="space-between" align="center" wrap gap={8}>
          <Typography.Text type="secondary">
            {fmtInt(drafts.size)} issues logged · declared{" "}
            {fmtInt(totals.declared)} · actual {fmtInt(totals.actual)} · variance{" "}
            {variance > 0 ? `+${fmtInt(variance)}` : fmtInt(variance)}
          </Typography.Text>
          <Flex gap={8}>
            <Button onClick={cancel}>Cancel</Button>
            <Button type="primary" onClick={submit} loading={unload.isPending}>
              Submit unload
            </Button>
          </Flex>
        </Flex>
      </Flex>

      {/* ---- side: registered products reference ---- */}
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
