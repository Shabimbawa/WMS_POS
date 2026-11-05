-- A product may be registered without a sack size, and given one later
-- (once). At most one sizeless product per brand + variety: sizes are > 0,
-- so coalesce(size_kg, 0) stands in for "no size" in the identity index.
ALTER TABLE "product_category" ALTER COLUMN "size_kg" DROP NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "product_category_identity_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_identity_uq" ON "product_category" USING btree (lower("brand"),lower(coalesce("variety", '')),coalesce("size_kg", 0));
