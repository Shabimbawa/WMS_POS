import { Modal, Typography } from "antd";

import { ApiError } from "../../../utils/api-client";
import type { Translate } from "../../../common/context/language-context";
import { fmtInt } from "../type-format/format";

type Deficit = { productId: string; balance: number };

/** True when the API refused a stock change pending a negative-inventory confirmation. */
export const isNegativeInventoryError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === "NEGATIVE_INVENTORY_CONFIRMATION_REQUIRED";

/** Lists the products that would go negative and runs `onOk` if the user goes ahead anyway. */
export function confirmNegativeInventory({
  error,
  t,
  intro,
  okText,
  cancelText,
  labelOf,
  onOk,
}: {
  error: ApiError;
  t: Translate;
  intro: string;
  okText: string;
  cancelText?: string;
  labelOf: (productId: string) => string;
  onOk: () => unknown;
}) {
  const deficits = (error.details ?? []) as Deficit[];
  Modal.confirm({
    title: t("Inventory will become negative"),
    content: (
      <div>
        <Typography.Paragraph>{intro}</Typography.Paragraph>
        {deficits.map((item) => (
          <Typography.Text key={item.productId} type="danger" style={{ display: "block" }}>
            {labelOf(item.productId)}: {fmtInt(item.balance)} {t("sacks")}
          </Typography.Text>
        ))}
      </div>
    ),
    okText,
    okButtonProps: { danger: true },
    cancelText: cancelText ?? t("Cancel"),
    onOk,
  });
}
