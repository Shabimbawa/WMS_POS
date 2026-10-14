ALTER TABLE "shipment" DROP CONSTRAINT IF EXISTS "shipment_supplier_international_ck";--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplier_international_ck" CHECK ("shipment"."supplier_kind" in ('INTERNATIONAL', 'NATIONAL'));
