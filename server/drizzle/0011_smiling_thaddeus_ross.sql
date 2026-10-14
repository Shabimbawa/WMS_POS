CREATE TABLE "shipping_company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "container" ADD COLUMN "shipping_company_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_company_name_lower_uq" ON "shipping_company" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_company_code_lower_uq" ON "shipping_company" USING btree (lower("code")) WHERE "shipping_company"."code" is not null;--> statement-breakpoint
ALTER TABLE "container" ADD CONSTRAINT "container_shipping_company_id_shipping_company_id_fk" FOREIGN KEY ("shipping_company_id") REFERENCES "public"."shipping_company"("id") ON DELETE restrict ON UPDATE no action;