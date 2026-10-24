import { useState } from "react";
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
  useUnloadContainer,
  useUpdateContainerDates,
  useUpdateContainerHauling,
  useUpdateContainerStatus,
} from "../../../queries/useHooks";
import type {
  ContainerStatus,
  HaulingAssignment,
  ShipmentRow,
  UpdateContainerStatusInput,
} from "../../../queries/types";
import { STATUS_LABEL } from "../type-format/format";
import { useLanguage } from "../../../common/context/language-context";

type ShipmentContainer = ShipmentRow["container"][number];

type StatusValues = {
  status: UpdateContainerStatusInput["status"];
  date_delivered?: Dayjs;
  date_arrived_at_port?: Dayjs;
  grace_period_ready?: boolean;
  cancellation_reason?: string;
};

type DateValues = {
  date_arrived_at_port?: Dayjs;
  date_delivered?: Dayjs;
  date_unloaded?: Dayjs;
};

type HaulingValues = {
  assignment: HaulingAssignment;
  hauler?: string;
};

// UNLOADED is deliberately absent — it only happens through the unload RPC.
const STATUS_OPTIONS = {
  DOCUMENTED: ["ARRIVED_AT_PORT", "DELIVERED", "CANCELLED"],
  ARRIVED_AT_PORT: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["CANCELLED"],
  CANCELLED: [],
  UNLOADED: [],
} satisfies Record<ContainerStatus, Array<UpdateContainerStatusInput["status"]>>;

