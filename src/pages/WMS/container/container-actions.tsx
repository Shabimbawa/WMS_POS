import { useState } from "react";
import {
  Button,
  DatePicker,
  Flex,
  Form,
  Input,
  Popconfirm,
  Select,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { FormInstance } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useNavigate } from "react-router-dom";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import {
  useUnloadContainer,
  useUpdateContainerStatus,
} from "../../../queries/useHooks";
import type {
  ContainerStatus,
  ShipmentRow,
  UpdateContainerStatusInput,
} from "../../../queries/types";
import { STATUS_LABEL } from "../type-format/format";

type ShipmentContainer = ShipmentRow["container"][number];

type StatusValues = {
  status: UpdateContainerStatusInput["status"];
  date_delivered?: Dayjs;
  date_arrived_at_port?: Dayjs;
  cancellation_reason?: string;
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
}: {
  form: FormInstance<StatusValues>;
  currentStatus: ContainerStatus;
}) {
  const status = Form.useWatch("status", form);
  return (
    <>
      <Form.Item
        name="status"
        label="Status"
        rules={[{ required: true, message: "Pick a status" }]}
      >
        <Select
          options={STATUS_OPTIONS[currentStatus].map((s) => ({
            label: STATUS_LABEL[s],
            value: s,
          }))}
        />
      </Form.Item>
      {status === "ARRIVED_AT_PORT" && (
        <Form.Item
          name="date_arrived_at_port"
          label="Date arrived at port"
          rules={[{ required: true, message: "Pick the port arrival date" }]}
        >
          <DatePicker format="MMMM DD, YYYY" style={{ width: "100%" }} />
        </Form.Item>
      )}
      {status === "DELIVERED" && (
        <Form.Item
          name="date_delivered"
          label="Date delivered"
          rules={[{ required: true, message: "Pick the delivery date" }]}
        >
          <DatePicker format="MMMM DD, YYYY" style={{ width: "100%" }} />
        </Form.Item>
      )}
      {status === "CANCELLED" && (
        <Form.Item
          name="cancellation_reason"
          label="Cancellation reason"
          rules={[{ required: true, whitespace: true, message: "Enter a reason" }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
      )}
    </>
  );
}

/** Update-status and unload controls for one container row. */
export function ContainerActions({
  container,
}: {
  container: ShipmentContainer;
}) {
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const updateStatus = useUpdateContainerStatus();
  const unload = useUnloadContainer();

  const deliveredOn = container.date_delivered
    ? dayjs(container.date_delivered)
    : null;
  const [unloadDate, setUnloadDate] = useState<Dayjs>(() => dayjs());

  // Once unloaded the counts are final; nothing left to act on here.
  if (container.status === "UNLOADED" || container.status === "CANCELLED") return null;

  const canUnload = container.status === "DELIVERED";

  const saveStatus = async (v: StatusValues) => {
    try {
      await updateStatus.mutateAsync({
        containerId: container.id,
        status: v.status,
        dateDelivered: v.date_delivered?.format("YYYY-MM-DD"),
        dateArrivedAtPort: v.date_arrived_at_port?.format("YYYY-MM-DD"),
        cancellationReason: v.cancellation_reason?.trim(),
      });
      msg.success(`Marked ${STATUS_LABEL[v.status as ContainerStatus]}`);
    } catch (e) {
      showError(e, "Could not update status");
      throw e; // keeps the modal open
    }
  };

  const unloadMatched = async () => {
    try {
      await unload.mutateAsync({
        containerId: container.id,
        dateUnloaded: unloadDate.format("YYYY-MM-DD"),
        discrepancies: [],
      });
      msg.success("Container unloaded — all items matched");
    } catch (e) {
      showError(e, "Could not unload container");
    }
  };

  return (
    <Flex gap={8} justify="end">
      {msgHolder}
      {errorHolder}

      <CommonModalForm<StatusValues>
        title={`Update status · ${container.container_no ?? "no box"}`}
        triggerLabel="Update status"
        triggerButtonType="default"
        okText="Update"
        width={420}
        initialValues={{
          status: STATUS_OPTIONS[container.status][0],
          date_delivered: deliveredOn ?? dayjs(),
          date_arrived_at_port: dayjs(),
        }}
        onSave={saveStatus}
      >
        {(form) => <StatusFields form={form} currentStatus={container.status} />}
      </CommonModalForm>

      <Tooltip title={canUnload ? undefined : "Mark as delivered first"}>
        <Popconfirm
          disabled={!canUnload}
          title="Any discrepancies?"
          description={
            <Flex vertical gap={6} style={{ marginTop: 4 }}>
              <Typography.Text type="secondary">Date unloaded</Typography.Text>
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
          okText="Yes, resolve"
          cancelText="No, all matched"
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
            Unload
          </Button>
        </Popconfirm>
      </Tooltip>
    </Flex>
  );
}
