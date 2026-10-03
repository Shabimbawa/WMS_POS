import { useState } from "react";
import { Alert, Drawer, Empty, Flex, Pagination, Skeleton } from "antd";

import { DateParser } from "../../../common/utils/util";
import type { Cashier } from "../../../queries/posTypes";
import { useOrderSlips } from "../../../queries/useHooks";
import { OrderSlipTable } from "../orderslip/orderslip-table";
import { useLanguage } from "../../../common/context/language-context";

export type SummarySelection = { date: string; cashier: Cashier };

/** Every slip one cashier had on one day, in slip-number order. */
export function SummarySlipsDrawer({
  selection,
  onClose,
}: {
  selection: SummarySelection | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  // The page keys this component by selection, so each card starts on page 1.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isPending, isError, error } = useOrderSlips({
    dateFrom: selection?.date ?? "",
    dateTo: selection?.date ?? "",
    cashierId: selection?.cashier.id,
    sortDir: "asc",
    page,
    pageSize,
  }, Boolean(selection));

  return (
    <Drawer
      open={Boolean(selection)}
      onClose={onClose}
      width="min(1100px, 95vw)"
      title={selection ? `${selection.cashier.name} · ${DateParser(selection.date)}` : undefined}
      destroyOnClose
    >
      {isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : isError ? (
        <Alert type="error" showIcon message={t("Could not load order slips")} description={t(error.message)} />
      ) : !data.rows.length ? (
        <Empty description={t("No order slips")} />
      ) : (
        <>
          <OrderSlipTable data={data.rows} />
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={data.total}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(p, ps) => {
                setPage(ps !== pageSize ? 1 : p);
                setPageSize(ps);
              }}
              showTotal={(total, r) => t("{from}–{to} of {total}", { from: r[0], to: r[1], total })}
            />
          </Flex>
        </>
      )}
    </Drawer>
  );
}
