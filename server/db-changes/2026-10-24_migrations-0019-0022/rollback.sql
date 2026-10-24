-- Rolls back migrations 0019-0022 to the exact schema recorded in README.md.
--
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f rollback.sql
--
-- It runs in one transaction and aborts, changing nothing, if data written
-- since the migration would break the restored rules. In that case read the
-- "If the rollback refuses" section of README.md.

BEGIN;

-- 1. Preconditions: the old rules must hold for every existing row.
DO $$
DECLARE
  negative_balances int;
  negative_movements int;
  reversal_rows int;
  unlinked_unloads int;
BEGIN
  SELECT count(*) INTO negative_balances FROM stock_balance WHERE remaining_qty < 0;
  SELECT count(*) INTO negative_movements FROM stock_movement WHERE balance_after < 0;
  SELECT count(*) INTO reversal_rows FROM stock_movement WHERE movement_type::text = 'SHIPMENT_REVERSAL';
  SELECT count(*) INTO unlinked_unloads FROM stock_movement
    WHERE movement_type::text = 'INBOUND_UNLOAD' AND container_id IS NULL;

  IF negative_balances + negative_movements + reversal_rows + unlinked_unloads > 0 THEN
    RAISE EXCEPTION
      'Rollback refused: % negative balances, % movements with negative balance_after, % SHIPMENT_REVERSAL movements, % unload movements without a container. See README.md.',
      negative_balances, negative_movements, reversal_rows, unlinked_unloads;
  END IF;
END $$;

-- 2. Undo 0022: restore the old source rule (it needs the enum, so drop it first).
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_source_ck;

-- 3. Undo 0021: PostgreSQL cannot drop an enum value, so rebuild the type
--    without SHIPMENT_REVERSAL. stock_movement.movement_type is its only user.
ALTER TYPE stock_movement_type RENAME TO stock_movement_type_with_reversal;
CREATE TYPE stock_movement_type AS ENUM (
  'OPENING_BALANCE',
  'INBOUND_UNLOAD',
  'OUTBOUND_ORDER',
  'ORDER_REVERSAL',
  'MANUAL_ADJUSTMENT',
  'INBOUND_LOCAL',
  'LOCAL_REVERSAL'
);
ALTER TABLE stock_movement
  ALTER COLUMN movement_type TYPE stock_movement_type
  USING movement_type::text::stock_movement_type;
DROP TYPE stock_movement_type_with_reversal;

ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_source_ck CHECK ((((movement_type = 'INBOUND_UNLOAD'::stock_movement_type) AND (container_id IS NOT NULL) AND (order_slip_id IS NULL) AND (local_delivery_id IS NULL)) OR ((movement_type = ANY (ARRAY['OUTBOUND_ORDER'::stock_movement_type, 'ORDER_REVERSAL'::stock_movement_type])) AND (order_slip_id IS NOT NULL) AND (container_id IS NULL) AND (local_delivery_id IS NULL) AND (order_revision IS NOT NULL)) OR ((movement_type = ANY (ARRAY['INBOUND_LOCAL'::stock_movement_type, 'LOCAL_REVERSAL'::stock_movement_type])) AND (local_delivery_id IS NOT NULL) AND (container_id IS NULL) AND (order_slip_id IS NULL)) OR ((movement_type = ANY (ARRAY['OPENING_BALANCE'::stock_movement_type, 'MANUAL_ADJUSTMENT'::stock_movement_type])) AND (container_id IS NULL) AND (order_slip_id IS NULL) AND (local_delivery_id IS NULL))));

-- 4. Undo 0020: bring back shipment.notes (empty before the migration).
--    It returns as the table's last column instead of the fifth.
ALTER TABLE shipment ADD COLUMN notes text;

-- 5. Undo 0019: restore the no-negative-stock rules.
ALTER TABLE stock_balance ADD CONSTRAINT stock_balance_nonnegative CHECK ((remaining_qty >= 0));
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_balance_nonnegative CHECK ((balance_after >= 0));

-- 6. Forget the four migrations so `npm run db:migrate` would apply them again.
DELETE FROM drizzle.__drizzle_migrations
WHERE created_at IN (1792530000000, 1792540000000, 1792550000000, 1792550000001);

COMMIT;
