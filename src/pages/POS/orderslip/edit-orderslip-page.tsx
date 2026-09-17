import { Button, Result, message } from "antd";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useNavigate, useParams } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
import { canEditOrderSlip } from "../type-format/format";
// TODO(backend): mock data. getOrderSlip becomes a query hook keyed by id and
// updateOrderSlip a useUpdateOrderSlip() mutation hook in queries/useHooks.ts;
// see the TODO on updateOrderSlip in orderslip-data.ts.
import { getOrderSlip, updateOrderSlip } from "./orderslip-data";
import { OrderSlipForm } from "./orderslip-form";

export default function EditOrderSlipPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();

  // TODO(backend): replace with a useOrderSlip(id) query; show a Skeleton
  // while it loads, the way the container pages do.
  const slip = getOrderSlip(id);
  // TODO(backend): replace with useUpdateOrderSlip() from queries/useHooks.ts,
  // which should also invalidate the order slip list and this slip's key.
  const update = useMutation({ mutationFn: updateOrderSlip });

  if (!slip) {
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
