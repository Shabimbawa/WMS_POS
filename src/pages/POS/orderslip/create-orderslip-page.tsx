import { message } from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
import { useCreateOrderSlip } from "../../../queries/useHooks";
import { OrderSlipForm } from "./orderslip-form";

/** Default payment terms for a new slip, in days from the slip date. */
const DEFAULT_TERM_DAYS = 30;

export default function CreateOrderSlipPage() {
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();

  const create = useCreateOrderSlip();

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
