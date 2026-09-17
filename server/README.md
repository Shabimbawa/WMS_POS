# WMS/POS local API

The backend is a Node.js, TypeScript, Fastify, Drizzle ORM, and PostgreSQL
service. Its design and rollout plan are in [`../BACKEND_PLAN.md`](../BACKEND_PLAN.md).

## Prerequisites

- Node.js 22 or newer
- PostgreSQL 16 or newer
- A PostgreSQL role and empty database for this application

Example database bootstrap, run as a PostgreSQL administrator:

```sql
create role wms_pos login password 'replace-this-password';
create database wms_pos owner wms_pos;
```

Keep PostgreSQL bound to localhost when the API and database run on the same
machine. LAN browsers connect to the API, not directly to PostgreSQL.

## Setup

```powershell
cd server
Copy-Item .env.example .env
npm.cmd install
npm.cmd run db:migrate
npm.cmd run admin:create -- admin@example.local "a-long-password" warehouse_admin
npm.cmd run dev
```

Set the real database password in `DATABASE_URL`. For frontend development,
leave `HOST=127.0.0.1`. To accept connections from other LAN computers, use
`HOST=0.0.0.0` and restrict the Windows Firewall rule to the private subnet.

`SESSION_COOKIE_SECURE=false` is required for plain HTTP on a trusted local
network. Set it to `true` when the API is served through local HTTPS.

The health check is `GET http://127.0.0.1:3000/api/v1/health`.

When using Command Prompt, run the same commands as `npm ...`; the `.cmd`
suffix is only needed when PowerShell execution policy prevents its `npm.ps1`
wrapper from running.

## Commands

| Command | Purpose |
|---|---|
| `npm.cmd run dev` | Watch-mode API server |
| `npm.cmd run typecheck` | Type-check without output |
| `npm.cmd run build` | Compile to `dist/` |
| `npm.cmd start` | Run compiled server |
| `npm.cmd run db:generate` | Generate migration after a schema change |
| `npm.cmd run db:migrate` | Apply pending migrations |
| `npm.cmd run admin:create -- <email> <password> [role]` | Create a local user |

The allowed roles are `warehouse_admin` and `pos_admin`.

## Temporary Coolify deployment

Create a second Coolify application from the same repository with these
settings:

| Setting | Value |
|---|---|
| Build pack | Railpack |
| Output type | Web application |
| Base directory | `/server` |
| Port | `3000` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Start command | `npm run start` |

For the current team-test domains, configure the backend with:

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
DATABASE_URL=<secret hosted PostgreSQL URL>
SESSION_COOKIE_NAME=wms_session
SESSION_TTL_HOURS=12
SESSION_COOKIE_SECURE=true
VITE_DEV_ORIGIN=https://wms.redantech.com
```

Expose the application as `https://wms-api.redantech.com` and configure its
health check as `/api/v1/health`. The frontend build variable must be:

```env
VITE_API_BASE_URL=https://wms-api.redantech.com/api/v1
```

The `https://` prefix is required; without it the browser treats the API host
as a path under the frontend domain. Because Vite embeds environment variables
at build time, rebuild the frontend after changing this value.

`NODE_ENV=development` is a temporary deployment constraint: the current API
registers cross-origin access only outside production. Before treating this as
a production internet deployment, make allowed origins independently
configurable and run the backend with `NODE_ENV=production`.

Never expose `DATABASE_URL` to the frontend or commit it. Rotate any database
credential that has appeared in logs, screenshots, chat, or source control.

## Current boundary

The API, database schema, migration, authentication, inbound shipment/unload
flow, discrepancy reports, ledger-backed stock, manual adjustments, and POS
order-slip flow are implemented. The React client now uses this API for login,
warehouse operations, stock, discrepancies, and POS order slips.

Supplier/product seed rows are not included because the SQL seed files named
in `SUPABASEREADME.md` are absent from this repository. Export those rows from
the existing Supabase project instead of reconstructing unconfirmed notebook
transcriptions.
