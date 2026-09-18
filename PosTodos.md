ToDos and things to take note of for the POS-side of things

1. Clarify the requirements/specifications for the summary page
2. Known UI issue
    - `src/pages/POS/orderslip/create-orderslip-page.tsx` / `src/pages/POS/orderslip/edit-orderslip-page.tsx` — the "Order slip created/updated" success toast likely never shows, because the page that renders it (`message.useMessage()` holder) unmounts on `navigate`. Same issue exists on the WMS `create-shipment-page.tsx`.
