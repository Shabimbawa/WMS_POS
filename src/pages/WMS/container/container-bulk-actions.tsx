import { Alert, Button, Flex, Form, Input, Popconfirm, Select, Tooltip, message } from "antd";
import type { FormInstance } from "antd";
import dayjs from "dayjs";

import CommonModalForm from "../../../common/items/modal/modal";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { useBulkContainerUpdate, type BulkContainerStep } from "../../../queries/useHooks";
import type { ContainerListRow, ContainerStatus, MoveContainerBackInput } from "../../../queries/types";
import { STATUS_LABEL } from "../type-format/format";
import { useLanguage } from "../../../common/context/language-context";

type MoveBackTarget = MoveContainerBackInput["status"];
type MoveBackValues = { status: MoveBackTarget; reason?: string };

/** A primary mass action that always asks before it runs. */
function ConfirmStep({
  label,
  count,
  disabledReason,
  loading,
  title,
  description,
  okText,
  onConfirm,
}: {
  label: string;
  /** How many containers the step will act on. */
  count: number;
  /** Shown on hover when count is 0. */
  disabledReason?: string;
  loading: boolean;
  title: string;
  description: string;
  okText: string;
  onConfirm: () => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const disabled = !count;
  return (
    <Tooltip title={disabled ? disabledReason : undefined}>
      <Popconfirm
        disabled={disabled}
        title={title}
        description={<div style={{ maxWidth: 320 }}>{description}</div>}
        okText={okText}
        cancelText={t("Cancel")}
        onConfirm={onConfirm}
      >
        <Button type="primary" disabled={disabled} loading={loading}>
          {label} ({count})
        </Button>
      </Popconfirm>
    </Tooltip>
  );
}

function MoveBackFields({
  form,
  from,
  containers,
}: {
  form: FormInstance<MoveBackValues>;
  from: ContainerStatus;
  containers: ContainerListRow[];
}) {
  const { t } = useLanguage();
  const target = Form.useWatch("status", form);
  const withPortDate = containers.filter((c) => c.date_arrived_at_port).length;
  const noPortDate = containers.length - withPortDate;
  const effect = from === "ARRIVED_AT_PORT"
    ? t("Moves them back to Documented and removes their port arrival date and pull-out deadline.")
    : target === "ARRIVED_AT_PORT"
      ? t("Removes their delivered date. They return to the port pull-out list.")
      : target === "DOCUMENTED"
        ? t("Removes their port arrival date, pull-out deadline and delivered date.")
        : null;

  return (
    <>
      <Form.Item
        name="status"
        label={t("Move back to")}
        rules={[{ required: true, message: t("Pick a status") }]}
      >
        <Select
          options={(from === "DELIVERED" ? ["ARRIVED_AT_PORT", "DOCUMENTED"] as const : ["DOCUMENTED"] as const).map((s) => ({
            label: t(STATUS_LABEL[s]),
            value: s,
            // At port keeps the arrival date, so it needs one.
            disabled: s === "ARRIVED_AT_PORT" && !withPortDate,
          }))}
        />
      </Form.Item>
      {effect && <Alert type="info" showIcon message={effect} style={{ marginBottom: 12 }} />}
      {target === "ARRIVED_AT_PORT" && noPortDate > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t("{count} of {total} have no port arrival date and will be skipped", {
            count: noPortDate,
            total: containers.length,
          })}
          description={t("Move them back to Documented instead.")}
          style={{ marginBottom: 12 }}
        />
      )}
      <Form.Item name="reason" label={t("Reason (optional)")} style={{ marginTop: 12 }}>
        <Input.TextArea rows={3} maxLength={2000} placeholder={t("e.g. Marked by mistake")} />
      </Form.Item>
    </>
  );
}

/**
 * The status list's mass actions for the ticked containers. They match the
 * single-container buttons: one click (after a confirm), dated today.
 */
