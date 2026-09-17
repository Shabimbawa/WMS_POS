import { Button, Result, Skeleton, message } from "antd";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
import { canEditOrderSlip } from "../type-format/format";
import { useOrderSlip, useUpdateOrderSlip } from "../../../queries/useHooks";
import { OrderSlipForm } from "./orderslip-form";

export default function EditOrderSlipPage() {
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
        title="Order slip not found"
        subTitle={`No order slip exists with id "${id}".`}
        extra={<Button onClick={() => navigate("/order-slip")}>Back to order slips</Button>}
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
        title="This order slip can't be edited"
        subTitle={`Order slip #${slip.slipNumber} is already paid. Only unpaid or partially paid slips can be changed.`}
        extra={<Button onClick={() => navigate(detailPath)}>View order slip</Button>}
      />
    );
  }

  const submit = async (input: CreateOrderSlipInput) => {
    await update.mutateAsync({ id: slip.id, ...input });
    msg.success("Order slip updated");
    navigate(detailPath);
  };

  return (
    <>
      {msgHolder}
      <OrderSlipForm
        title={
          <>
            Edit order slip{" "}
            <span style={{ fontFamily: "monospace" }}>#{slip.slipNumber}</span>
          </>
        }
        initialValues={{
          date: dayjs(slip.date),
          orderBy: slip.orderBy,
          address: slip.address,
          status: slip.status,
          paymentDueDate: dayjs(slip.paymentDueDate),
        }}
        initialItems={slip.items.map((i) => ({
          key: crypto.randomUUID(),
          productId: i.article.id,
          quantity: i.quantity,
        }))}
        submitLabel="Save changes"
        submitting={update.isPending}
        errorTitle="Could not update order slip"
        cancelTo={detailPath}
        onSubmit={submit}
      />
    </>
  );
}
