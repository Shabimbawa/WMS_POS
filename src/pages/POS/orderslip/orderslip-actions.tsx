import { Button, Popconfirm, Tooltip, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import type { OrderSlip } from "../../../queries/posTypes";
import { useDeleteOrderSlip } from "../../../queries/useHooks";
import { canEditOrderSlip } from "../type-format/format";

/**
 * Opens the edit page. Disabled for paid slips, with a tooltip saying why.
 * `compact` renders icon-only for table rows.
 */
export function EditOrderSlipButton({
  slip,
  compact = false,
}: {
  slip: Pick<OrderSlip, "id" | "status">;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const editable = canEditOrderSlip(slip);

  return (
    <Tooltip
      title={
        editable
          ? compact
            ? "Edit order slip"
            : undefined
          : "Paid order slips can't be edited"
      }
    >
      <Button
        type={compact ? "text" : "default"}
        icon={<EditOutlined />}
        aria-label="Edit order slip"
        disabled={!editable}
        onClick={() => navigate(`/order-slip/${slip.id}/edit`)}
      >
        {compact ? null : "Edit"}
      </Button>
    </Tooltip>
  );
}

/**
 * Moves a slip to Trash after a confirm. Its stock goes back on the shelf
 * straight away; it can be restored from Trash for 30 days. `onDeleted`
 * runs after success, e.g. to replace a detail page that no longer exists;
 * pass it instead of relying on this button's toast when that happens.
 */
export function DeleteOrderSlipButton({
  slip,
  compact = false,
  onDeleted,
}: {
  slip: Pick<OrderSlip, "id">;
  compact?: boolean;
  onDeleted?: () => void;
}) {
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const remove = useDeleteOrderSlip();

  const confirm = async () => {
    try {
      await remove.mutateAsync(slip.id);
      if (onDeleted) onDeleted();
      else msg.success("Order slip moved to Trash");
    } catch (e) {
      showError(e, "Could not delete order slip");
    }
  };

  return (
    <>
      {msgHolder}
      {contextHolder}
      <Popconfirm
        title="Move this order slip to Trash?"
        description="Its sacks go back into stock. You can restore it from Trash within 30 days."
        okText="Move to Trash"
        okButtonProps={{ danger: true }}
        onConfirm={confirm}
      >
        <Tooltip title={compact ? "Delete order slip" : undefined}>
          <Button
            danger
            type={compact ? "text" : "default"}
            icon={<DeleteOutlined />}
            aria-label="Delete order slip"
            loading={remove.isPending}
          >
            {compact ? null : "Delete"}
          </Button>
        </Tooltip>
      </Popconfirm>
    </>
  );
}
