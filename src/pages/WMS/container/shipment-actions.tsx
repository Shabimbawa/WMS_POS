import { Button, Flex, Popconfirm, Tooltip, message } from "antd";
import { DeleteOutlined, EditOutlined, InboxOutlined, UndoOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

import type { ShipmentRow } from "../../../queries/types";
import {
  useArchiveShipment,
  useDeleteShipment,
  useRestoreShipment,
} from "../../../queries/useHooks";
import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { useLanguage } from "../../../common/context/language-context";
import { fmtProduct } from "../type-format/format";
import { ShipmentPrintButton } from "./print-shipment";
import { confirmNegativeInventory, isNegativeInventoryError } from "./negative-inventory";

export function ShipmentActions({ shipment }: { shipment: ShipmentRow }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const archive = useArchiveShipment();
  const restore = useRestoreShipment();
  const remove = useDeleteShipment();
  const isArchived = Boolean(shipment.archived_at);
  const isComplete =
    shipment.container.length > 0 &&
    shipment.container.every(
      ({ status }) => status === "UNLOADED" || status === "CANCELLED",
    );
  const canEdit = !isArchived;
  const unloadedCount =shipment.container.filter(({ status }) => status === "UNLOADED").length;

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

  const deleteShipment = async (allowNegativeInventory = false) => {
    try {
      await remove.mutateAsync({ id: shipment.id, allowNegativeInventory });
      msg.success(t("Shipment deleted"));
    } catch (error) {
      if (isNegativeInventoryError(error)) {
        const products = new Map(
          shipment.container.flatMap((container) =>
            container.container_item.map((item) => [item.product_category.id, fmtProduct(item.product_category)] as const),
          ),
        );
        confirmNegativeInventory({
          error,
          t,
          intro: t("Some of this shipment's stock has already been sold. Deleting it will result in negative stock:"),
          okText: t("Delete anyway"),
          labelOf: (productId) => products.get(productId) ?? productId,
          onOk: () => deleteShipment(true),
        });
        return;
      }
      showError(error, t("Could not delete shipment"));
    }
  };

  return (
    <Flex gap={4} justify="end">
      {msgHolder}
      {contextHolder}
      <ShipmentPrintButton shipment={shipment} />
      <Tooltip title={canEdit ? t("Edit shipment") : t("Restore the shipment before editing")}>
        <span><Button type="text" icon={<EditOutlined />} aria-label={t("Edit shipment")} disabled={!canEdit} onClick={() => navigate(`${location.pathname.startsWith("/national") ? "/national" : "/containers"}/${shipment.id}/edit`, { state: { shipment } })} /></span>
      </Tooltip>

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

      <Popconfirm
        title={t("Permanently delete this shipment?")}
        description={
          <div style={{ maxWidth: 300 }}>
            {t("Its {count} containers, their products and discrepancies are deleted too.", { count: shipment.container.length })}
            {unloadedCount > 0 && <> {t("Sacks from {count} unloaded containers are removed from stock.", { count: unloadedCount })}</>}
            {" "}{t("This cannot be undone.")}
          </div>
        }
        okText={t("Delete")}
        okButtonProps={{ danger: true }}
        cancelText={t("Cancel")}
        onConfirm={() => deleteShipment()}
      >
        <Tooltip title={t("Delete shipment")}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={t("Delete shipment")}
            loading={remove.isPending}
          />
        </Tooltip>
      </Popconfirm>
    </Flex>
  );
}
