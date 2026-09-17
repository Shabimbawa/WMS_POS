# WMS — Frontend

> **The local backend is now connected.** The Node.js/PostgreSQL
> architecture and phased rollout are documented in
> **[BACKEND_PLAN.md](./BACKEND_PLAN.md)**. The runnable Fastify/Drizzle package
> is under **[server/](./server/README.md)**. The frontend now uses `/api/v1`;
> Supabase and the POS mock store have been removed.

Warehouse management for a rice importer, replacing the paper notebooks that
track packing lists, container arrivals, unloading and stock.

This is the React client. The local API and database are documented in
**[BACKEND_PLAN.md](./BACKEND_PLAN.md)** and **[server/README.md](./server/README.md)**.
`SUPABASEREADME.md` remains as history for the original MVP domain model.

---

## Stack

| | |
|---|---|
| Build | Vite, TypeScript |
| UI | React 19, antd 6, `@ant-design/icons` |
| Tables | `@tanstack/react-table` rendered through antd `Table` (see `DataTable`) |
| Data | `@tanstack/react-query` over the local REST API |
| Routing | `react-router-dom` 7 |

## Getting started

```bash
cp .env.example .env     # fill in the two values below
npm install
npm run dev
```

| variable | |
|---|---|
| `VITE_API_BASE_URL` | API prefix; defaults to `/api/v1` |

You need a user with a `warehouse_admin` row in `profiles`. The first one has
to be inserted from the SQL editor — see *Bootstrap* in the backend README.

| script | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | eslint |

---

## Project structure

```
src/
  main.tsx                    routes
  queries/
    types.ts                  row shapes and API inputs
    warehouse.ts / pos.ts     plain async REST calls, no React
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
- **Queries are layered**: `warehouse.ts` / `pos.ts` (REST) → `useHooks.ts`
  (React Query) → pages. Pages never call `fetch` directly.
- **Query keys are hierarchical** so one invalidation covers a family:

  | key prefix | covers |
  |---|---|
  | `["notebook"]` | shipment list, single container |
  | `["discrepancies"]` | variance, open questions, open-question count |
  | `["stock"]` | stock status |

  Mutations only invalidate; all quantity logic lives in API transactions.
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
- This is UX and defence in depth only. **API role checks are the access control.**

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

- **Closing open questions in the UI.** The API supports resolution, but the
  discrepancies page does not yet expose the action.
- **Recount.** `unload_container`'s `p_allow_recount` isn't exposed; an
  unloaded container has no actions.
- **Viewing past discrepancies per container.** Logged issues are only
  visible in aggregate (variance count) or for `OTHER`; there's no
  per-container discrepancy detail for unloaded containers.
- **Editing a registered shipment.** Shipments, containers and items can
  only be created, not edited or deleted after submit.
- **Product and supplier management.** No screens for adding products,
  assigning notebook codes, setting selling prices or `is_available`, or
  managing suppliers. Currently done directly in the local database.
- **Multiple issues per line.** Deliberately limited to one per product on
  the resolve page.

### Housekeeping

- `npm run build` passes. Vite currently recommends route-level code splitting
  because the main production bundle is large.
  `npx vite build` alone succeeds.
- `npm run lint` reports `no-explicit-any` on the `ColumnDef<Row, any>`
  pattern and `react-refresh/only-export-components` on table files that
  export column arrays or helpers.
- Vite template leftovers: `App.tsx`, `App.css`, `src/assets/`.
- `src/db/db.sql` is a context-only schema dump and
  `src/queries/notebook-view.sql` belongs with the backend SQL files.
- Several pages still `console.log` their query data.
- No tests.
