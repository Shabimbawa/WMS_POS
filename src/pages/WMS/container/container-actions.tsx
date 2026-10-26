import {
  Alert,
  Button,
  DatePicker,
  Flex,
  Form,
  Input,
  Popover,
  Popconfirm,
  Radio,
  Select,
  Tooltip,
  Typography,
  message,
} from "antd";
import { DownOutlined } from "@ant-design/icons";
import type { FormInstance } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import {
  useMoveContainerBack,
  useUnloadContainer,
  useUpdateContainerDates,
  useUpdateContainerHauling,
  useUpdateContainerStatus,
} from "../../../queries/useHooks";
import type {
  HaulingAssignment,
  MoveContainerBackInput,
  ShipmentRow,
} from "../../../queries/types";
import { STATUS_LABEL, fmtProduct } from "../type-format/format";
import { confirmNegativeInventory, isNegativeInventoryError } from "./negative-inventory";
import { useLanguage } from "../../../common/context/language-context";

type ShipmentContainer = ShipmentRow["container"][number];

type CancelValues = {
  cancellation_reason: string;
};

type DateValues = {
  date_arrived_at_port?: Dayjs;
  date_delivered?: Dayjs;
  date_unloaded?: Dayjs;
};

type MoveBackValues = {
  status: MoveContainerBackInput["status"];
  reason: string;
};

type HaulingValues = {
  assignment: HaulingAssignment;
  hauler?: string;
};

/** Earlier statuses a mistaken one can be undone to, one step at a time. */
function moveBackOptions(container: ShipmentContainer): Array<MoveContainerBackInput["status"]> {
  switch (container.status) {
    case "UNLOADED": return ["DELIVERED"];
    case "DELIVERED": return container.date_arrived_at_port ? ["ARRIVED_AT_PORT", "DOCUMENTED"] : ["DOCUMENTED"];
    case "ARRIVED_AT_PORT": return ["DOCUMENTED"];
    default: return [];
  }
}

function MoveBackFields({
  form,
  container,
}: {
  form: FormInstance<MoveBackValues>;
  container: ShipmentContainer;
}) {
  const { t } = useLanguage();
  const status = Form.useWatch("status", form);
  const sacks = container.container_item.reduce((n, item) => n + (item.actual_qty_sacks ?? 0), 0);
  const effect = container.status === "UNLOADED"
    ? t("Takes {sacks} sacks back out of stock, clears the counted quantities and discrepancies, and removes the unload date. The container can then be unloaded again.", { sacks })
    : status === "ARRIVED_AT_PORT"
      ? t("Removes the delivered date. The container returns to the port pull-out list.")
      : status === "DOCUMENTED"
        ? t("Removes the port arrival date, pull-out deadline and delivered date.")
        : null;

  return (
    <>
      <Form.Item
        name="status"
        label={t("Move back to")}
        rules={[{ required: true, message: t("Pick a status") }]}
      >
        <Select
          options={moveBackOptions(container).map((s) => ({
            label: t(STATUS_LABEL[s]),
            value: s,
          }))}
        />
      </Form.Item>
      {effect && (
        <Alert
          type={container.status === "UNLOADED" ? "warning" : "info"}
          showIcon
          message={effect}
          style={{ marginBottom: 24 }}
        />
      )}
      <Form.Item
        name="reason"
        label={t("Reason")}
        rules={[{ required: true, whitespace: true, message: t("Enter a reason") }]}
      >
        <Input.TextArea rows={3} maxLength={2000} placeholder={t("e.g. Marked by mistake")} />
      </Form.Item>
    </>
  );
}

