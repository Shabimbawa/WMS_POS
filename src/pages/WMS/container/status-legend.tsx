import { Flex, Tag, Typography } from "antd";

import type { ContainerStatus } from "../../../queries/types";
import { STATUS_COLOR, STATUS_LABEL } from "../type-format/format";
import { useLanguage } from "../../../common/context/language-context";

/** Lifecycle order, which is also the order the tags read in. */
const STATUSES: ContainerStatus[] = [
  "DOCUMENTED",
  "ARRIVED_AT_PORT",
  "DELIVERED",
  "UNLOADED",
  "CANCELLED",
];

/**
 * Explains the coloured container tags. The shipment row shows container
 * numbers as tags with no text label, so the colour is the only cue.
 */
export function StatusLegend() {
  const { t } = useLanguage();
  return (
    <Flex align="center" gap={6} className="shipment-status-legend">
      <Typography.Text type="secondary" className="shipment-status-legend-label">{t("Container status:")}</Typography.Text>
      {STATUSES.map((s) => (
        <Tag key={s} color={STATUS_COLOR[s]} className="shipment-status-tag">
          {t(STATUS_LABEL[s])}
        </Tag>
      ))}
    </Flex>
  );
}
