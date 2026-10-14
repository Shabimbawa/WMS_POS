ALTER TYPE "public"."supplier_kind" ADD VALUE IF NOT EXISTS 'NATIONAL';--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "origin" text;