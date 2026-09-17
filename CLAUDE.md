# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

React client for a warehouse management system (rice importer) that replaces paper notebooks: packing lists → containers → unloading → stock. Backend is Supabase; the schema, RPCs, triggers, views and RLS are documented in `SUPABASEREADME.md` (the SQL files themselves are not in this repo). `README.md` has the full user flow and the list of unimplemented features.

## Commands

```bash
npm run dev                              # Vite dev server
npx tsc --noEmit -p tsconfig.app.json    # type check
npx vite build                           # production build
npm run lint                             # eslint
```

- `npm run build` (`tsc -b && vite build`) currently fails on two pre-existing type errors: an unused `location` in `common/components/app-layout/app-layout.tsx`, and `common/items/popconfirm/popconfirm.tsx` importing `lucide-react`, which isn't installed. When type-checking, treat those as baseline. Don't import `ConfirmDeleteButton`/`ConfirmActionButton`; use antd `Popconfirm` directly.
- Lint baseline: `no-explicit-any` (from the `ColumnDef<Row, any>` pattern) and `react-refresh/only-export-components` on table files. Both are expected.
- There are no tests.
- Env: `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).

## Architecture

### Data layer (`src/queries/`)
Three layers. Pages never import `supabase` directly.
1. `types.ts` holds the row shapes, list params and RPC input types. Keep them matched to the select strings.
2. `warehouse.ts` holds plain async Supabase functions with no React. Column lists (`ITEM_COLS`, `PRODUCT_LABEL_COLS`) are shared constants. Paged lists use `toRange`/`toPage`, which return `Page<T>`.
3. `useHooks.ts` holds React Query hooks and the `qk` key factory. Keys are hierarchical, so invalidating a prefix refreshes a whole family:
   - `["notebook", ...]`: shipment list and single container
   - `["discrepancies", ...]`: variance, open questions and their count
   - `["stock", ...]`

**Mutations go through RPCs:**
- `create_shipment` and `unload_container` hold all transactional and quantity logic server-side. The client only builds the payload and invalidates keys.
- Pass jsonb array arguments as plain arrays. Never `JSON.stringify` them, or `jsonb_array_elements` fails server-side.
- Exception: container status changes (`updateContainerStatus`) currently patch the `container` row directly. The backend has `mark_container_at_port` / `mark_container_delivered` / `cancel_container` RPCs that should replace it.

**Domain rules that affect UI code:**
- `container_item.qty_sacks` is declared and `actual_qty_sacks` is counted (NULL until unload). Stock follows the counted value.
- UNLOADED is only reached through `unload_container`. It is enabled only from DELIVERED.
- Discrepancy reasons:
  - SHORT, OVER and DAMAGED need `actual_qty`.
  - UNDECLARED needs `actual_qty` and creates a new line.
  - OTHER needs a `note` and writes nothing.
- Always filter `v_container_variance` to `status = 'UNLOADED'`, or pending containers read as total losses.
- `product_category.is_available` is the only availability signal. `selling_price` lives on `product_category`, not `stock_status`.
- PostgREST can't order parent rows by an embedded table's column. `order(..., { referencedTable })` only sorts the embed.

### Routing and auth
- `src/main.tsx` declares the routes.
- `common/components/sidebar/nav-items.tsx` (`NAV_ITEMS`) is the single source of truth for which role may see which path. Three things read it: the sidebar, the post-login landing redirect, and the `AppLayout` route guard.
- Nested routes are claimed by prefix. `/containers/items`, `/containers/:id/unload` and `/containers/discrepancies` all belong to the `/containers` entry.
- **A new top-level route must be registered in `NAV_ITEMS`**, otherwise the guard denies it.
- Every current page is `warehouse_admin`. `pos_admin` exists as a role but has no pages.
- The client-side guard is UX only. RLS is the real boundary.

### UI conventions
- Pages live in `pages/WMS/<area>/`, split into `*-page.tsx` (state, filters, queries, layout) and `*-table.tsx` (TanStack column defs rendered through `DataTable`).
- **Tables:** every table uses `common/items/table/table.tsx` (`DataTable`). It takes TanStack `ColumnDef`s and renders them with antd `Table`. It supports `meta: { fixed }` for pinned columns and `renderExpanded` for nested rows. Hooks can't be called in a column def, so render a component from `cell` when a cell needs state or mutations (see `container/container-actions.tsx`).
- **Forms:** add and edit forms use `common/items/modal/modal.tsx` (`CommonModalForm`). It renders its own trigger button. `children` can be a function of the form, which is useful with `Form.useWatch` for conditional fields.
- **Errors:** `ErrorNotificationPopup()` returns `{ showError, contextHolder }`. Render the holder.
- **Formatting:** `pages/WMS/type-format/format.ts` holds shared formatting. Always label products with `fmtProduct`, which drops the code when a product has none. `STATUS_LABEL`/`STATUS_COLOR` and `REASON_LABEL`/`REASON_COLOR` cover statuses and discrepancy reasons.
- **Draft pages:** `create-shipment-page.tsx` and `resolve-discrepancy-page.tsx` build their payload in local state, with client keys stripped before submit. Both show a "Registered products" reference card on the right, beside a `flex: 1` main column.
- List pages reset `page` to 1 on any filter change and use `placeholderData: keepPreviousData`.
