import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  containerItems,
  containers,
  localDeliveries,
  localDeliveryItems,
  orderSlipItems,
  orderSlips,
  productCategories,
  shipments,
  suppliers,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

/** Comma-separated product ids, as a query string carries an array. */
const productIdList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : []))
  .pipe(z.array(z.uuid()).max(200));

const dailyQuery = z.object({
  kind: z.enum(["purchase", "sales"]),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  productIds: productIdList,
  /** Purchase only: that whole shipment, whatever the period. */
  shipmentId: z.uuid().optional(),
  /** Purchase only. */
  source: z.enum(["ALL", "SHIPMENT", "LOCAL"]).default("ALL"),
});

type Cell = { productId: string; date: string; sacks: number };

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  /** Every shipment, newest first, for the report's shipment filter. */
  app.get("/reports/shipments", warehouseOnly, async () => {
    return db
      .select({
        id: shipments.id,
        reference: shipments.reference,
        date_list_received: shipments.dateListReceived,
        supplier: suppliers.name,
      })
      .from(shipments)
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .orderBy(desc(shipments.dateListReceived), desc(shipments.createdAt));
  });

  /**
   * Sacks per product per day, for the timeframe grids.
   *
   * purchase: what was ordered in, on the day it was ordered. Shipments
   * count declared sacks on the packing list's date (cancelled containers
   * left out); local deliveries count their sacks on the date received
   * (voided ones left out).
   *
   * sales: sacks on order slips, by slip date. Slips in Trash are left out,
   * and an edited slip counts as it stands now.
   *
   * `products` lists every active product (or just the filtered ones), so
   * the client can show a brand's quiet sizes as zero rows.
   */
  app.get("/reports/daily", warehouseOnly, async (request) => {
    const query = dailyQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }
    const productFilter = (column: Parameters<typeof inArray>[0]) =>
      query.productIds.length ? inArray(column, query.productIds) : undefined;

    let cells: Cell[];
    if (query.kind === "sales") {
      cells = await db
        .select({
          productId: orderSlipItems.productCategoryId,
          date: orderSlips.date,
          sacks: sql<number>`sum(${orderSlipItems.quantity})::int`,
        })
        .from(orderSlipItems)
        .innerJoin(orderSlips, eq(orderSlipItems.orderSlipId, orderSlips.id))
        .where(and(
          isNull(orderSlips.deletedAt),
          gte(orderSlips.date, query.dateFrom),
          lte(orderSlips.date, query.dateTo),
          productFilter(orderSlipItems.productCategoryId),
        ))
        .groupBy(orderSlipItems.productCategoryId, orderSlips.date);
    } else {
      const shipmentCells = query.source === "LOCAL" && !query.shipmentId ? [] : await db
        .select({
          productId: containerItems.productCategoryId,
          date: shipments.dateListReceived,
          sacks: sql<number>`sum(${containerItems.qtySacks})::int`,
        })
        .from(containerItems)
        .innerJoin(containers, eq(containerItems.containerId, containers.id))
        .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
        .where(and(
          ne(containers.status, "CANCELLED"),
          query.shipmentId
            ? eq(shipments.id, query.shipmentId)
            : and(gte(shipments.dateListReceived, query.dateFrom), lte(shipments.dateListReceived, query.dateTo)),
          productFilter(containerItems.productCategoryId),
        ))
        .groupBy(containerItems.productCategoryId, shipments.dateListReceived);
      const localCells = query.source === "SHIPMENT" || query.shipmentId ? [] : await db
        .select({
          productId: localDeliveryItems.productCategoryId,
          date: localDeliveries.dateReceived,
          sacks: sql<number>`sum(${localDeliveryItems.qtySacks})::int`,
        })
        .from(localDeliveryItems)
        .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
        .where(and(
          isNull(localDeliveries.voidedAt),
          gte(localDeliveries.dateReceived, query.dateFrom),
          lte(localDeliveries.dateReceived, query.dateTo),
          productFilter(localDeliveryItems.productCategoryId),
        ))
        .groupBy(localDeliveryItems.productCategoryId, localDeliveries.dateReceived);
      // A product can arrive both ways on one day; merge them into one cell.
      const merged = new Map<string, Cell>();
      for (const cell of [...shipmentCells, ...localCells]) {
        const key = `${cell.productId}|${cell.date}`;
        const current = merged.get(key);
        if (current) current.sacks += cell.sacks;
        else merged.set(key, { ...cell });
      }
      cells = [...merged.values()];
    }

    // Retired products appear only when they still have figures in the period.
    const withFigures = [...new Set(cells.map((cell) => cell.productId))];
    const products = await db
      .select({
        id: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        code: productCategories.code,
        size_kg: productCategories.sizeKg,
      })
      .from(productCategories)
      .where(
        query.productIds.length
          ? inArray(productCategories.id, query.productIds)
          : withFigures.length
            ? sql`(${productCategories.isActive} or ${inArray(productCategories.id, withFigures)})`
            : eq(productCategories.isActive, true),
      )
      .orderBy(asc(productCategories.brand), asc(productCategories.variety), desc(productCategories.sizeKg));

    return {
      products,
      cells: cells
        .filter((cell) => cell.sacks !== 0)
        .map((cell) => ({ product_category_id: cell.productId, date: cell.date, sacks: cell.sacks })),
    };
  });
}
