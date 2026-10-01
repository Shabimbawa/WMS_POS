ALTER TABLE "order_slip" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_slip" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "order_slip" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_deleted_by_app_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_slip_trash_idx" ON "order_slip" USING btree ("deleted_at") WHERE "order_slip"."deleted_at" is not null and "order_slip"."purged_at" is null;--> statement-breakpoint
ALTER TABLE "order_slip" ADD CONSTRAINT "order_slip_purged_after_deleted_ck" CHECK ("order_slip"."purged_at" is null or "order_slip"."deleted_at" is not null);