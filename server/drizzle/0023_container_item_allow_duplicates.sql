-- A container may list the same product on more than one line (for example
-- at two prices). Unload discrepancies point at a line, not a product.
DROP INDEX IF EXISTS "container_item_product_uq";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "container_item_container_idx" ON "container_item" USING btree ("container_id");