/** One picker per date the container already has, kept in lifecycle order. */
function DateFields({
  form,
  container,
}: {
  form: FormInstance<DateValues>;
  container: ShipmentContainer;
}) {
  const { t } = useLanguage();
  const arrivedAtPort = Form.useWatch("date_arrived_at_port", form);
  const delivered = Form.useWatch("date_delivered", form);
  const unloaded = Form.useWatch("date_unloaded", form);
  const gracePeriodDays = container.shipping_company?.grace_period_days ?? null;
  const portChanged = !!arrivedAtPort && !!container.date_arrived_at_port
    && !arrivedAtPort.isSame(dayjs(container.date_arrived_at_port), "day");

  return (
    <>
      {container.date_arrived_at_port && (
        <>
          <Form.Item
            name="date_arrived_at_port"
            label={t("Date arrived at port")}
            rules={[{ required: true, message: t("Pick the port arrival date") }]}
          >
            <DatePicker
              allowClear={false}
              format="MMMM DD, YYYY"
              style={{ width: "100%" }}
              disabledDate={(d) => !!delivered && d.isAfter(delivered, "day")}
            />
          </Form.Item>
          {portChanged && (gracePeriodDays ? (
            <Alert
              type="info"
              showIcon
              message={t("Pull out on or before {date}", {
                date: arrivedAtPort.add(gracePeriodDays, "day").format("MMMM DD, YYYY"),
              })}
              style={{ marginBottom: 24 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message={t("Grace period not configured")}
              description={t("Set a grace period for this shipping company before changing the port arrival date.")}
              style={{ marginBottom: 24 }}
            />
          ))}
        </>
      )}
      {container.date_delivered && (
        <Form.Item
          name="date_delivered"
          label={t("Date delivered")}
          rules={[{ required: true, message: t("Pick the delivery date") }]}
        >
          <DatePicker
            allowClear={false}
            format="MMMM DD, YYYY"
            style={{ width: "100%" }}
            disabledDate={(d) =>
              (!!arrivedAtPort && d.isBefore(arrivedAtPort, "day"))
              || (!!unloaded && d.isAfter(unloaded, "day"))
            }
          />
        </Form.Item>
      )}
      {container.date_unloaded && (
        <>
          <Form.Item
            name="date_unloaded"
            label={t("Date unloaded")}
            rules={[{ required: true, message: t("Pick the unload date") }]}
          >
            <DatePicker
              allowClear={false}
              format="MMMM DD, YYYY"
              style={{ width: "100%" }}
              disabledDate={(d) => !!delivered && d.isBefore(delivered, "day")}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            {t("The stock received from this container moves to the new unload date.")}
          </Typography.Paragraph>
        </>
      )}
    </>
  );
}

function HaulingFields({ form }: { form: FormInstance<HaulingValues> }) {
  const { t } = useLanguage();
  const assignment = Form.useWatch("assignment", form);

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t("Hauling is managed separately from the container status and can be assigned later.")}
      </Typography.Paragraph>
      <Form.Item
        name="assignment"
        label={t("Hauling assignment")}
        rules={[{ required: true, message: t("Select a hauling assignment") }]}
      >
        <Radio.Group style={{ display: "grid", gap: 12 }}>
          <Radio value="NOT_ASSIGNED">{t("Not assigned")}</Radio>
          <Radio value="OWN_TRUCK">{t("Own truck")}</Radio>
          <Radio value="THIRD_PARTY">{t("Third-party hauler")}</Radio>
        </Radio.Group>
      </Form.Item>
      {assignment === "THIRD_PARTY" && (
        <Form.Item
          name="hauler"
          label={t("Hauler")}
          rules={[{ required: true, whitespace: true, message: t("Enter the hauler name") }]}
        >
          <Input maxLength={500} placeholder={t("Hauler name or company")} />
        </Form.Item>
      )}
    </>
  );
}

/**
 * Manage menu: the one-click next step (dated today) on top, then hauling,
 * corrections and cancelling. Mistakes are fixed with Edit dates or
 * Move back rather than by picking dates up front.
 */
