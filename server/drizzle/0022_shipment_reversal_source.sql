-- Unload and shipment-reversal movements outlive a hard-deleted shipment:
-- their container_id is cleared and the note names the container instead.
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_source_ck";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_source_ck" CHECK (
        ("stock_movement"."movement_type" in ('INBOUND_UNLOAD', 'SHIPMENT_REVERSAL') and "stock_movement"."order_slip_id" is null and "stock_movement"."local_delivery_id" is null)
        or ("stock_movement"."movement_type" in ('OUTBOUND_ORDER', 'ORDER_REVERSAL') and "stock_movement"."order_slip_id" is not null and "stock_movement"."container_id" is null and "stock_movement"."local_delivery_id" is null and "stock_movement"."order_revision" is not null)
        or ("stock_movement"."movement_type" in ('INBOUND_LOCAL', 'LOCAL_REVERSAL') and "stock_movement"."local_delivery_id" is not null and "stock_movement"."container_id" is null and "stock_movement"."order_slip_id" is null)
        or ("stock_movement"."movement_type" in ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT') and "stock_movement"."container_id" is null and "stock_movement"."order_slip_id" is null and "stock_movement"."local_delivery_id" is null)
      );
