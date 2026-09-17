# WMS — Frontend

Warehouse management for a rice importer, replacing the paper notebooks that
track packing lists, container arrivals, unloading and stock.

This is the React client. The database, RPCs, triggers, views and RLS are
documented in **[SUPABASEREADME.md](./SUPABASEREADME.md)** — read that first
for the domain model (shipment → container → items, declared vs counted,
discrepancies). This file covers what the UI does with it.

---

## Stack

| | |
|---|---|
| Build | Vite, TypeScript |
| UI | React 19, antd 6, `@ant-design/icons` |
| Tables | `@tanstack/react-table` rendered through antd `Table` (see `DataTable`) |
| Data | `@tanstack/react-query` over `@supabase/supabase-js` |
| Routing | `react-router-dom` 7 |

## Getting started

```bash
cp .env.example .env     # fill in the two values below
npm install
npm run dev
```

| variable | |
|---|---|
| `VITE_SUPABASE_URL` | project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key — RLS is the real boundary |

You need a user with a `warehouse_admin` row in `profiles`. The first one has
to be inserted from the SQL editor — see *Bootstrap* in the backend README.

| script | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | `tsc -b && vite build` — currently fails on the type check, see [Housekeeping](#housekeeping) |
| `npm run lint` | eslint |

---

## Project structure

```
src/
  main.tsx                    routes
  queries/
    types.ts                  row shapes, params, RPC inputs
    warehouse.ts              plain async Supabase calls, no React
    useHooks.ts               React Query hooks + query keys
  common/
    components/
      app-layout/             auth + role guard, header, sidebar, <Outlet/>
      sidebar/nav-items.tsx   single source of truth for pages and roles
      topbar/                 sign out, theme toggle
    items/                    shared primitives: DataTable, CommonModalForm,
                              ErrorNotificationPopup, AppCard, Pill
    utils/                    DateParser, confirmDiscardChanges
  pages/
    login/                    login page, profile / role lookup
    WMS/
      container/              shipments, register, unload, discrepancies
      stock/                  stock status
      type-format/format.ts   fmtMoney, fmtInt, fmtProduct, status/reason labels + colours
```

### Conventions

- **`-page.tsx` / `-table.tsx`.** A page owns state, filters, queries and
  layout. Its table file owns column definitions and renders `DataTable`.
- **Every table is `DataTable`** (`common/items/table/table.tsx`) — TanStack
  column defs, antd rendering. Supports `meta.fixed` for pinned columns and
  `renderExpanded` for nested rows.
- **Add/edit forms use `CommonModalForm`** (`common/items/modal/modal.tsx`),
  which brings its own trigger button, validation and discard-changes guard.
- **Queries are layered**: `warehouse.ts` (Supabase) → `useHooks.ts`
  (React Query) → pages. Pages never import `supabase` directly.
- **Query keys are hierarchical** so one invalidation covers a family:

  | key prefix | covers |
  |---|---|
  | `["notebook"]` | shipment list, single container |
  | `["discrepancies"]` | variance, open questions, open-question count |
  | `["stock"]` | stock status |

  Mutations only invalidate; all quantity logic lives in the RPCs.
- **One product label everywhere**: `fmtProduct` → `G · Ganador 50kg`, or
  `Brand Variety 50kg` when the product has no notebook code yet.

---

## Auth and roles

- `AppLayout` redirects to `/` without a session, and redirects off any route
  the signed-in role doesn't own.
- Ownership comes from `NAV_ITEMS` in `nav-items.tsx`. A route not claimed
  there is denied. Nested routes are claimed by prefix, so `/containers/...`
  all belong to the Shipments entry.
- After login the user lands on the first nav item their role can see.
- This is UX and defence in depth only. **RLS is the access control.**

| route | page | role |
|---|---|---|
| `/` | Login | public |
| `/containers` | Shipments | `warehouse_admin` |
| `/containers/items` | Register shipment | `warehouse_admin` |
| `/containers/:containerId/unload` | Resolve discrepancies | `warehouse_admin` |
| `/containers/discrepancies` | Discrepancies | `warehouse_admin` |
| `/stock` | Stock status | `warehouse_admin` |

---

## User flow

```
Login
  └── Shipments (/containers)
        ├── Register Shipment ──────────► /containers/items ──submit──┐
        │                                                             │
        ├── expand a shipment → container rows ◄──────────────────────┘
        │     ├── Update status   DOCUMENTED / AT PORT / DELIVERED / CANCELLED
        │     └── Unload (DELIVERED only) → "Any discrepancies?"
        │           ├── No, all matched → unload_container([])
        │           └── Yes, resolve ──► /containers/:id/unload ──submit──┐
        │                                                                 │
        └── View discrepancies (badge = open questions) ◄─────────────────┘
              ├── Variance
              └── Open questions
Stock (/stock)
```

### 1. Shipments — `/containers`

The packing-list notebook. One row per shipment: list received date,
supplier, container count, container numbers (coloured by status), products,
total sacks, and how many containers are unloaded.

- Filters: supplier, list-received date range, newest/oldest. Paged
  server-side.
- **Expand a row** to see its containers: number, status, products, sacks,
  delivered and unloaded dates, and an actions column.
- Top right: **Refresh**, **View discrepancies** (badged with the open-question
  count), **Register Shipment**.

### 2. Register a shipment — `/containers/items`

Builds a whole packing list locally, then submits it as one
`create_shipment` call.

1. Fill in the packing list: supplier (required), date list received
   (defaults to today), reference (optional).
2. **Add New Container** (below the list) → container no. (optional, blank
   for truck loads with no box) and "own truck" toggle.
3. On each container card, **Add New Item** (card header) → product, sacks,
   price per sack (optional). The same product can't appear twice in one
   container.
4. Containers and items can be edited or removed until submit.
5. **Submit** is enabled once a supplier is chosen and every container has
   at least one item. On success you're returned to Shipments.

The right-hand panel lists every registered product (brand, variety, size)
for reference. Items are always sent as `product_category_id`, never as
`code` + `size_kg`, so products without a notebook code still work.

### 3. Advance a container — actions column

- **Update status** — modal offering every status except `UNLOADED`.
  Choosing `DELIVERED` requires a delivery date. Hidden once unloaded.
- **Unload** — enabled only for `DELIVERED` containers (tooltip otherwise).
  A popconfirm asks *"Any discrepancies?"* with an unload date picker
  (not before the delivery date):
  - **No, all matched** → `unload_container` with `[]`. Every line's
    counted qty becomes its declared qty, `items_match = true`.
  - **Yes, resolve** → opens the resolve page with that date.
  - Clicking outside only closes the popconfirm; neither path fires.

### 4. Resolve discrepancies — `/containers/:containerId/unload`

One container, same card layout as registration.

- Every declared line starts as **Matched**.
- **Log issue** on a line:

  | reason | needs | note |
  |---|---|---|
  | Short | counted qty, below declared | optional |
  | Over | counted qty, above declared | optional |
  | Damaged | counted qty | optional |
  | Other | — | required, changes nothing |

- **Add unlisted item** (card header) → product not already on the
  container, counted qty, optional note. Sent as `UNDECLARED`.
- One issue per line. Issues can be edited or cleared before submit.
- Footer shows issues logged, declared, actual and variance totals.
- **Submit unload** sends the date and the logged issues to
  `unload_container`, then invalidates shipments, stock and discrepancies.
- A container that isn't `DELIVERED` (e.g. an old link) shows a warning
  instead of the form.

### 5. Discrepancies — `/containers/discrepancies`

Toggle between the two backend views:

- **Variance** (`v_container_variance`) — declared vs actual sacks per
  container, variance (negative = shortfall), items match, issue count.
  Always filtered to `UNLOADED` so pending containers don't read as total
  losses. "Mismatches only" hides containers with zero variance.
- **Open questions** (`v_open_questions`) — every `OTHER` issue: when,
  container, supplier, product, note.

### 6. Stock — `/stock`

Read-only on-hand quantities per product: availability, sacks, tonnage,
selling price, value, last updated. Filters: brand, hide zero stock,
available only, updated date range, sort.

A price on an unavailable product is shown dimmed and excluded from value —
`is_available` is the only availability signal.

---

## Not yet implemented

### Features

- **Dispatch / outbound.** Nothing records what leaves the warehouse — the
  backend is inbound-only (see *Known gaps* in the backend README).
- **Stock movement and ledger.** `unload_container` doesn't write
  `stock_status`, so the Stock page won't change after an unload. The UI has
  no way to adjust stock either (`useUpdateStockStatus` exists but is unused).
  Blocked on a backend decision about a stock ledger.
- **Closing open questions.** No `resolved_at` in the schema, so the list and
  its badge only grow. There is no "re-log under a real reason" flow.
- **Recount.** `unload_container`'s `p_allow_recount` isn't exposed; an
  unloaded container has no actions.
- **Viewing past discrepancies per container.** Logged issues are only
  visible in aggregate (variance count) or for `OTHER`; there's no
  per-container discrepancy detail for unloaded containers.
- **Editing a registered shipment.** Shipments, containers and items can
  only be created, not edited or deleted after submit.
- **Product and supplier management.** No screens for adding products,
  assigning notebook codes, setting selling prices or `is_available`, or
  managing suppliers. Currently done in the Supabase dashboard.
- **`pos_admin` role.** Exists in `ProfileRole` but has no pages; the
  `pages/POS/` folder is empty.
- **Port date.** `ARRIVED_AT_PORT` has no date column, so the UI can't
  capture one.
- **Multiple issues per line.** Deliberately limited to one per product on
  the resolve page.

### Diverges from the backend

- **Status changes bypass the RPCs.** *Update status* patches the
  `container` row directly (`updateContainerStatus` in `warehouse.ts`). The
  backend provides `mark_container_at_port`, `mark_container_delivered` and
  `cancel_container`, which carry the guards (e.g. can't cancel an unloaded
  container, CHECK-safe dates). Should be switched over; the UI also allows
  moving *back* to DOCUMENTED, which those RPCs don't model.
- **Sorting across joins.** Stock sorted by brand, size or price only sorts
  the embedded product, not the rows. `v_container_notebook` /
  a similar flattened view would fix it; it isn't used.

### Housekeeping

- `npm run build` fails at `tsc -b` on two errors unrelated to the WMS pages:
  an unused `location` in `app-layout.tsx`, and `popconfirm.tsx` importing
  `lucide-react`, which isn't installed. Because of the latter, the shared
  `ConfirmDeleteButton` isn't used — pages use antd `Popconfirm` directly.
  `npx vite build` alone succeeds.
- `npm run lint` reports `no-explicit-any` on the `ColumnDef<Row, any>`
  pattern and `react-refresh/only-export-components` on table files that
  export column arrays or helpers.
- Vite template leftovers: `App.tsx`, `App.css`, `src/assets/`.
- `src/db/db.sql` is a context-only schema dump and
  `src/queries/notebook-view.sql` belongs with the backend SQL files.
- Several pages still `console.log` their query data.
- No tests.
