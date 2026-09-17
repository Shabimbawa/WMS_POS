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

## Current boundary

The API, database schema, migration, authentication, inbound shipment/unload
flow, discrepancy reports, ledger-backed stock, manual adjustments, and POS
order-slip flow are implemented. The React client still calls Supabase and the
POS pages still use mock data; switching `src/queries` to this REST API is the
next phase and is intentionally separate so frontend work is not disrupted.

Supplier/product seed rows are not included because the SQL seed files named
in `SUPABASEREADME.md` are absent from this repository. Export those rows from
the existing Supabase project instead of reconstructing unconfirmed notebook
transcriptions.

