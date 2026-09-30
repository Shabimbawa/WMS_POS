CREATE TYPE "public"."supplier_kind" AS ENUM('INTERNATIONAL', 'LOCAL');--> statement-breakpoint
CREATE TABLE "local_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"date_received" date NOT NULL,
	"reference" text,
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_delivery_void_reason_ck" CHECK ("local_delivery"."voided_at" is null or length(trim(coalesce("local_delivery"."void_reason", ''))) > 0)
);--> statement-breakpoint
CREATE TABLE "local_delivery_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_delivery_id" uuid NOT NULL,
	"product_category_id" uuid NOT NULL,
	"qty_sacks" integer NOT NULL,
	"price_per_sack" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_delivery_item_qty_positive" CHECK ("local_delivery_item"."qty_sacks" > 0),
	CONSTRAINT "local_delivery_item_price_nonnegative" CHECK ("local_delivery_item"."price_per_sack" is null or "local_delivery_item"."price_per_sack" >= 0)
);--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_source_ck";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "local_delivery_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "kind" "supplier_kind" DEFAULT 'INTERNATIONAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "local_delivery" ADD CONSTRAINT "local_delivery_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_delivery" ADD CONSTRAINT "local_delivery_voided_by_app_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_delivery" ADD CONSTRAINT "local_delivery_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_delivery_item" ADD CONSTRAINT "local_delivery_item_local_delivery_id_local_delivery_id_fk" FOREIGN KEY ("local_delivery_id") REFERENCES "public"."local_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_delivery_item" ADD CONSTRAINT "local_delivery_item_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_delivery_supplier_id_idx" ON "local_delivery" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "local_delivery_date_received_idx" ON "local_delivery" USING btree ("date_received");--> statement-breakpoint
CREATE UNIQUE INDEX "local_delivery_item_product_uq" ON "local_delivery_item" USING btree ("local_delivery_id","product_category_id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_local_delivery_id_local_delivery_id_fk" FOREIGN KEY ("local_delivery_id") REFERENCES "public"."local_delivery"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_local_delivery_idx" ON "stock_movement" USING btree ("local_delivery_id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_source_ck" CHECK (
        ("stock_movement"."movement_type" = 'INBOUND_UNLOAD' and "stock_movement"."container_id" is not null and "stock_movement"."order_slip_id" is null and "stock_movement"."local_delivery_id" is null)
        or ("stock_movement"."movement_type" in ('OUTBOUND_ORDER', 'ORDER_REVERSAL') and "stock_movement"."order_slip_id" is not null and "stock_movement"."container_id" is null and "stock_movement"."local_delivery_id" is null and "stock_movement"."order_revision" is not null)
        or ("stock_movement"."movement_type" in ('INBOUND_LOCAL', 'LOCAL_REVERSAL') and "stock_movement"."local_delivery_id" is not null and "stock_movement"."container_id" is null and "stock_movement"."order_slip_id" is null)
        or ("stock_movement"."movement_type" in ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT') and "stock_movement"."container_id" is null and "stock_movement"."order_slip_id" is null and "stock_movement"."local_delivery_id" is null)
      );
