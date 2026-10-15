ALTER TABLE "shipping_company" ADD COLUMN "grace_period_days" integer;--> statement-breakpoint
ALTER TABLE "shipping_company" ADD CONSTRAINT "shipping_company_grace_period_positive_ck" CHECK ("shipping_company"."grace_period_days" IS NULL OR "shipping_company"."grace_period_days" > 0);
