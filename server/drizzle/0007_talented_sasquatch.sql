ALTER TABLE "supplier" ADD CONSTRAINT "supplier_id_kind_uq" UNIQUE("id","kind");--> statement-breakpoint
ALTER TABLE "local_delivery" ADD COLUMN "supplier_kind" "supplier_kind" DEFAULT 'LOCAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipment" ADD COLUMN "supplier_kind" "supplier_kind" DEFAULT 'INTERNATIONAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_delivery" ADD CONSTRAINT "local_delivery_supplier_kind_fk" FOREIGN KEY ("supplier_id","supplier_kind") REFERENCES "public"."supplier"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplier_kind_fk" FOREIGN KEY ("supplier_id","supplier_kind") REFERENCES "public"."supplier"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_delivery" ADD CONSTRAINT "local_delivery_supplier_local_ck" CHECK ("local_delivery"."supplier_kind" = 'LOCAL');--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplier_international_ck" CHECK ("shipment"."supplier_kind" = 'INTERNATIONAL');