function StatusFields({
  form,
  currentStatus,
  gracePeriodDays,
  shippingCompanyName,
}: {
  form: FormInstance<StatusValues>;
  currentStatus: ContainerStatus;
  gracePeriodDays: number | null;
  shippingCompanyName: string | null;
}) {
  const { t } = useLanguage();
  const status = Form.useWatch("status", form);
  const arrivedAtPort = Form.useWatch("date_arrived_at_port", form);
  const pullOutBefore = arrivedAtPort && gracePeriodDays
    ? arrivedAtPort.add(gracePeriodDays, "day")
    : null;
  return (
    <>
      <Form.Item
        name="status"
        label={t("Status")}
        rules={[{ required: true, message: t("Pick a status") }]}
      >
        <Select
          options={STATUS_OPTIONS[currentStatus].map((s) => ({
            label: t(STATUS_LABEL[s]),
            value: s,
          }))}
        />
      </Form.Item>
      {status === "ARRIVED_AT_PORT" && (
        <>
          <Form.Item
            name="date_arrived_at_port"
            label={t("Date arrived at port")}
            rules={[{ required: true, message: t("Pick the port arrival date") }]}
          >
            <DatePicker format="MMMM DD, YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="grace_period_ready"
            hidden
            rules={[{
              validator: () => gracePeriodDays
                ? Promise.resolve()
                : Promise.reject(new Error(t("Configure the shipping company's grace period first"))),
            }]}
          >
            <Input type="hidden" />
          </Form.Item>
          {gracePeriodDays && pullOutBefore ? (
            <Alert
              type="info"
              showIcon
              message={t("Pull out on or before {date}", {
                date: pullOutBefore.format("MMMM DD, YYYY"),
              })}
              description={t("Calculated automatically from {company}'s {days}-day grace period.", {
                company: shippingCompanyName ?? t("the shipping company"),
                days: gracePeriodDays,
              })}
              style={{ marginBottom: 24 }}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message={t("Grace period not configured")}
              description={t("Set a grace period for this shipping company before updating the status.")}
              style={{ marginBottom: 24 }}
            />
          )}
        </>
      )}
      {status === "DELIVERED" && (
        <Form.Item
          name="date_delivered"
          label={t("Date delivered")}
          rules={[{ required: true, message: t("Pick the delivery date") }]}
        >
          <DatePicker format="MMMM DD, YYYY" style={{ width: "100%" }} />
        </Form.Item>
      )}
      {status === "CANCELLED" && (
        <Form.Item
          name="cancellation_reason"
          label={t("Cancellation reason")}
          rules={[{ required: true, whitespace: true, message: t("Enter a reason") }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
      )}
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

/** Update-status, date-correction and unload controls for one container row. */
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

  const deliveredOn = container.date_delivered
    ? dayjs(container.date_delivered)
    : null;
  const [unloadDate, setUnloadDate] = useState<Dayjs>(() => dayjs());

  const canEditDates = !archived && !!(
    container.date_arrived_at_port || container.date_delivered || container.date_unloaded
  );
  // A cancelled container is closed. An unloaded one only allows date fixes.
  if (container.status === "CANCELLED") return null;
  if (container.status === "UNLOADED" && !canEditDates) return null;

  const isOpen = container.status !== "UNLOADED";
  const canUnload = container.status === "DELIVERED";

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

  const saveStatus = async (v: StatusValues) => {
    try {
      await updateStatus.mutateAsync({
        containerId: container.id,
        status: v.status,
        dateDelivered: v.date_delivered?.format("YYYY-MM-DD"),
        dateArrivedAtPort: v.date_arrived_at_port?.format("YYYY-MM-DD"),
        cancellationReason: v.cancellation_reason?.trim(),
      });
      msg.success(`${t("Marked")} ${t(STATUS_LABEL[v.status as ContainerStatus])}`);
    } catch (e) {
      showError(e, "Could not update status");
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
        dateUnloaded: unloadDate.format("YYYY-MM-DD"),
        discrepancies: [],
      });
      msg.success(t("Container unloaded — all items matched"));
    } catch (e) {
      showError(e, "Could not unload container");
    }
  };

  const actions = (
    <Flex vertical gap={8} className="container-manage-actions">
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

      {isOpen && (
      <CommonModalForm<StatusValues>
        title={`${t("Update status")} · ${container.container_no ?? t("No box")}`}
        triggerLabel={t("Update status")}
        triggerButtonType="default"
        okText={t("Update")}
        width={420}
        initialValues={{
          status: STATUS_OPTIONS[container.status][0],
          date_delivered: deliveredOn ?? dayjs(),
          date_arrived_at_port: dayjs(),
        }}
        onSave={saveStatus}
      >
        {(form) => (
          <StatusFields
            form={form}
            currentStatus={container.status}
            gracePeriodDays={container.shipping_company?.grace_period_days ?? null}
            shippingCompanyName={container.shipping_company?.name ?? null}
          />
        )}
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

      {isOpen && (
      <Tooltip title={canUnload ? undefined : t("Mark as delivered first")}>
        <Popconfirm
          disabled={!canUnload}
          title={t("Any discrepancies?")}
          description={
            <Flex vertical gap={6} style={{ marginTop: 4 }}>
              <Typography.Text type="secondary">{t("Date unloaded")}</Typography.Text>
              <DatePicker
                value={unloadDate}
                allowClear={false}
                format="MMMM DD, YYYY"
                onChange={(d) => d && setUnloadDate(d)}
                disabledDate={(d) =>
                  !!deliveredOn && d.isBefore(deliveredOn, "day")
                }
                // Render the calendar inside the popconfirm, otherwise
                // clicking a day counts as an outside click and closes it.
                getPopupContainer={(trigger) =>
                  trigger.parentElement ?? document.body
                }
              />
            </Flex>
          }
          okText={t("Yes, resolve")}
          cancelText={t("No, all matched")}
          // onConfirm/onCancel only fire from their buttons, never from
          // clicking outside, so dismissing never unloads by accident.
          onConfirm={() =>
            navigate(
              `/containers/${container.id}/unload?date=${unloadDate.format("YYYY-MM-DD")}`,
            )
          }
          onCancel={unloadMatched}
          cancelButtonProps={{ loading: unload.isPending }}
        >
          <Button type="primary" disabled={!canUnload} loading={unload.isPending}>
            {t("Unload")}
          </Button>
        </Popconfirm>
      </Tooltip>
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