export function ContainerBulkActions({
  status,
  containers,
}: {
  status: ContainerStatus;
  /** The ticked containers, all in `status`. */
  containers: ContainerListRow[];
}) {
  const { t } = useLanguage();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder: errorHolder } = ErrorNotificationPopup();
  const bulk = useBulkContainerUpdate();
  const busy = bulk.isPending ? bulk.variables?.step.action : undefined;
  const today = dayjs().format("YYYY-MM-DD");
  const total = containers.length;

  const run = async (containerIds: string[], step: BulkContainerStep, doneText: string, values: Record<string, string> = {}) => {
    const result = await bulk.mutateAsync({ containerIds, step });
    if (result.done) msg.success(t(doneText, { count: result.done, ...values }));
    if (result.failed.length) {
      showError(
        result.failed[0].error,
        t("{count} of {total} containers could not be updated", {
          count: result.failed.length,
          total: containerIds.length,
        }),
      );
    }
    return result;
  };

  const moveBack = (status === "ARRIVED_AT_PORT" || status === "DELIVERED") && (
    <CommonModalForm<MoveBackValues>
      title={t("Move back {count} containers", { count: total })}
      triggerLabel={`${t("Move back")} (${total})`}
      triggerButtonType="default"
      triggerDisabled={!total || !!busy}
      okText={t("Move back")}
      width={460}
      initialValues={{
        status: status === "DELIVERED" && containers.some((c) => c.date_arrived_at_port)
          ? "ARRIVED_AT_PORT"
          : "DOCUMENTED",
      }}
      onSave={async (v) => {
        const ids = (v.status === "ARRIVED_AT_PORT" ? containers.filter((c) => c.date_arrived_at_port) : containers)
          .map((c) => c.id);
        const result = await run(
          ids,
          { action: "MOVE_BACK", status: v.status, reason: v.reason?.trim() || undefined },
          "{count} containers moved back to {status}",
          { status: t(STATUS_LABEL[v.status]) },
        );
        if (!result.done) throw result.failed[0].error; // keeps the modal open
      }}
    >
      {(form) => <MoveBackFields form={form} from={status} containers={containers} />}
    </CommonModalForm>
  );

  let next = null;

  if (status === "DOCUMENTED") {
    // The pull-out deadline needs the shipping company's grace period;
    // containers without one are skipped.
    const ready = containers.filter((c) => c.shipping_company?.grace_period_days);
    const skipped = total - ready.length;
    next = (
      <ConfirmStep
        label={t("Mark at port")}
        count={ready.length}
        disabledReason={total ? t("Set a grace period for these shipping companies first") : undefined}
        loading={busy === "ARRIVE_AT_PORT"}
        title={skipped
          ? t("{count} of {total} have no grace period", { count: skipped, total })
          : t("Mark {count} containers at port?", { count: ready.length })}
        description={skipped
          ? t("They will be skipped. Set a grace period for their shipping company first.")
          : t("They are recorded as arrived at port today.")}
        okText={skipped ? t("Mark the rest at port") : t("Mark at port")}
        onConfirm={() => run(ready.map((c) => c.id), { action: "ARRIVE_AT_PORT", date: today }, "{count} containers marked at port")}
      />
    );
  }

  if (status === "ARRIVED_AT_PORT") {
    // Same default as the single button: unset hauling becomes own truck.
    const haulingUnset = containers.filter((c) => c.is_company_truck === null).map((c) => c.id);
    next = (
      <ConfirmStep
        label={t("Mark delivered")}
        count={total}
        loading={busy === "DELIVER"}
        // Still confirmed, as every mass step is, but without the hauling
        // warning: unset hauling quietly becomes own truck.
        title={t("Mark {count} containers delivered?", { count: total })}
        description={t("They are recorded as delivered today.")}
        okText={t("Mark delivered")}
        onConfirm={() => run(
          containers.map((c) => c.id),
          { action: "DELIVER", date: today, setOwnTruckIds: haulingUnset },
          "{count} containers marked delivered",
        )}
      />
    );
  }

  if (status === "DELIVERED") {
    // Only possible when a delivered date was corrected into the future.
    const ready = containers.filter((c) => !c.date_delivered || !dayjs().isBefore(dayjs(c.date_delivered), "day"));
    const later = total - ready.length;
    next = (
      <ConfirmStep
        label={t("Unload as all matched")}
        count={ready.length}
        disabledReason={total ? t("The delivered date is after today. Correct it with Edit dates first.") : undefined}
        loading={busy === "UNLOAD"}
        title={t("Unload {count} containers as all matched?", { count: ready.length })}
        description={[
          t("Each is recorded as unloaded today at its declared quantities, with no discrepancies. Untick any with discrepancies and unload them one by one."),
          later ? t("{count} with a delivered date after today will be skipped.", { count: later }) : "",
        ].filter(Boolean).join(" ")}
        okText={t("Unload as all matched")}
        onConfirm={() => run(ready.map((c) => c.id), { action: "UNLOAD", date: today }, "{count} containers unloaded")}
      />
    );
  }

  if (!next) return null;
  return (
    <Flex gap={8} wrap align="center">
      {msgHolder}
      {errorHolder}
      {next}
      {moveBack}
    </Flex>
  );
}
