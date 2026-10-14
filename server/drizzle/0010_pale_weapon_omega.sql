ALTER TABLE "container" ALTER COLUMN "is_company_truck" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "container" ALTER COLUMN "is_company_truck" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "container" ADD COLUMN "hauler" text;