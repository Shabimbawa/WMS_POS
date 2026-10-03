import { Button, Result, Skeleton, message } from "antd";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
import { canEditOrderSlip, fmtSlipNumber } from "../type-format/format";
import { useOrderSlip, useUpdateOrderSlip } from "../../../queries/useHooks";
import { OrderSlipForm } from "./orderslip-form";
import { useLanguage } from "../../../common/context/language-context";

export default function EditOrderSlipPage() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();

  const { data: slip, isLoading, isError } = useOrderSlip(id);
  const update = useUpdateOrderSlip();

  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (isError || !slip) {
    return (
      <Result
        status="404"
        title={t("Order slip not found")}
        subTitle={t('No order slip exists with id "{id}".', { id: id ?? "" })}
        extra={<Button onClick={() => navigate("/order-slip")}>{t("Back to order slips")}</Button>}
      />
    );
  }

  const detailPath = `/order-slip/${slip.id}`;

  // The edit buttons are disabled for paid slips, but the URL can still be
  // typed in directly.
  if (!canEditOrderSlip(slip)) {
    return (
      <Result
        status="warning"
        title={t("This order slip can't be edited")}
        subTitle={`Order slip ${fmtSlipNumber(slip)} is already paid. Only unpaid or partially paid slips can be changed.`}
        extra={<Button onClick={() => navigate(detailPath)}>{t("View order slip")}</Button>}
      />
    );
  }

  const submit = async (input: CreateOrderSlipInput) => {
    await update.mutateAsync({ id: slip.id, ...input });
    msg.success(t("Order slip updated"));
    navigate(detailPath);
  };

  return (
    <>
      {msgHolder}
      <OrderSlipForm
        title={
          <>
            {t("Edit order slip")}{" "}
            <span style={{ fontFamily: "monospace" }}>{fmtSlipNumber(slip)}</span>
          </>
        }
        initialValues={{
          date: dayjs(slip.date),
          orderBy: slip.orderBy,
          address: slip.address,
          status: slip.status,
          paymentDueDate: dayjs(slip.paymentDueDate),
          cashierId: slip.cashier.id,
        }}
        currentCashier={slip.cashier}
        savedProducts={slip.items.map((i) => i.article)}
        initialItems={slip.items.map((i) => ({
          key: crypto.randomUUID(),
          productId: i.article.id,
          quantity: i.quantity,
        }))}
        submitLabel={t("Save changes")}
        submitting={update.isPending}
        errorTitle={t("Could not update order slip")}
        cancelTo={detailPath}
        onSubmit={submit}
      />
    </>
  );
}