export function ContainerActions({
  container,
  archived = false,
}: {
  container: ShipmentContainer;
  /** Archived shipments are read-only until restored. */
  archived?: boolean;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const updateStatus = useUpdateContainerStatus();
  const updateHauling = useUpdateContainerHauling();
  const unload = useUnloadContainer();
  const updateDates = useUpdateContainerDates();
  const moveBack = useMoveContainerBack();

  const deliveredOn = container.date_delivered
    ? dayjs(container.date_delivered)
    : null;
  const today = dayjs().format("YYYY-MM-DD");

  const canEditDates = !archived && !!(
    container.date_arrived_at_port || container.date_delivered || container.date_unloaded
  );
  const backOptions = archived ? [] : moveBackOptions(container);
  // A cancelled container is closed. An unloaded one only allows corrections.
  if (container.status === "CANCELLED") return null;
  if (container.status === "UNLOADED" && !canEditDates && !backOptions.length) return null;

  const isOpen = container.status !== "UNLOADED";
  const gracePeriodDays = container.shipping_company?.grace_period_days ?? null;
  // Only possible when a delivered date was corrected into the future.
  const deliveredLater = !!deliveredOn && dayjs().isBefore(deliveredOn, "day");

  const saveDates = async (v: DateValues) => {
    // Send only what changed, so an untouched date is never re-validated.
    const changed = (picked: Dayjs | undefined, current: string | null) => {
      const value = picked?.format("YYYY-MM-DD");
      return value && value !== current ? value : undefined;
    };
    const input = {
      dateArrivedAtPort: changed(v.date_arrived_at_port, container.date_arrived_at_port),
      dateDelivered: changed(v.date_delivered, container.date_delivered),
      dateUnloaded: changed(v.date_unloaded, container.date_unloaded),
    };
    if (!input.dateArrivedAtPort && !input.dateDelivered && !input.dateUnloaded) return;
    try {
      await updateDates.mutateAsync({ containerId: container.id, ...input });
      msg.success(t("Dates updated"));
    } catch (e) {
      showError(e, "Could not update dates");
      throw e;
    }
  };

  const saveMoveBack = async (v: MoveBackValues, allowNegativeInventory = false) => {
    const input = {
      containerId: container.id,
      status: v.status,
      reason: v.reason.trim(),
      allowNegativeInventory,
    };
    try {
      await moveBack.mutateAsync(input);
      msg.success(`${t("Moved back to")} ${t(STATUS_LABEL[v.status])}`);
    } catch (e) {
      if (isNegativeInventoryError(e)) {
        const products = new Map(
          container.container_item.map((item) => [item.product_category.id, fmtProduct(item.product_category)] as const),
        );
        confirmNegativeInventory({
          error: e,
          t,
          intro: t("Some of this container's stock has already been sold. Undoing the unload will result in negative stock:"),
          okText: t("Undo anyway"),
          labelOf: (productId) => products.get(productId) ?? productId,
          onOk: () => saveMoveBack(v, true),
        });
        return;
      }
      showError(e, "Could not move the container back");
      if (!allowNegativeInventory) throw e; // keeps the modal open
    }
  };

  const markAtPort = async () => {
    try {
      await updateStatus.mutateAsync({
        containerId: container.id,
        status: "ARRIVED_AT_PORT",
        dateArrivedAtPort: today,
      });
      msg.success(t("Marked at port · pull out by {date}", {
        date: dayjs().add(gracePeriodDays ?? 0, "day").format("MMMM DD, YYYY"),
      }));
    } catch (e) {
      showError(e, "Could not update status");
    }
  };

  const markDelivered = async () => {
    try {
      await updateStatus.mutateAsync({
        containerId: container.id,
        status: "DELIVERED",
        dateDelivered: today,
      });
      msg.success(t("Marked delivered"));
    } catch (e) {
      showError(e, "Could not update status");
    }
  };

  const saveCancel = async (v: CancelValues) => {
    try {
      await updateStatus.mutateAsync({
        containerId: container.id,
        status: "CANCELLED",
        cancellationReason: v.cancellation_reason.trim(),
      });
      msg.success(t("Container cancelled"));
    } catch (e) {
      showError(e, "Could not cancel container");
      throw e; // keeps the modal open
    }
  };

  const saveHauling = async (v: HaulingValues) => {
    try {
      await updateHauling.mutateAsync(
        v.assignment === "THIRD_PARTY"
          ? {
              containerId: container.id,
              assignment: "THIRD_PARTY",
              hauler: v.hauler!.trim(),
            }
          : { containerId: container.id, assignment: v.assignment },
      );
      msg.success(
        v.assignment === "NOT_ASSIGNED"
          ? t("Hauling assignment removed")
          : t("Hauling assignment updated"),
      );
    } catch (e) {
      showError(e, "Could not update hauling assignment");
      throw e;
    }
  };

  const unloadMatched = async () => {
    try {
      await unload.mutateAsync({
        containerId: container.id,
        dateUnloaded: today,
        discrepancies: [],
      });
      msg.success(t("Container unloaded — all items matched"));
    } catch (e) {
      showError(e, "Could not unload container");
    }
  };

  const nextStep = archived ? null
    : container.status === "DOCUMENTED" ? (
      <Tooltip title={gracePeriodDays ? undefined : t("Set a grace period for this shipping company first")}>
        <Button type="primary" disabled={!gracePeriodDays} loading={updateStatus.isPending} onClick={markAtPort}>
          {t("Mark at port")}
        </Button>
      </Tooltip>
    ) : container.status === "ARRIVED_AT_PORT" ? (
      <Button type="primary" loading={updateStatus.isPending} onClick={markDelivered}>
        {t("Mark delivered")}
      </Button>
    ) : container.status === "DELIVERED" ? (
      <Tooltip title={deliveredLater ? t("The delivered date is after today. Correct it with Edit dates first.") : undefined}>
        <Popconfirm
          disabled={deliveredLater}
          title={t("Any discrepancies?")}
          description={t("The container is recorded as unloaded today.")}
          okText={t("Yes, resolve")}
          cancelText={t("No, all matched")}
          // onConfirm/onCancel only fire from their buttons, never from
          // clicking outside, so dismissing never unloads by accident.
          onConfirm={() => navigate(`/containers/${container.id}/unload`)}
          onCancel={unloadMatched}
          cancelButtonProps={{ loading: unload.isPending }}
        >
          <Button type="primary" disabled={deliveredLater} loading={unload.isPending}>
            {t("Unload")}
          </Button>
        </Popconfirm>
      </Tooltip>
    ) : null;

  const actions = (
    <Flex vertical gap={8} className="container-manage-actions">
      {nextStep}
      {(container.status === "DOCUMENTED" || container.status === "ARRIVED_AT_PORT") && (
        <CommonModalForm<HaulingValues>
          title={`${t("Hauling")} · ${container.container_no ?? t("No box")}`}
          triggerLabel={container.is_company_truck === null ? t("Assign hauling") : t("Change hauling")}
          triggerButtonType="default"
          okText={t("Save assignment")}
          width={420}
          initialValues={{
            assignment: container.is_company_truck === null
              ? "NOT_ASSIGNED"
              : container.is_company_truck
                ? "OWN_TRUCK"
                : "THIRD_PARTY",
            hauler: container.hauler ?? undefined,
          }}
          onSave={saveHauling}
        >
          {(form) => <HaulingFields form={form} />}
        </CommonModalForm>
      )}

      {canEditDates && (
        <CommonModalForm<DateValues>
          title={`${t("Edit dates")} · ${container.container_no ?? t("No box")}`}
          triggerLabel={t("Edit dates")}
          triggerButtonType="default"
          okText={t("Save dates")}
          width={420}
          initialValues={{
            date_arrived_at_port: container.date_arrived_at_port ? dayjs(container.date_arrived_at_port) : undefined,
            date_delivered: deliveredOn ?? undefined,
            date_unloaded: container.date_unloaded ? dayjs(container.date_unloaded) : undefined,
          }}
          onSave={saveDates}
        >
          {(form) => <DateFields form={form} container={container} />}
        </CommonModalForm>
      )}

      {backOptions.length > 0 && (
        <CommonModalForm<MoveBackValues>
          title={`${t("Move back")} · ${container.container_no ?? t("No box")}`}
          triggerLabel={t("Move back")}
          triggerButtonType="default"
          okText={t("Move back")}
          width={460}
          initialValues={{ status: backOptions[0] }}
          onSave={(v) => saveMoveBack(v)}
        >
          {(form) => <MoveBackFields form={form} container={container} />}
        </CommonModalForm>
      )}

      {isOpen && (
        <CommonModalForm<CancelValues>
          title={`${t("Cancel container")} · ${container.container_no ?? t("No box")}`}
          triggerLabel={t("Cancel container")}
          triggerButtonType="default"
          okText={t("Cancel container")}
          width={420}
          onSave={saveCancel}
        >
          <Form.Item
            name="cancellation_reason"
            label={t("Cancellation reason")}
            rules={[{ required: true, whitespace: true, message: t("Enter a reason") }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </CommonModalForm>
      )}
    </Flex>
  );

  return (
    <>
      {msgHolder}
      {errorHolder}
      <Popover content={actions} title={t("Container actions")} trigger="click" placement="bottomRight">
        <Button>{t("Manage")} <DownOutlined /></Button>
      </Popover>
    </>
  );
}
