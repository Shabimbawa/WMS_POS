# WMS — Backend

> This file documents the temporary Supabase implementation and remains useful
> as domain history. The replacement local Node.js/PostgreSQL backend is defined
> in **[BACKEND_PLAN.md](./BACKEND_PLAN.md)** and implemented in `server/`.

Warehouse management for a rice importer, replacing four paper notebooks.
Supabase (Postgres) for the MVP, intended to migrate to Django later.

---

## The process being modelled

1. Supplier sends a packing list naming the containers and their contents
2. Containers arrive at the warehouse, usually days later, often on different days
3. Each container is opened and counted — sometimes days after arrival again
4. Stock updates **only at unload**, not on arrival

The notebooks split these across four books keyed on container number, so
nobody could answer "what did we actually receive" without cross-referencing
by hand. That reconciliation is what this schema replaces.

---

## Tables

```
supplier
  └── shipment                  one packing list
        └── container           one box, or one truck load with no box
              ├── container_item        declared + counted quantities
              └── container_discrepancy problems found at unload

product_category ──┬── container_item
                   └── stock_status     on-hand quantity

profiles                        user -> role, drives RLS
```

| table | holds |
|---|---|
| `supplier` | name, code |
| `product_category` | brand, variety, size_kg, code, is_available, selling_price |
| `shipment` | supplier, date_list_received, reference |
| `container` | container_no, is_company_truck, the three dates, status |
| `container_item` | qty_sacks (declared), actual_qty_sacks (counted), price_per_sack |
| `container_discrepancy` | reason, declared_qty, actual_qty, note |
| `stock_status` | remaining_qty per product |
| `profiles` | user_id, roles enum |

### Lifecycle

`DOCUMENTED` → `ARRIVED_AT_PORT` → `DELIVERED` → `UNLOADED`, plus `CANCELLED`.

Decoded from the notebooks: `W` meant arrived at port, `W/T` meant arrived
and received by Wensor Trading's warehouse.

Port is skippable — containers are often only noticed once already at the
warehouse. A CHECK ties each status to its required dates.

### Two prices, two sides

- `container_item.price_per_sack` — what it cost to buy
- `product_category.selling_price` — what it sells for

`selling_price` lives on the product, not on stock: selling out does not
change what something costs. It also lets a future `pos_admin` role update
quantities without being able to change prices.

### Declared vs counted

`qty_sacks` is what the supplier claimed. `actual_qty_sacks` is what was
counted at unload. **Stock moves on the counted figure, never the declared
one.** The gap between them is the shortage report the client currently
cannot produce at all.

---

## Functions

| function | does |
|---|---|
| `create_shipment(supplier, date, containers jsonb, ...)` | packing list + containers + line items in one transaction |
| `mark_container_at_port(id)` | DOCUMENTED → ARRIVED_AT_PORT |
| `mark_container_delivered(id, date?)` | → DELIVERED, date defaults to today |
| `cancel_container(id, reason?)` | → CANCELLED, refuses if already unloaded |
| `unload_container(id, date, discrepancies jsonb, allow_recount?)` | → UNLOADED, writes counts, logs problems |
| `is_warehouse_admin()` | role check, SECURITY DEFINER |

Everything is an RPC rather than a client-side sequence of inserts because
each is one logical event. Separate `.insert()` calls are not a transaction,
and a failure halfway leaves a shipment with no containers or a container
marked unloaded with half its counts.

### create_shipment

```ts
await supabase.rpc('create_shipment', {
  p_supplier_id: id,
  p_date_list_received: '2026-09-15',
  p_containers: [{
    container_no: 'OCLU1395985',
    is_company_truck: true,
    items: [
      { code: 'G', size_kg: 50, qty_sacks: 220, price_per_sack: 2650 },
      { product_category_id: uuid, qty_sacks: 150 },
    ],
  }],
});
```

Items accept either `product_category_id` or `code` + `size_kg`, so an
admin can type the notebook shorthand. Unknown code raises and rolls back.

### unload_container

```ts
await supabase.rpc('unload_container', {
  p_container_id: id,
  p_date_unloaded: '2026-09-15',
  p_discrepancies: [],   // [] when everything matched
});
```

| reason | actual_qty | note | effect |
|---|---|---|---|
| `SHORT` / `OVER` / `DAMAGED` | required | optional | writes the counted qty |
| `UNDECLARED` | required | optional | creates the line with qty_sacks = 0 |
| `OTHER` | omit | **required** | logs only, changes nothing |

`OTHER` is a parking space: something needs a decision, nothing moves until
it is re-logged under a real reason.

Do not `JSON.stringify` the array — supabase-js serialises it.

---

## Triggers

| trigger | on | does |
|---|---|---|
| `discrepancy_resolve_item` | BEFORE INSERT | rejects if container not DELIVERED/UNLOADED; creates the line for UNDECLARED |
| `discrepancy_apply` | AFTER INSERT | writes `actual_qty_sacks`, sets `items_match = false` |
| `product_category_init_stock` | AFTER INSERT | gives every new product a zero stock row |

