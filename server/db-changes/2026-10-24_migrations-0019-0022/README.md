# Migrations 0019–0022 on the team database (2026-10-24)

## Status

**Applied 2026-10-24 14:31 PST** with `npm run db:migrate`, by Claude Code
at Eduardo Cortes's request.

Checked afterwards:
- 23 migration records, the newest `created_at = 1792550000001` (0022).
- Both no-negative rules are gone, and `shipment.notes` is dropped.
- The enum includes `SHIPMENT_REVERSAL`.
- The data is unchanged (70 movements, 16,903 sacks), so the backup was
  still identical to the live data at that moment.

## Why

The team database (`DATABASE_URL` in `server/.env`, the hosted PostgreSQL
18.6 on Coolify) had migrations only up to `0018_audit_log`. Its
`drizzle.__drizzle_migrations` table had 19 rows, the newest
`created_at = 1792140000000`. Without 0019–0022, every action that takes
stock back out of a container fails with "An unexpected error occurred":

- Move back → undo unload on a container
- Deleting a shipment
- Editing a shipment that has an unloaded container

These actions fail because the old `stock_balance_nonnegative` rule rejects
the movement, and `SHIPMENT_REVERSAL` is not a known movement type.

## What the migrations change

| Migration | Change | Data affected |
|---|---|---|
| `0019_allow_audited_negative_stock` | Drops `stock_balance_nonnegative` and `stock_movement_balance_nonnegative`. Negative stock is then only possible after the user confirms the "Inventory will become negative" prompt. | None |
| `0020_container_notes` | Drops `shipment.notes`. Notes live on `container.notes`. | None: 0 shipments had notes |
| `0021_shipment_reversal_type` | Adds `SHIPMENT_REVERSAL` to the `stock_movement_type` enum | None |
| `0022_shipment_reversal_source` | Replaces `stock_movement_source_ck` so reversal movements are allowed, and unload movements can lose their container when a shipment is hard-deleted | None |

## State before the migrations (recorded 2026-10-24)

```
CONSTRAINT stock_balance  stock_balance_nonnegative:          CHECK ((remaining_qty >= 0))
CONSTRAINT stock_movement stock_movement_balance_nonnegative: CHECK ((balance_after >= 0))
CONSTRAINT stock_movement stock_movement_source_ck:           (old definition, copied verbatim into rollback.sql)
COLUMN     shipment.notes: text, nullable, no default, position 5 (all values empty)
ENUM       stock_movement_type: OPENING_BALANCE, INBOUND_UNLOAD, OUTBOUND_ORDER,
           ORDER_REVERSAL, MANUAL_ADJUSTMENT, INBOUND_LOCAL, LOCAL_REVERSAL
MIGRATIONS 19 rows, latest created_at 1792140000000 (0018)
DATA       70 stock movements, 87 stock balances (none negative, total 16,903 sacks),
           13 shipments, 74 containers
```

## Backup

A full `pg_dump` of the team database, taken just before the change, is kept
**outside the repo** because it contains business data:

```
~/Documents/Redan/WMS_POS-backups/wms_pos_before_0019-0022_2026-10-24.dump
```

I checked that it restores cleanly into an empty PostgreSQL 18 database.

## How to reverse

### Option A: rollback script (keeps all data written since)

```bash
cd server/db-changes/2026-10-24_migrations-0019-0022
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f rollback.sql
```

It runs in one transaction. It restores the two no-negative rules, the old
source rule and the enum without `SHIPMENT_REVERSAL`. It re-adds an empty
`shipment.notes` and deletes the four migration records, so
`npm run db:migrate` would apply them again. The only difference from
before is that `shipment.notes` comes back as the last column instead of
the fifth.

Note: the app code expects the migrated schema, so after rolling back,
undo unload, shipment delete and recounting shipment edits fail again.

### If the rollback refuses

The script aborts without changing anything if data written after the
migration breaks the old rules. It prints counts for each case:

- **SHIPMENT_REVERSAL movements**: an undone unload, a deleted shipment or
  a recounted shipment edit has happened since. The old schema has no way
  to store these.
- **Unload movements without a container**: a shipment was hard-deleted.
- **Negative balances**: someone confirmed a change that made stock
  negative.

Each of these is a real business event recorded since the migration, so
rolling back means deciding what to do with it first. Either keep the
migration, or use Option B.

### Option B: restore the backup (loses everything written since)

This replaces the whole database with the pre-migration copy. Every
shipment, unload, order slip and stock change made after the backup is
lost. Stop the API first, then:

```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" \
  ~/Documents/Redan/WMS_POS-backups/wms_pos_before_0019-0022_2026-10-24.dump
```

## Rehearsal (done on a throwaway local copy of the backup, 2026-10-24)

1. Restored the backup locally. 19 migrations, schema snapshot A.
2. `npm run db:migrate` applied 0019–0022. The schema diff showed only the
   changes listed above.
3. `rollback.sql` succeeded. The schema matched A except for the position
   of `shipment.notes`, the migration records matched exactly, and the
   data was unchanged.
4. `npm run db:migrate` applied all four again cleanly.
5. On a migrated copy, undo unload of TIIU240772-5 worked: a −540
   `SHIPMENT_REVERSAL` was written, the container went back to Delivered,
   re-unloading restored the balance, and Edit dates moved only the latest
   unload. `rollback.sql` then refused with "1 SHIPMENT_REVERSAL
   movements" and changed nothing.
