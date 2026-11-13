# Migrations 0023–0024 on the team database (2026-11-05)

## Status

**Not applied yet.** Prepared and rehearsed 2026-11-05; waiting for approval.

## Why

- `0024_product_size_optional`: the client asked for the sack size to be
  optional when adding a product. A product can be added without a size and
  given one later, once.
- `0023_container_item_allow_duplicates`: already in the code (a container
  may list the same product on several lines, e.g. at two prices) but never
  applied to the team database. `npm run db:migrate` applies both together.

## What the migrations change

| Migration | Change | Data affected |
|---|---|---|
| `0023_container_item_allow_duplicates` | Drops the unique index `container_item_product_uq` (one line per product per container) and adds a plain index `container_item_container_idx` on `container_id` | None |
| `0024_product_size_optional` | `product_category.size_kg` becomes nullable. `product_category_identity_uq` uses `coalesce(size_kg, 0)` so there is at most one sizeless product per brand + variety. The `size_kg > 0` check stays. | None: all 90 products have a size |

## State before the migrations (recorded 2026-11-05)

```
MIGRATIONS 23 rows, latest created_at 1792550000001 (0022)
COLUMN     product_category.size_kg: numeric(10,3) NOT NULL
INDEX      product_category_identity_uq: UNIQUE (lower(brand), lower(COALESCE(variety, ''::text)), size_kg)
INDEX      container_item_product_uq:   UNIQUE (container_id, product_category_id)
DATA       90 products (none without a size), 0 containers listing a product twice,
           90 stock balances (33,756 sacks), 153 stock movements
```

## Backup

A full `pg_dump` taken just before the change, kept **outside the repo**:

```
~/Documents/Redan/WMS_POS-backups/wms_pos_before_0023-0024_2026-11-05.dump
```

It restores cleanly into an empty PostgreSQL 18 database (done for the rehearsal).

## How to apply

```bash
cd server
npm run db:migrate
```

Postgres prints some "already exists, skipping" notices. They're expected.

## How to reverse

### Option A: rollback script (keeps all data written since)

```bash
cd server/db-changes/2026-11-05_migrations-0023-0024
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f rollback.sql
```

It runs in one transaction. It makes `size_kg` required again with the old
identity index, restores `container_item_product_uq`, drops
`container_item_container_idx` and deletes the two migration records. The
result is identical to the state before the migrations.

The app code expects the migrated schema, so after rolling back, adding a
product without a size fails, and so does registering a product twice on one
container.

### If the rollback refuses

It aborts without changing anything when data written since breaks the old
rules, and it prints counts:

- **Products without a size**: give them a size (Stock › Edit product) first.
- **Containers listing a product twice**: merge or remove the extra lines first.

Or use Option B.

### Option B: restore the backup (loses everything written since)

Stop the API first, then:

```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$DATABASE_URL" \
  ~/Documents/Redan/WMS_POS-backups/wms_pos_before_0023-0024_2026-11-05.dump
```

## Rehearsal (throwaway local copy of the backup, 2026-11-05)

1. Restored the backup: 23 migrations, schema snapshot A.
2. `npm run db:migrate` applied 0023 and 0024. The schema diff showed only
   the changes listed above.
3. On the migrated copy:
   - "ZZ Test Orange" with no size was created.
   - A second one, in any letter case, got `PRODUCT_EXISTS`.
   - "ZZ Test Orange 25kg" was created alongside it.
   - Filling in size 25 got `PRODUCT_EXISTS`. Filling in 10 worked. Changing
     it to 5 afterwards got `PRODUCT_SIZE_FIXED`.
   - The stock list sorted the sizeless product last both ways, and the
     report endpoints responded normally.
   - `rollback.sql` refused with "1 products without a size" and changed
     nothing.
4. On a fresh copy, migrate followed by `rollback.sql` gave a schema
   identical to A, identical migration records and unchanged data.
   `npm run db:migrate` then applied both again cleanly.
