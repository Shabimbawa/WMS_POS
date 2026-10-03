import { message } from "antd";
import { useNavigate } from "react-router-dom";

import type { CreateOrderSlipInput } from "../../../queries/posTypes";
import { useCreateOrderSlip } from "../../../queries/useHooks";
import { posToday } from "../type-format/format";
import { OrderSlipForm } from "./orderslip-form";
import { useLanguage } from "../../../common/context/language-context";

/** Default payment terms for an unpaid or partial slip, in days from today. */
const DEFAULT_TERM_DAYS = 14;

export default function CreateOrderSlipPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();

  const create = useCreateOrderSlip();

  const submit = async (input: CreateOrderSlipInput) => {
    const id = await create.mutateAsync(input);
    msg.success(t("Order slip created"));
    navigate(`/order-slip/${id}`);
  };

  return (
    <>
      {msgHolder}
      <OrderSlipForm
        title={t("New order slip")}
        initialValues={{
          date: posToday(),
          status: "unpaid",
          paymentDueDate: posToday().add(DEFAULT_TERM_DAYS, "day"),
        }}
        submitLabel={t("Create order slip")}
        submitting={create.isPending}
        errorTitle={t("Could not create order slip")}
        cancelTo="/order-slip"
        onSubmit={submit}
      />
    </>
  );
}
