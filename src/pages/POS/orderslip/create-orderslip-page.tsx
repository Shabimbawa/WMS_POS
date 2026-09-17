import { message } from "antd";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
// TODO(backend): mock insert. Replace with a useCreateOrderSlip() mutation
// hook in queries/useHooks.ts; see the TODO on createOrderSlip in
// orderslip-data.ts.
import { createOrderSlip } from "./orderslip-data";
import { OrderSlipForm } from "./orderslip-form";

/** Default payment terms for a new slip, in days from the slip date. */
const DEFAULT_TERM_DAYS = 30;

export default function CreateOrderSlipPage() {
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();

  // TODO(backend): replace with useCreateOrderSlip() from queries/useHooks.ts,
  // which should also invalidate the order slip list on success.
  const create = useMutation({ mutationFn: createOrderSlip });

  const submit = async (input: CreateOrderSlipInput) => {
    const id = await create.mutateAsync(input);
    msg.success("Order slip created");
    navigate(`/order-slip/${id}`);
  };

  return (
    <>
      {msgHolder}
      <OrderSlipForm
        title="New order slip"
        initialValues={{
          date: dayjs(),
          status: "unpaid",
          paymentDueDate: dayjs().add(DEFAULT_TERM_DAYS, "day"),
        }}
        submitLabel="Create order slip"
        submitting={create.isPending}
        errorTitle="Could not create order slip"
        cancelTo="/order-slip"
        onSubmit={submit}
      />
    </>
  );
}
