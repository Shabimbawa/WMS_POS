CREATE TYPE "public"."container_status" AS ENUM('DOCUMENTED', 'ARRIVED_AT_PORT', 'DELIVERED', 'UNLOADED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_reason" AS ENUM('SHORT', 'OVER', 'DAMAGED', 'UNDECLARED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('paid', 'unpaid', 'partial');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('warehouse_admin', 'pos_admin');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('OPENING_BALANCE', 'INBOUND_UNLOAD', 'OUTBOUND_ORDER', 'ORDER_REVERSAL', 'MANUAL_ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_discrepancy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"container_item_id" uuid,
	"product_category_id" uuid NOT NULL,
	"declared_qty" integer,
	"actual_qty" integer,
	"reason" "discrepancy_reason" NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_discrepancy_quantities_nonnegative" CHECK (("container_discrepancy"."declared_qty" is null or "container_discrepancy"."declared_qty" >= 0) and ("container_discrepancy"."actual_qty" is null or "container_discrepancy"."actual_qty" >= 0)),
	CONSTRAINT "container_discrepancy_shape_ck" CHECK (
        ("container_discrepancy"."reason" in ('SHORT', 'OVER', 'DAMAGED', 'UNDECLARED') and "container_discrepancy"."actual_qty" is not null)
        or ("container_discrepancy"."reason" = 'OTHER' and length(trim(coalesce("container_discrepancy"."note", ''))) > 0)
      )
);
--> statement-breakpoint
CREATE TABLE "container_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" uuid NOT NULL,
	"product_category_id" uuid NOT NULL,
	"qty_sacks" integer NOT NULL,
	"actual_qty_sacks" integer,
	"price_per_sack" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_item_qty_nonnegative" CHECK ("container_item"."qty_sacks" >= 0),
	CONSTRAINT "container_item_actual_qty_nonnegative" CHECK ("container_item"."actual_qty_sacks" is null or "container_item"."actual_qty_sacks" >= 0),
	CONSTRAINT "container_item_price_nonnegative" CHECK ("container_item"."price_per_sack" is null or "container_item"."price_per_sack" >= 0)
);
--> statement-breakpoint
CREATE TABLE "container" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"container_no" text,
	"is_company_truck" boolean DEFAULT true NOT NULL,
	"date_arrived_at_port" date,
	"date_delivered" date,
	"date_unloaded" date,
	"status" "container_status" DEFAULT 'DOCUMENTED' NOT NULL,
	"notes" text,
	"cancellation_reason" text,
	"items_match" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "container_lifecycle_dates_ck" CHECK (
        ("container"."status" = 'DOCUMENTED' and "container"."date_delivered" is null and "container"."date_unloaded" is null)
        or ("container"."status" = 'ARRIVED_AT_PORT' and "container"."date_arrived_at_port" is not null and "container"."date_delivered" is null and "container"."date_unloaded" is null)
        or ("container"."status" = 'DELIVERED' and "container"."date_delivered" is not null and "container"."date_unloaded" is null)
        or ("container"."status" = 'UNLOADED' and "container"."date_delivered" is not null and "container"."date_unloaded" is not null)
        or ("container"."status" = 'CANCELLED' and "container"."date_unloaded" is null)
      ),
	CONSTRAINT "container_date_order_ck" CHECK ("container"."date_unloaded" is null or "container"."date_delivered" is null or "container"."date_unloaded" >= "container"."date_delivered")
);
--> statement-breakpoint
CREATE TABLE "order_slip_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_slip_id" uuid NOT NULL,
	"product_category_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(16, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_slip_item_quantity_positive" CHECK ("order_slip_item"."quantity" > 0),
	CONSTRAINT "order_slip_item_unit_price_nonnegative" CHECK ("order_slip_item"."unit_price" >= 0),
	CONSTRAINT "order_slip_item_line_total_ck" CHECK ("order_slip_item"."line_total" = "order_slip_item"."quantity" * "order_slip_item"."unit_price")
);
--> statement-breakpoint
CREATE TABLE "order_slip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slip_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "order_slip_slip_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" date NOT NULL,
	"order_by" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"status" "payment_status" NOT NULL,
	"payment_due_date" date NOT NULL,
	"total_amount" numeric(16, 2) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_slip_total_nonnegative" CHECK ("order_slip"."total_amount" >= 0),
	CONSTRAINT "order_slip_due_date_ck" CHECK ("order_slip"."payment_due_date" >= "order_slip"."date"),
	CONSTRAINT "order_slip_order_by_nonempty" CHECK (length(trim("order_slip"."order_by")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"variety" text,
	"size_kg" numeric(10, 3) NOT NULL,
	"code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"selling_price" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_category_size_positive" CHECK ("product_category"."size_kg" > 0),
	CONSTRAINT "product_category_selling_price_nonnegative" CHECK ("product_category"."selling_price" is null or "product_category"."selling_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "profile_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"date_list_received" date NOT NULL,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_balance" (
	"product_category_id" uuid PRIMARY KEY NOT NULL,
	"remaining_qty" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balance_nonnegative" CHECK ("stock_balance"."remaining_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"product_category_id" uuid NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"container_id" uuid,
	"order_slip_id" uuid,
	"order_revision" integer,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movement_delta_nonzero" CHECK ("stock_movement"."quantity_delta" <> 0),
	CONSTRAINT "stock_movement_balance_nonnegative" CHECK ("stock_movement"."balance_after" >= 0),
	CONSTRAINT "stock_movement_source_ck" CHECK (
        ("stock_movement"."movement_type" = 'INBOUND_UNLOAD' and "stock_movement"."container_id" is not null and "stock_movement"."order_slip_id" is null)
        or ("stock_movement"."movement_type" in ('OUTBOUND_ORDER', 'ORDER_REVERSAL') and "stock_movement"."order_slip_id" is not null and "stock_movement"."container_id" is null and "stock_movement"."order_revision" is not null)
        or ("stock_movement"."movement_type" in ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT') and "stock_movement"."container_id" is null and "stock_movement"."order_slip_id" is null)
      )
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "container_discrepancy" ADD CONSTRAINT "container_discrepancy_container_id_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."container"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_discrepancy" ADD CONSTRAINT "container_discrepancy_container_item_id_container_item_id_fk" FOREIGN KEY ("container_item_id") REFERENCES "public"."container_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_discrepancy" ADD CONSTRAINT "container_discrepancy_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_discrepancy" ADD CONSTRAINT "container_discrepancy_resolved_by_app_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_discrepancy" ADD CONSTRAINT "container_discrepancy_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_item" ADD CONSTRAINT "container_item_container_id_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."container"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container_item" ADD CONSTRAINT "container_item_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "container" ADD CONSTRAINT "container_shipment_id_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slip_item" ADD CONSTRAINT "order_slip_item_order_slip_id_order_slip_id_fk" FOREIGN KEY ("order_slip_id") REFERENCES "public"."order_slip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slip_item" ADD CONSTRAINT "order_slip_item_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_updated_by_app_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_category_id_product_category_id_fk" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_container_id_container_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."container"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_slip_id_order_slip_id_fk" FOREIGN KEY ("order_slip_id") REFERENCES "public"."order_slip"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_lower_uq" ON "app_user" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "container_discrepancy_container_idx" ON "container_discrepancy" USING btree ("container_id");--> statement-breakpoint
CREATE UNIQUE INDEX "container_item_product_uq" ON "container_item" USING btree ("container_id","product_category_id");--> statement-breakpoint
CREATE INDEX "container_shipment_id_idx" ON "container" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "container_number_lower_uq" ON "container" USING btree (lower("container_no")) WHERE "container"."container_no" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "order_slip_item_product_uq" ON "order_slip_item" USING btree ("order_slip_id","product_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_slip_number_uq" ON "order_slip" USING btree ("slip_number");--> statement-breakpoint
CREATE INDEX "order_slip_date_idx" ON "order_slip" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_identity_uq" ON "product_category" USING btree (lower("brand"),lower(coalesce("variety", '')),"size_kg");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_uq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "shipment_supplier_id_idx" ON "shipment" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "shipment_date_list_received_idx" ON "shipment" USING btree ("date_list_received");--> statement-breakpoint
CREATE INDEX "stock_movement_product_occurred_idx" ON "stock_movement" USING btree ("product_category_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movement_batch_idx" ON "stock_movement" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_movement_container_idx" ON "stock_movement" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "stock_movement_order_slip_idx" ON "stock_movement" USING btree ("order_slip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_name_lower_uq" ON "supplier" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_code_lower_uq" ON "supplier" USING btree (lower("code")) WHERE "supplier"."code" is not null;