import { config } from "../config.js";
import { closeDatabase, sqlClient } from "../db/client.js";

const CONFIRM_FLAG = "--confirm-reset-receiving";

if (config.NODE_ENV === "production") {
  throw new Error("Receiving data reset is disabled when NODE_ENV=production");
}

type CountRow = {
  shipments: number;
  containers: number;
  discrepancies: number;
  local_deliveries: number;
  inbound_movements: number;
};

try {
  const [preview] = await sqlClient<CountRow[]>`
    select
      (select count(*)::int from shipment) as shipments,
      (select count(*)::int from container) as containers,
      (select count(*)::int from container_discrepancy) as discrepancies,
      (select count(*)::int from local_delivery) as local_deliveries,
      (
        select count(*)::int
        from stock_movement
        where container_id is not null or local_delivery_id is not null
      ) as inbound_movements
  `;

  process.stdout.write(
    [
      "Development receiving-data reset preview:",
      `  Shipments (international + national): ${preview?.shipments ?? 0}`,
      `  Containers: ${preview?.containers ?? 0}`,
      `  Discrepancies: ${preview?.discrepancies ?? 0}`,
      `  Local deliveries: ${preview?.local_deliveries ?? 0}`,
      `  Related inventory movements: ${preview?.inbound_movements ?? 0}`,
    ].join("\n") + "\n",
  );

  if (!process.argv.includes(CONFIRM_FLAG)) {
    process.stdout.write(
      `\nDry run only. To permanently delete these records, run:\n` +
      `npm run dev:reset-receiving -- ${CONFIRM_FLAG}\n`,
    );
  } else {
    const deleted = await sqlClient.begin(async (tx) => {
      // Prevent receiving, stock, or sales writes from changing the calculation
      // while balances and their source rows are being removed.
      await tx.unsafe(`
        lock table
          stock_movement,
          stock_balance,
          container_discrepancy,
          container_item,
          container,
          shipment,
          local_delivery_item,
          local_delivery
        in exclusive mode
      `);

      const negativeBalances = await tx<{ product_category_id: string; projected_qty: number }[]>`
        select
          sb.product_category_id,
          (
            sb.remaining_qty - coalesce(sum(sm.quantity_delta), 0)
          )::int as projected_qty
        from stock_balance sb
        join stock_movement sm
          on sm.product_category_id = sb.product_category_id
         and (sm.container_id is not null or sm.local_delivery_id is not null)
        group by sb.product_category_id, sb.remaining_qty
        having sb.remaining_qty - coalesce(sum(sm.quantity_delta), 0) < 0
      `;

      if (negativeBalances.length) {
        throw new Error(
          "Reset refused: received stock has already been consumed. " +
          `${negativeBalances.length} product balance(s) would become negative. ` +
          "Remove/reset dependent sales or adjustments first.",
        );
      }

      await tx`
        update stock_balance sb
        set
          remaining_qty = sb.remaining_qty - coalesce((
            select sum(sm.quantity_delta)
            from stock_movement sm
            where sm.product_category_id = sb.product_category_id
              and (sm.container_id is not null or sm.local_delivery_id is not null)
          ), 0)::int,
          updated_at = now()
        where exists (
          select 1
          from stock_movement sm
          where sm.product_category_id = sb.product_category_id
            and (sm.container_id is not null or sm.local_delivery_id is not null)
        )
      `;

      const movements = await tx`
        delete from stock_movement
        where container_id is not null or local_delivery_id is not null
      `;
      const discrepancies = await tx`delete from container_discrepancy`;
      const containerItems = await tx`delete from container_item`;
      const containers = await tx`delete from container`;
      const shipments = await tx`delete from shipment`;
      const localItems = await tx`delete from local_delivery_item`;
      const localDeliveries = await tx`delete from local_delivery`;

      return {
        shipments: shipments.count,
        containers: containers.count,
        containerItems: containerItems.count,
        discrepancies: discrepancies.count,
        localDeliveries: localDeliveries.count,
        localItems: localItems.count,
        movements: movements.count,
      };
    });

    process.stdout.write(
      [
        "\nReceiving data reset completed:",
        `  Shipments: ${deleted.shipments}`,
        `  Containers: ${deleted.containers}`,
        `  Container items: ${deleted.containerItems}`,
        `  Discrepancies: ${deleted.discrepancies}`,
        `  Local deliveries: ${deleted.localDeliveries}`,
        `  Local delivery items: ${deleted.localItems}`,
        `  Related inventory movements: ${deleted.movements}`,
        "  Stock balances were reduced by the net quantity from the deleted receiving movements.",
      ].join("\n") + "\n",
    );
  }
} finally {
  await closeDatabase();
}
