import { Button, Tooltip } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import type { OrderSlip } from "../../../queries/posTypes";
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
