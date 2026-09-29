import { Flex, Tag, Typography } from "antd";

import type { ContainerStatus } from "../../../queries/types";
import { STATUS_COLOR, STATUS_LABEL } from "../type-format/format";

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
  return (
    <Flex align="center" gap={6} wrap>
      <Typography.Text type="secondary">Container status:</Typography.Text>
      {STATUSES.map((s) => (
        <Tag key={s} color={STATUS_COLOR[s]} style={{ margin: 0 }}>
          {STATUS_LABEL[s]}
        </Tag>
      ))}
    </Flex>
  );
}
