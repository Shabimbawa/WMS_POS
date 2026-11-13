-- Reverses migrations 0024_product_size_optional and
-- 0023_container_item_allow_duplicates on the team database.
-- One transaction: it either fully succeeds or changes nothing.
-- Refuses if data written since the migration would break the old rules.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  sizeless int;
  duplicate_lines int;
BEGIN
  SELECT count(*) INTO sizeless FROM product_category WHERE size_kg IS NULL;
  SELECT count(*) INTO duplicate_lines FROM (
    SELECT 1 FROM container_item
    GROUP BY container_id, product_category_id HAVING count(*) > 1
  ) d;
  IF sizeless > 0 OR duplicate_lines > 0 THEN
    RAISE EXCEPTION 'Rollback refused: % products without a size, % containers listing a product twice. Give those products a size / merge those lines first, or restore the backup.',
      sizeless, duplicate_lines;
  END IF;
END $$;

-- 0024: size required again, identity index on the bare size.
DROP INDEX IF EXISTS product_category_identity_uq;
CREATE UNIQUE INDEX product_category_identity_uq ON product_category
  USING btree (lower(brand), lower(coalesce(variety, '')), size_kg);
ALTER TABLE product_category ALTER COLUMN size_kg SET NOT NULL;

-- 0023: one line per product per container.
DROP INDEX IF EXISTS container_item_container_idx;
CREATE UNIQUE INDEX container_item_product_uq ON container_item
  USING btree (container_id, product_category_id);

DELETE FROM drizzle.__drizzle_migrations
WHERE created_at IN (1792560000000, 1792570000000);

COMMIT;
