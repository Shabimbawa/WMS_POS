ALTER TABLE "order_slip" DROP CONSTRAINT "order_slip_order_by_nonempty";--> statement-breakpoint
ALTER TABLE "order_slip" ALTER COLUMN "order_by" SET DEFAULT '';