The discrepancy triggers fire on any insert, including a manual one from
the dashboard. `unload_container` handles what they cannot see: setting
`actual_qty_sacks = qty_sacks` on the lines that matched.

---

## Views

All three use `security_invoker = on` so they respect RLS. Without it a view
runs as its owner and leaks past every policy.

| view | shows |
|---|---|
| `v_container_variance` | declared vs counted per container, with variance |
| `v_open_questions` | unresolved `OTHER` discrepancies |
| `v_container_notebook` | flattened join, optional — see Known gaps |

Filter `v_container_variance` on `status = 'UNLOADED'`. Pending containers
have no counts, so `coalesce` reads them as zero received and every one
looks like a total loss.

---

## Security

RLS on every table, `FORCE` so it applies to the owner too. One
`FOR ALL` policy per table gated on `is_warehouse_admin()`.

`is_warehouse_admin()` is `SECURITY DEFINER` by necessity — it reads
`profiles`, which is itself RLS-protected, so an invoker function would
recurse infinitely. It is `STABLE` so the planner calls it once per
statement rather than once per row.

`profiles` differs: everyone reads their own row so the app knows its role,
admins read everyone's. **Nobody can update their own profile** — a
self-update policy would let a user set `roles = 'warehouse_admin'`.

### Bootstrap

The first admin cannot be made through the app. From the SQL editor, which
runs as `service_role` and bypasses RLS:

```sql
insert into public.profiles (user_id, roles)
values ((select id from auth.users where email = '...'), 'warehouse_admin');
```

### Testing RLS

As a non-admin, `select count(*) from container` must return **0, not an
error**. RLS filters rows; a 403 means the GRANT is wrong, not the policy.

---

## Files, in run order

| file | |
|---|---|
| `warehouse_schema.sql` | base tables |
| `rls_policies.sql` | RLS + `is_warehouse_admin()` |
| `migrate_container_status.sql` | adds ARRIVED_AT_PORT |
| `migrate_product_category.sql` | variety, is_available |
| `migrate_product_code.sql` | notebook shorthand |
| `migrate_discrepancy_final.sql` | discrepancy table, triggers, unload RPC |
| `migrate_discrepancy_guards.sql` | status guards |
| `rpc_create_shipment.sql` | |
| `rpc_advance_container.sql` | |
| `seed_suppliers.sql` | |
| `reseed_product_category.sql` | 71 products from the wall price list |
| `seed_stock_status.sql` | zero rows + init trigger |
| `verify_schema.sql` | read-only checks |
| `notebook_view.sql` | optional flattening view |

Superseded, safe to delete: `migrate_discrepancy.sql`, `_v2`, `_v3`, `_v4`,
`seed_from_notebooks.sql`.

Once this settles, fold the migrations back into `warehouse_schema.sql`.
Migration chains earn their keep when there is production data to preserve;
while it is test data, one file that builds the database from nothing is
easier to reason about and easier to hand over.

---

## Known gaps

**Nothing records what leaves.** The whole schema is inbound. Stock falls
daily in the client's notebooks, so dispatch happens somewhere — a fifth
book, invoices, or informally. This is half the system and it is unscoped.

**No stock ledger.** `stock_status.remaining_qty` is a bare number with no
history. Nothing currently writes it: `unload_container` records what
arrived but does not move stock. A balance with no ledger behind it cannot
be audited or reconstructed, and this is the thing to fix before go-live.

**`DAMAGED` is a label, not a behaviour.** It behaves identically to
`SHORT`. Damaged sacks physically exist in the warehouse but vanish from
the numbers. Needs either a `damaged_qty` column or the stock ledger.

**No price data.** All 71 products have `selling_price = null`, including
45 flagged available. The wall price list photo has prices, but the
handwriting is offset from the printed rows — reading the L-King block as
50/25/5 puts a 5kg sack at ~PHP 496/kg against a market rate of ~PHP 50/kg.
Someone has to read the board in person.

**`OTHER` discrepancies cannot be closed.** No `resolved_at`, so
`v_open_questions` only grows. A queue that never shrinks stops being read.

**No port date.** `ARRIVED_AT_PORT` has no date column. Open question: when
a `W` row becomes `W/T`, does the clerk overwrite the date or keep both?

**Sorting across joins.** PostgREST cannot order a parent result set by a
referenced table's column. Affects sorting the supplier notebook by packing
list date, and stock by price. `notebook_view.sql` is the workaround.

**Unconfirmed transcriptions.** `G` = Ganador is inferred from size
matching. `L-I`, `PAL`, `P/LAMI` are read from handwriting. `DCO` is
unassigned — Dona Conchita has three colour variants and the notebook does
not say which. `LI LY` may be a misreading of `LI CY`; if so, two supplier
records exist for one business.

**Recount is an escape hatch, not a workflow.** `p_allow_recount` re-opens
an unloaded container but does not void the previous discrepancy rows or
reset the counts, so you end up with two sets of numbers.
