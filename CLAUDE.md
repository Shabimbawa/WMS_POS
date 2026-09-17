# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Warehouse/POS system for a rice importer: packing lists → containers → unloading → stock → order slips. The local backend is Node.js/Fastify/Drizzle/PostgreSQL under `server/`; `BACKEND_PLAN.md` is the architecture contract. `SUPABASEREADME.md` is retained only as history for the replaced Supabase MVP.

## Commands

```bash
npm run dev                              # Vite dev server
npm run dev:server                       # local API server
npx tsc --noEmit -p tsconfig.app.json    # type check
npm run build                            # type check + production build
npm run lint                             # eslint
```

- `npm run build` passes. Vite reports a large-chunk warning; route-level code splitting is future housekeeping.
- Lint baseline: `no-explicit-any` (from the `ColumnDef<Row, any>` pattern) and `react-refresh/only-export-components` on table files. Both are expected.
- There are no tests.
- Frontend env: `VITE_API_BASE_URL=/api/v1`. Vite proxies `/api` to the local server on port 3000.
- Backend env and setup are documented in `server/README.md`.

## Architecture

### Data layer (`src/queries/`)
Three layers. Pages never call `fetch` directly.
1. `types.ts` and `posTypes.ts` hold row shapes, list params, and mutation inputs. Keep them matched to API responses.
2. `warehouse.ts`, `pos.ts`, and `auth.ts` hold plain async REST functions over `utils/api-client.ts`, with no React.
3. `useHooks.ts` holds React Query hooks and the `qk` key factory. Keys are hierarchical, so invalidating a prefix refreshes a whole family:
   - `["notebook", ...]`: shipment list and single container
   - `["discrepancies", ...]`: variance, open questions and their count
   - `["stock", ...]`

**Mutations go through transactional API endpoints:**
- Shipment creation, unloading, container transitions, stock movement, and order-slip revisions hold all business logic server-side. The client only builds payloads and invalidates keys.

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
- Warehouse pages require `warehouse_admin`; order-slip pages require `pos_admin`.
- The client-side guard is UX only. Backend session and role checks are the real boundary.

### UI conventions
- Pages live in `pages/WMS/<area>/`, split into `*-page.tsx` (state, filters, queries, layout) and `*-table.tsx` (TanStack column defs rendered through `DataTable`).
- **Tables:** every table uses `common/items/table/table.tsx` (`DataTable`). It takes TanStack `ColumnDef`s and renders them with antd `Table`. It supports `meta: { fixed }` for pinned columns and `renderExpanded` for nested rows. Hooks can't be called in a column def, so render a component from `cell` when a cell needs state or mutations (see `container/container-actions.tsx`).
- **Forms:** add and edit forms use `common/items/modal/modal.tsx` (`CommonModalForm`). It renders its own trigger button. `children` can be a function of the form, which is useful with `Form.useWatch` for conditional fields.
- **Errors:** `ErrorNotificationPopup()` returns `{ showError, contextHolder }`. Render the holder.
- **Formatting:** `pages/WMS/type-format/format.ts` holds shared formatting. Always label products with `fmtProduct`, which drops the code when a product has none. `STATUS_LABEL`/`STATUS_COLOR` and `REASON_LABEL`/`REASON_COLOR` cover statuses and discrepancy reasons.
- **Draft pages:** `create-shipment-page.tsx` and `resolve-discrepancy-page.tsx` build their payload in local state, with client keys stripped before submit. Both show a "Registered products" reference card on the right, beside a `flex: 1` main column.
- List pages reset `page` to 1 on any filter change and use `placeholderData: keepPreviousData`.
