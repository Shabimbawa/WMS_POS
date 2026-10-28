import { useEffect } from "react";
import { Button, Space, notification } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { useLanguage } from "../../../common/context/language-context";
import { onAutoArchive } from "../../../common/utils/auto-archive-events";
import type { AutoArchivedShipment } from "../../../queries/types";
import { useRestoreShipment } from "../../../queries/useHooks";

/**
 * Pop-up shown when finishing a container archived its shipment. Restore
 * is the undo for a mis-click on the last unload or cancel: archived
 * shipments can't have their dates edited or containers moved back.
 * Mounted once, in AppLayout.
 */
export function AutoArchiveNotice() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [api, holder] = notification.useNotification();
  // mutateAsync is stable, so the listener isn't re-subscribed every render.
  const { mutateAsync: restoreShipment } = useRestoreShipment();

  useEffect(() => onAutoArchive((shipment: AutoArchivedShipment) => {
    const key = `auto-archive-${shipment.id}`;
    const listPath = shipment.kind === "NATIONAL" ? "/national" : "/containers";
    const name = shipment.reference || t("Shipment");

    const undo = async () => {
      try {
        await restoreShipment(shipment.id);
        api.success({
          key,
          title: t("Shipment restored"),
          description: t("{name} is back in the active list.", { name }),
          placement: "bottomRight",
        });
      } catch (error) {
        api.error({
          key,
          title: t("Could not restore shipment"),
          description: (error as Error).message,
          placement: "bottomRight",
        });
      }
    };

    api.info({
      key,
      icon: <InboxOutlined style={{ color: "var(--ant-color-primary, #1677ff)" }} />,
      title: t("Shipment archived automatically"),
      description: t("{name}: every container is unloaded or cancelled, so it moved to Archived.", { name }),
      placement: "bottomRight",
      duration: 12,
      actions: (
        <Space>
          <Button size="small" onClick={() => { api.destroy(key); navigate(`${listPath}?view=archived`); }}>
            {t("View")}
          </Button>
          <Button size="small" type="primary" onClick={undo}>
            {t("Restore")}
          </Button>
        </Space>
      ),
    });
  }), [api, navigate, restoreShipment, t]);

  return holder;
}
