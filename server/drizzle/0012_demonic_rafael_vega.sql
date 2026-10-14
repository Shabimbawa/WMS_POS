ALTER TYPE "public"."supplier_kind" ADD VALUE 'NATIONAL';--> statement-breakpoint
ALTER TABLE "shipment" DROP CONSTRAINT "shipment_supplier_international_ck";--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplier_international_ck" CHECK ("shipment"."supplier_kind" in ('INTERNATIONAL', 'NATIONAL'));