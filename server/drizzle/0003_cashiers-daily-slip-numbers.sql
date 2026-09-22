CREATE TABLE "cashier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashier_name_nonempty" CHECK (length(trim("cashier"."name")) > 0)
);
--> statement-breakpoint
DROP INDEX "order_slip_number_uq";--> statement-breakpoint
DROP INDEX "order_slip_date_idx";--> statement-breakpoint
ALTER TABLE "order_slip" ALTER COLUMN "slip_number" DROP IDENTITY;--> statement-breakpoint
ALTER TABLE "order_slip" ADD COLUMN "cashier_id" uuid NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cashier_name_lower_uq" ON "cashier" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_cashier_id_cashier_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."cashier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_slip_date_number_uq" ON "order_slip" USING btree ("date","slip_number");--> statement-breakpoint
CREATE INDEX "order_slip_cashier_date_idx" ON "order_slip" USING btree ("cashier_id","date");--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_number_positive" CHECK ("order_slip"."slip_number" > 0);