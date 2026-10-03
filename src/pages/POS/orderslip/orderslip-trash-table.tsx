import { createContext, useContext, useMemo } from "react";
import { Button, Flex, Popconfirm, Popover, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, RollbackOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "../../../common/items/table/table";
import { fmtTableDate, fmtTableDateTime } from "../../../common/utils/util";
import type { TrashedOrderSlip } from "../../../queries/posTypes";
import { usePurgeOrderSlip, useRestoreOrderSlip } from "../../../queries/useHooks";
import {
  fmtInt,
  fmtMoney,
  fmtProduct,
  fmtSlipNumber,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
} from "../type-format/format";
import { useLanguage, type Translate } from "../../../common/context/language-context";

/** Toasts from the page: a row's own holder would unmount with the row. */
export interface TrashNotify {
  success: (text: string) => void;
  error: (error: unknown, title: string) => void;
}

const NotifyContext = createContext<TrashNotify | null>(null);

/** Restore and delete-forever controls for one trashed slip. */
function TrashActions({ slip }: { slip: TrashedOrderSlip }) {
  const { t } = useLanguage();
  const notify = useContext(NotifyContext)!;
  const restore = useRestoreOrderSlip();
  const purge = usePurgeOrderSlip();

  const onRestore = async () => {
    try {
      await restore.mutateAsync(slip.id);
      notify.success(t("Restored {slip}", { slip: fmtSlipNumber(slip) }));
    } catch (e) {
      notify.error(e, "Could not restore order slip");
    }
  };

  const onPurge = async () => {
    try {
      await purge.mutateAsync(slip.id);
      notify.success(t("Order slip deleted permanently"));
    } catch (e) {
      notify.error(e, "Could not delete order slip");
    }
  };

  return (
    <Flex gap={4} justify="end">
      <Popconfirm
        title={t("Restore this order slip?")}
        description={t("Its sacks are deducted from stock again.")}
        okText={t("Restore")}
        onConfirm={onRestore}
      >
        <Tooltip title={t("Restore")}>
          <Button type="text" icon={<RollbackOutlined />} aria-label={t("Restore")} loading={restore.isPending} />
        </Tooltip>
      </Popconfirm>
      <Popconfirm
        title={t("Delete this order slip permanently?")}
        description={t("It can't be restored afterwards. Stock is not affected.")}
        okText={t("Delete forever")}
        okButtonProps={{ danger: true }}
        onConfirm={onPurge}
      >
        <Tooltip title={t("Delete forever")}>
          <Button type="text" danger icon={<DeleteOutlined />} aria-label={t("Delete forever")} loading={purge.isPending} />
        </Tooltip>
      </Popconfirm>
    </Flex>
  );
}

const trashColumns = (t: Translate): ColumnDef<TrashedOrderSlip, any>[] => [
  {
    id: "slip",
    header: "Slip",
    // Same date format as every other table, then the day's slip number.
    accessorFn: (r) => `${fmtTableDate(r.date)} · #${r.slipNumber}`,
    size: 140,
    meta: { fixed: "left" },
    cell: (c) => <span style={{ fontFamily: "monospace" }}>{c.getValue<string>()}</span>,
  },
  {
    id: "orderBy",
    header: "Order by",
    accessorFn: (r) => r.orderBy,
    size: 160,
    cell: (c) => c.getValue<string>() || "—",
  },
  {
    id: "cashier",
    header: "Cashier",
    accessorFn: (r) => r.cashier.name,
    size: 140,
  },
  {
    id: "items",
    header: "Articles",
    accessorFn: (r) => r.items.length,
    size: 130,
    // A count with the full list on hover keeps every row one line tall.
    cell: (c) => {
      const items = c.row.original.items;
      return (
        <Popover
          title={t("Articles")}
          content={
            <Flex vertical gap={2} style={{ maxHeight: 280, overflowY: "auto" }}>
              {items.map((item) => (
                <Flex key={item.id} justify="space-between" gap={16}>
                  <span>{fmtProduct(item.article)}</span>
                  <span>× {fmtInt(item.quantity)}</span>
                </Flex>
              ))}
            </Flex>
          }
        >
          <Typography.Link>
            {items.length} {t(items.length === 1 ? "article" : "articles")}
          </Typography.Link>
        </Popover>
      );
    },
  },
  {
    id: "status",
    header: "Payment",
    accessorFn: (r) => r.status,
    size: 100,
    cell: (c) => (
      <Tag color={PAYMENT_STATUS_COLOR[c.row.original.status]} style={{ margin: 0 }}>
        {t(PAYMENT_STATUS_LABEL[c.row.original.status])}
      </Tag>
    ),
  },
  {
    id: "deletedAt",
    header: "Deleted",
    accessorFn: (r) => r.deletedAt,
    size: 200,
    cell: (c) => {
      const slip = c.row.original;
      return (
        <div>
          {fmtTableDateTime(slip.deletedAt)}
          {slip.deletedBy && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>{t("by")} {slip.deletedBy}</div>
          )}
        </div>
      );
    },
  },
  {
    id: "purgeAt",
    header: "Deleted forever",
    accessorFn: (r) => r.purgeAt,
    size: 150,
    cell: (c) => {
      const days = Math.max(0, Math.ceil(dayjs(c.getValue<string>()).diff(dayjs(), "day", true)));
      return (
        <Tooltip title={fmtTableDateTime(c.getValue<string>())}>
          <span style={{ color: days <= 3 ? "var(--ant-color-error, #ff4d4f)" : undefined }}>
            {days === 0 ? t("Today") : t("In {count} days", { count: days })}
          </span>
        </Tooltip>
      );
    },
  },
  {
    id: "totalAmount",
    header: "Total amount",
    accessorFn: (r) => r.totalAmount,
    size: 140,
    meta: { fixed: "right" },
    cell: (c) => <strong>{fmtMoney(c.getValue<number>())}</strong>,
  },
  {
    id: "actions",
    header: "",
    accessorFn: (r) => r.id,
    size: 100,
    meta: { fixed: "right" },
    cell: (c) => <TrashActions slip={c.row.original} />,
  },
];

export function OrderSlipTrashTable({ data, notify }: { data: TrashedOrderSlip[]; notify: TrashNotify }) {
  const { t } = useLanguage();
  const columns = useMemo(() => trashColumns(t), [t]);
  return (
    <NotifyContext.Provider value={notify}>
      <DataTable data={data} columns={columns} />
    </NotifyContext.Provider>
  );
}
