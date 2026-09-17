ToDos and things to take note of for the POS-side of things

Every mock/temporary spot in the code is tagged `TODO(backend)` or `TODO: mock data` — grep for `TODO` under `src/pages/POS` to find them. This file is the checklist; the comments in the code have the details.

1. Update all static data handling to incorporate backend once its setup
    - Fetching of order slips in the main viewing page
        - `src/pages/POS/orderslip/orderslip-page.tsx` — reads `MOCK_SLIPS` and filters, sorts and pages it in the browser. Replace with a list query hook, and move search / date range / sort / paging into the query params (same shape as the container page: params in, `Page<OrderSlip>` out). Keep resetting `page` to 1 on filter changes.
    - Fetching the product list in the 'create-order-slip' page
        - `src/pages/POS/orderslip/orderslip-form.tsx` — `const products = PRODUCTS`. Replace with a products query hook. Used by both the create and edit pages, and for the "Products" side card.
    - Fetching a single order slip
        - `src/pages/POS/orderslip/orderslip-detail-page.tsx` — `getOrderSlip(id)`. Replace with a query hook keyed by id; add a loading `Skeleton` and an error state.
        - `src/pages/POS/orderslip/edit-orderslip-page.tsx` — same `getOrderSlip(id)`, same change.
    - Creating an order slip
        - `src/pages/POS/orderslip/create-orderslip-page.tsx` — `useMutation({ mutationFn: createOrderSlip })`. Swap for a `useCreateOrderSlip()` hook that invalidates the order slip list on success.
    - Updating an order slip
        - `src/pages/POS/orderslip/edit-orderslip-page.tsx` — `useMutation({ mutationFn: updateOrderSlip })`. Swap for a `useUpdateOrderSlip()` hook that invalidates the list and that slip's detail key.
    - Query layer (new, follow the WMS three-layer pattern)
        - New `src/queries/pos.ts` — plain async Supabase functions: list, get by id, products, create (RPC), update (RPC). Sketches of the create/update calls are in the comments on `createOrderSlip` / `updateOrderSlip` in `orderslip-data.ts`.
        - `src/queries/useHooks.ts` — the POS query/mutation hooks and their query keys (e.g. an `["order-slips", ...]` family so one invalidation refreshes list + detail). Or a separate POS hooks file if we want to keep POS out of the WMS hooks file entirely.
    - Types
        - `src/queries/posTypes.ts` — match the real column names / select strings once the tables exist (e.g. `slipNumber` vs `slip_number`). Slip `id`, `slipNumber` and `totalAmount` should come from the backend, not the client.
    - Delete the mock data file
        - `src/pages/POS/orderslip/orderslip-data.ts` — delete once nothing imports it. Before deleting, move `lineAmount` (still used by `orderslip-detail-page.tsx`) into `src/pages/POS/type-format/format.ts`.
2. Clarify the requirements/specifications for the summary page
3. Decrement stocks from the products table when adding new order-slips
    - Backend (in the same transaction as the slip write):
        - Create: decrement each product's stock by its line quantity.
        - Update: add back the slip's old line quantities, then decrement by the new ones (a removed line returns its stock, a new line takes it).
        - Re-check stock and reject the save if any product would go negative; the form's check is only as fresh as the page.
    - `src/pages/POS/orderslip/orderslip-form.tsx` — the "N in stock" limit in `ItemFormFields` currently checks against the product's stock only. Once stock is deducted on save, editing a slip must allow current stock + the quantity already on that slip, otherwise a slip that took the last sacks flags its own lines as over stock.
    - `src/pages/POS/orderslip/orderslip-data.ts` — the mock never deducts stock (see the TODO above `toMockItems`); goes away with the mock file.
4. Rules and prep work outside the pages
    - Enforce on the backend, not just in the UI:
        - Paid order slips can't be edited. The UI gate is `canEditOrderSlip` in `src/pages/POS/type-format/format.ts` (used by `orderslip-actions.tsx` and `edit-orderslip-page.tsx`), but the update RPC must refuse paid slips too.
        - RLS policies for the POS tables for the `pos_admin` role.
    - Roles / auth
        - `src/common/components/sidebar/nav-items.tsx` — the Order Slips entry is set to `pos_admin`; confirm this matches the real roles/RLS.
        - `src/utils/dev-auth-bypass.ts` — `MOCK_PROFILE` is set to `pos_admin` for testing POS. Remove the bypass (this file plus every line tagged `DEV AUTH BYPASS`) once real login works.
    - Known UI issue
        - `create-orderslip-page.tsx` / `edit-orderslip-page.tsx` — the "Order slip created/updated" success toast likely never shows, because the page that renders it unmounts on `navigate`. Same issue exists on the WMS create-shipment page.

## Files to revisit, at a glance

| File | What changes |
|---|---|
| `src/pages/POS/orderslip/orderslip-page.tsx` | List query hook; server-side filter/sort/paging (1) |
| `src/pages/POS/orderslip/orderslip-detail-page.tsx` | Slip query hook, loading/error states; `lineAmount` import (1) |
| `src/pages/POS/orderslip/create-orderslip-page.tsx` | `useCreateOrderSlip()` hook (1); success toast (4) |
| `src/pages/POS/orderslip/edit-orderslip-page.tsx` | Slip query hook + `useUpdateOrderSlip()` hook (1); success toast (4) |
| `src/pages/POS/orderslip/orderslip-form.tsx` | Products query hook (1); edit-mode stock limit (3) |
| `src/pages/POS/orderslip/orderslip-data.ts` | Delete (1, 3) |
| `src/pages/POS/type-format/format.ts` | Receives `lineAmount` (1) |
| `src/queries/posTypes.ts` | Match real schema (1) |
| `src/queries/pos.ts` (new) | Supabase functions / RPC calls (1) |
| `src/queries/useHooks.ts` | POS hooks and query keys (1) |
| `src/common/components/sidebar/nav-items.tsx` | Confirm role (4) |
| `src/utils/dev-auth-bypass.ts` | Remove bypass (4) |

Not expected to need changes: `orderslip-table.tsx`, `orderslip-actions.tsx`, `create-orderslip-table.tsx` — they only render the `OrderSlip` / `Product` shapes they're given.
