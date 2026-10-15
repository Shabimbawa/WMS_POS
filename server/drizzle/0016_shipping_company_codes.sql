CREATE TABLE "shipping_company_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipping_company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_company_code_nonempty_ck" CHECK (length(trim("shipping_company_code"."code")) > 0)
);
--> statement-breakpoint
ALTER TABLE "shipping_company_code" ADD CONSTRAINT "shipping_company_code_shipping_company_id_shipping_company_id_fk" FOREIGN KEY ("shipping_company_id") REFERENCES "public"."shipping_company"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "shipping_company_code_company_idx" ON "shipping_company_code" USING btree ("shipping_company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_company_alias_code_lower_uq" ON "shipping_company_code" USING btree (lower("code"));
--> statement-breakpoint
INSERT INTO "shipping_company_code" ("shipping_company_id", "code")
SELECT "id", upper(trim("code"))
FROM "shipping_company"
WHERE "code" IS NOT NULL AND length(trim("code")) > 0
ON CONFLICT DO NOTHING;
