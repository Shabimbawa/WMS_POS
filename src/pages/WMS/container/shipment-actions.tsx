import { Button, Flex, Popconfirm, Tooltip, message } from "antd";
import { InboxOutlined, UndoOutlined } from "@ant-design/icons";

import type { ShipmentRow } from "../../../queries/types";
import {
  useArchiveShipment,
  useRestoreShipment,
} from "../../../queries/useHooks";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { useLanguage } from "../../../common/context/language-context";
import { ShipmentPrintButton } from "./print-shipment";

export function ShipmentActions({ shipment }: { shipment: ShipmentRow }) {
  const { t } = useLanguage();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const archive = useArchiveShipment();
  const restore = useRestoreShipment();
  const isArchived = Boolean(shipment.archived_at);
  const isComplete =
    shipment.container.length > 0 &&
    shipment.container.every(
      ({ status }) => status === "UNLOADED" || status === "CANCELLED",
    );

  const archiveShipment = async () => {
    try {
      await archive.mutateAsync(shipment.id);
      msg.success(t("Shipment archived"));
    } catch (error) {
      showError(error, t("Could not archive shipment"));
    }
  };

  const restoreShipment = async () => {
    try {
      await restore.mutateAsync(shipment.id);
      msg.success(t("Shipment restored"));
    } catch (error) {
      showError(error, t("Could not restore shipment"));
    }
  };

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {contextHolder}
      <ShipmentPrintButton shipment={shipment} />

      {isArchived ? (
        <Popconfirm
          title={t("Restore this shipment?")}
          description={t("It will return to the Active shipments list.")}
          okText={t("Restore")}
          cancelText={t("Cancel")}
          onConfirm={restoreShipment}
        >
          <Tooltip title={t("Restore shipment")}>
            <Button
              type="text"
              icon={<UndoOutlined />}
              aria-label={t("Restore shipment")}
              loading={restore.isPending}
            />
          </Tooltip>
        </Popconfirm>
      ) : (
        <Tooltip
          title={
            isComplete
              ? t("Archive shipment")
              : t("Unload or cancel every container before archiving")
          }
        >
          <span>
            <Popconfirm
              disabled={!isComplete}
              title={t("Archive this shipment?")}
              description={t("It will leave the Active list but remain available in Archived and in reports.")}
              okText={t("Archive")}
              cancelText={t("Cancel")}
              onConfirm={archiveShipment}
            >
              <Button
                type="text"
                icon={<InboxOutlined />}
                aria-label={t("Archive shipment")}
                disabled={!isComplete}
                loading={archive.isPending}
              />
            </Popconfirm>
          </span>
        </Tooltip>
      )}
    </Flex>
  );
}
