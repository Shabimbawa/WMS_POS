# Backend Plan and Implementation Status

This document is the implementation contract and status tracker for replacing
Supabase with a Node.js API and PostgreSQL database. The core backend and the
frontend cutover are implemented. The remaining work is operational hardening,
data migration, automated verification, and user acceptance testing.

## Goals

- Support an office-LAN deployment without depending on Supabase or another
  managed application backend.
- Support a temporary self-hosted Coolify deployment for team testing.
- Preserve the existing warehouse workflow and response shapes where useful.
- Add the POS/order-slip workflow already present in `src/pages/POS`.
- Make every multi-row business event atomic.
- Make stock auditable and reconstructable from an immutable ledger.
- Enforce authorization and business rules in the API and database, not only
  in the browser.

## Runtime topology

### Intended LAN production topology

```text
LAN browser
    |
    | HTTP (one origin)
    v
Node.js / Fastify
    |-- /api/*          REST API
    `-- /*              built Vite application (production)
           |
           v
      PostgreSQL
```

Development uses the Vite dev server and proxies `/api` to Fastify. The
intended LAN production topology is one origin, with a reverse proxy serving
the built frontend and forwarding `/api/*` to Fastify. PostgreSQL should listen
only on the backend machine unless database administration from another
trusted machine is explicitly needed.

### Current team-test topology

```text
https://wms.redantech.com          static Vite build on Coolify/Nginx
             |
             | HTTPS + credentials
             v
https://wms-api.redantech.com      Fastify on Coolify, port 3000 internally
             |
             v
       hosted PostgreSQL
```

The frontend build variable must be
`VITE_API_BASE_URL=https://wms-api.redantech.com/api/v1`. The API must bind to
`0.0.0.0`, allow the exact frontend origin, and use secure session cookies.
With the current implementation, CORS is registered only outside production,
so this test deployment temporarily uses `NODE_ENV=development`. Moving CORS
configuration out of that condition is an operations task before declaring
the hosted setup production-ready.

LAN-only does not mean authentication-free. The application uses opaque,
database-backed sessions in an `HttpOnly`, `SameSite=Lax` cookie. Passwords are
hashed with Node's built-in `scrypt`, so deployment does not depend on a native
password-hashing package.

## Chosen stack

- Node.js 22 LTS or newer
- TypeScript
- Fastify
- Drizzle ORM and Drizzle Kit
- PostgreSQL 16 or newer
- Zod request validation
- Vitest for unit/integration tests

The backend lives in `server/` as a separate package. Keeping the package
boundary explicit prevents backend-only libraries from entering the Vite
bundle and lets the frontend team work independently.

## Domain model

The Supabase tables are retained in normalized form:

```text
supplier -> shipment -> container -> container_item
                               `----> container_discrepancy

product_category -> container_item
                 -> order_slip_item -> order_slip
                 -> stock_movement
                 -> stock_balance

app_user -> profile
         -> session
```

Intentional changes from the Supabase draft:

1. `stock_movement` is the inventory source of truth. Every unload, order-slip
   save/revision, or authorized manual correction creates immutable movements.
2. `stock_balance` is a transactionally maintained read model for fast lists.
   It must equal the sum of movements and is never directly editable.
3. `selling_price` exists only on `product_category`; the duplicate field from
   the old `stock_status` dump is removed.
4. Containers include `date_arrived_at_port` so the port event is not lost.
5. Open questions can be closed with `resolved_at`, `resolved_by`, and a
   resolution note.
6. Order-slip items store a unit-price snapshot. Historical totals therefore
   do not change when the current product price changes.
7. Names use snake_case in PostgreSQL and camelCase at the HTTP boundary.

## Transaction boundaries and invariants

### Create shipment

One transaction creates the shipment, every container, and every declared
item. A product may occur only once per container. A failure rolls back the
whole packing list.

### Advance container

Allowed transitions are:

```text
DOCUMENTED -> ARRIVED_AT_PORT -> DELIVERED -> UNLOADED
DOCUMENTED --------------------> DELIVERED -> UNLOADED
DOCUMENTED / ARRIVED_AT_PORT / DELIVERED -> CANCELLED
```

`UNLOADED` can only be reached through the unload operation. Dates and status
are changed together while the container row is locked.

### Unload container

One transaction locks the container and its item rows, validates every issue,
sets actual quantities, records discrepancies, changes status to `UNLOADED`,
and posts one positive stock movement per actual product quantity. Repeating
the request cannot add stock twice. Recount is deliberately excluded from the
first release; it needs an explicit reversal workflow.

The existing UI contract for `DAMAGED` is preserved for the first integration:
`actual_qty` is the usable counted quantity. A later UI may add a separate
physical damaged quantity without changing the ledger model.

### Create/update order slip

The API locks all affected product balances in stable product-id order,
re-checks availability and price, computes totals server-side, and prevents a
negative balance. Creating a slip posts negative stock movements. Updating an
editable slip posts a reversal batch for its previous revision and a new
outbound batch, all in one transaction. Paid slips are immutable.

Payment status is accounting metadata; stock moves when the order slip is
saved because the current UI treats a slip as the outbound event. If the real
business distinguishes order entry from physical dispatch, add a separate
`DISPATCHED` state before rollout rather than silently changing this rule.

### Manual correction

Only a warehouse administrator can create a signed adjustment with a required
reason. There is no endpoint that sets a balance directly.

## REST surface

All routes are below `/api/v1`.

| Method and path | Role | Purpose |
|---|---|---|
| `POST /auth/login` | public | Start a session |
| `POST /auth/logout` | signed in | End the current session |
| `GET /auth/me` | signed in | User and role |
| `GET /suppliers` | warehouse | Supplier choices |
| `GET /products` | warehouse/POS | Product and price choices |
| `GET /shipments` | warehouse | Filtered, paged packing lists |
| `POST /shipments` | warehouse | Atomic shipment creation |
| `GET /containers/:id` | warehouse | Unload/detail view |
| `POST /containers/:id/arrive-at-port` | warehouse | Guarded transition |
| `POST /containers/:id/deliver` | warehouse | Guarded transition |
| `POST /containers/:id/cancel` | warehouse | Guarded transition |
| `POST /containers/:id/unload` | warehouse | Count and add stock |
| `GET /discrepancies/variance` | warehouse | Paged variance report |
| `GET /discrepancies/open-questions` | warehouse | Paged unresolved queue |
| `POST /discrepancies/:id/resolve` | warehouse | Close an open question |
| `GET /stock` | warehouse/POS | Filtered balances |
| `POST /stock/adjustments` | warehouse | Audited correction |
| `GET /order-slips` | POS | Search/filter/page |
| `GET /order-slips/:id` | POS | Slip detail |
| `POST /order-slips` | POS | Create and deduct stock |
| `PUT /order-slips/:id` | POS | Revise editable slip |

List responses retain the frontend's existing `Page<T>` shape:

```json
{ "rows": [], "total": 0, "page": 1, "pageSize": 25, "pageCount": 1 }
```

Errors use a stable machine code and a human-readable message:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": {} } }
```

## Delivery status

- [x] **Foundation**: Drizzle schema and migrations, validated configuration,
  health endpoint, database-backed sessions, password hashing, role checks,
  bootstrap-admin command, structured errors, and Fastify logging.
- [x] **Inbound WMS**: supplier/product reference data, shipment listing and
  creation, guarded container transitions, atomic unload, discrepancy reports,
  open-question count, and open-question resolution endpoint.
- [x] **Inventory and POS**: ledger-backed stock balances, audited manual
  adjustments, POS product list, and transactional order-slip list/detail,
  create, and update endpoints.
- [x] **Frontend cutover**: the shared HTTP client and React Query layer use
  `/api/v1`; Supabase runtime calls and the POS mock store have been removed.
- [x] **Initial database setup**: the PostgreSQL database has been created,
  migrations have been applied, and `warehouse_admin` and `pos_admin` accounts
  can be created with `npm run admin:create`.
- [ ] **Temporary team-test deployment verification (in progress)**: frontend
  and backend are configured as separate Coolify applications with HTTPS
  domains. Complete the health, login, session-cookie, and role-flow checks
  before marking this done.
- [ ] **Production deployment hardening**: enable configurable CORS in
  production (or use one-origin reverse proxying), use an application-specific
  database role, rotate exposed credentials, and document automated deploys.
- [ ] **Data migration tooling**: import verified supplier/product and legacy
  transactional data, creating opening stock movements for imported balances.
- [ ] **Backup and recovery**: automate PostgreSQL backups, copy them to a
  second device, and complete a restore drill.
- [ ] **Automated verification**: add transaction/concurrency, authorization,
  route, and frontend tests. There is currently no automated test suite.
- [ ] **Acceptance and LAN rollout**: complete user acceptance testing, then
  configure the final LAN host, firewall, reserved address, monitoring, time
  synchronization, and UPS-backed operation.

## Go-live gates

- A second simultaneous sale cannot oversell the last sacks.
- Repeating an unload request cannot credit stock twice.
- Stock balances reconcile exactly with the movement ledger.
- A paid order slip cannot be edited through either UI or direct API calls.
- A non-admin cannot reach warehouse operations.
- Database backup and restore have been tested on a separate local instance.
- The server machine has a reserved LAN address, time synchronization, UPS,
  and an automated backup copied to another physical device.

## Data migration

Export suppliers, products, shipments, containers, items, discrepancies,
profiles, and current stock from Supabase as CSV or PostgreSQL data. Import
parent tables first. Existing balances require one `OPENING_BALANCE` movement
per product; do not copy a balance without the corresponding ledger entry.
After reconciliation, switch the frontend to the local API and make the
Supabase project read-only during the acceptance window.
