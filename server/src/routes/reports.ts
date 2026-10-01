import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  containerItems,
  containers,
  localDeliveries,
  localDeliveryItems,
  productCategories,
  shipments,
  stockBalances,
  stockMovements,
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

const stockSummaryQuery = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  productIds: productIdList,
});

const receivingQuery = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  productIds: productIdList,
  shipmentId: z.uuid().optional(),
  source: z.enum(["ALL", "SHIPMENT", "LOCAL"]).default("ALL"),
});

function assertRange(query: { dateFrom: string; dateTo: string }) {
  if (query.dateFrom > query.dateTo) {
    throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
  }
}

/**
 * Same day boundaries as GET /stock/movements, so the two pages agree. ISO
 * strings, cast in SQL: raw sql templates don't serialize Date parameters.
 */
const dayStart = (date: string) => sql`${`${date}T00:00:00Z`}::timestamptz`;
const dayEnd = (date: string) => sql`${`${date}T23:59:59.999Z`}::timestamptz`;

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
   * One row per product: its balance at the start and end of the period and
   * what moved it in between, from the stock ledger. Closing is today's
   * balance minus everything after the period, so it holds for past periods.
   * Order and delivery reversals are netted into sold and received.
   */
  app.get("/reports/stock-summary", warehouseOnly, async (request) => {
    const query = stockSummaryQuery.parse(request.query);
    assertRange(query);
    const from = dayStart(query.dateFrom);
    const to = dayEnd(query.dateTo);
    const inPeriod = sql`${stockMovements.occurredAt} between ${from} and ${to}`;
    const sumWhere = (condition: ReturnType<typeof sql>) =>
      sql<number>`coalesce(sum(${stockMovements.quantityDelta}) filter (where ${condition}), 0)::int`;

    const moved = db
      .select({
        productId: stockMovements.productCategoryId,
        net: sumWhere(inPeriod).as("net"),
        after: sumWhere(sql`${stockMovements.occurredAt} > ${to}`).as("after"),
        shipments: sumWhere(sql`${inPeriod} and ${stockMovements.movementType} = 'INBOUND_UNLOAD'`).as("shipments"),
        local: sumWhere(sql`${inPeriod} and ${stockMovements.movementType} in ('INBOUND_LOCAL', 'LOCAL_REVERSAL')`).as("local"),
        orders: sumWhere(sql`${inPeriod} and ${stockMovements.movementType} in ('OUTBOUND_ORDER', 'ORDER_REVERSAL')`).as("orders"),
        adjustments: sumWhere(sql`${inPeriod} and ${stockMovements.movementType} in ('MANUAL_ADJUSTMENT', 'OPENING_BALANCE')`).as("adjustments"),
        movementCount: sql<number>`(count(*) filter (where ${inPeriod}))::int`.as("movement_count"),
      })
      .from(stockMovements)
      .groupBy(stockMovements.productCategoryId)
      .as("moved");

    const rows = await db
      .select({
        productId: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        code: productCategories.code,
        sizeKg: productCategories.sizeKg,
        current: stockBalances.remainingQty,
        net: sql<number>`coalesce(${moved.net}, 0)::int`,
        after: sql<number>`coalesce(${moved.after}, 0)::int`,
        shipments: sql<number>`coalesce(${moved.shipments}, 0)::int`,
        local: sql<number>`coalesce(${moved.local}, 0)::int`,
        orders: sql<number>`coalesce(${moved.orders}, 0)::int`,
        adjustments: sql<number>`coalesce(${moved.adjustments}, 0)::int`,
        movementCount: sql<number>`coalesce(${moved.movementCount}, 0)::int`,
      })
      .from(productCategories)
      .innerJoin(stockBalances, eq(stockBalances.productCategoryId, productCategories.id))
      .leftJoin(moved, eq(moved.productId, productCategories.id))
      .where(query.productIds.length ? inArray(productCategories.id, query.productIds) : undefined)
      .orderBy(asc(productCategories.brand), asc(productCategories.variety), asc(productCategories.sizeKg));

    return rows
      .map((row) => {
        const closing = row.current - row.after;
        return {
          product_category_id: row.productId,
          brand: row.brand,
          variety: row.variety,
          code: row.code,
          size_kg: row.sizeKg,
          opening: closing - row.net,
          received_shipments: row.shipments,
          received_local: row.local,
          sold: -row.orders,
          adjustments: row.adjustments,
          closing,
          movement_count: row.movementCount,
        };
      })
      // Without a product filter, skip products that had nothing to report.
      .filter((row) => query.productIds.length || row.movement_count > 0 || row.opening !== 0 || row.closing !== 0);
  });

  /**
   * Every line received in the period: container items from shipments (by
   * the packing list's date) and local deliveries (by date received). A
   * shipment filter shows that whole shipment, whatever the period.
   * Cancelled containers and voided deliveries are left out.
   */
  app.get("/reports/receiving", warehouseOnly, async (request) => {
    const query = receivingQuery.parse(request.query);
    assertRange(query);
    const productFilter = <T extends typeof containerItems.productCategoryId | typeof localDeliveryItems.productCategoryId>(column: T) =>
      query.productIds.length ? inArray(column, query.productIds) : undefined;

    const shipmentRows = query.source === "LOCAL" ? [] : await db
      .select({
        lineId: containerItems.id,
        reference: shipments.reference,
        date: shipments.dateListReceived,
        supplier: suppliers.name,
        containerNo: containers.containerNo,
        status: containers.status,
        dateUnloaded: containers.dateUnloaded,
        productId: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        code: productCategories.code,
        sizeKg: productCategories.sizeKg,
        declaredQty: containerItems.qtySacks,
        actualQty: containerItems.actualQtySacks,
        pricePerSack: containerItems.pricePerSack,
      })
      .from(containerItems)
      .innerJoin(containers, eq(containerItems.containerId, containers.id))
      .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .innerJoin(productCategories, eq(containerItems.productCategoryId, productCategories.id))
      .where(and(
        ne(containers.status, "CANCELLED"),
        query.shipmentId
          ? eq(shipments.id, query.shipmentId)
          : and(gte(shipments.dateListReceived, query.dateFrom), lte(shipments.dateListReceived, query.dateTo)),
        productFilter(containerItems.productCategoryId),
      ))
      .orderBy(asc(shipments.dateListReceived), asc(containers.containerNo), asc(productCategories.brand), asc(productCategories.sizeKg));

    const localRows = query.source === "SHIPMENT" || query.shipmentId ? [] : await db
      .select({
        lineId: localDeliveryItems.id,
        reference: localDeliveries.reference,
        date: localDeliveries.dateReceived,
        supplier: suppliers.name,
        productId: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        code: productCategories.code,
        sizeKg: productCategories.sizeKg,
        qty: localDeliveryItems.qtySacks,
        pricePerSack: localDeliveryItems.pricePerSack,
      })
      .from(localDeliveryItems)
      .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
      .innerJoin(suppliers, eq(localDeliveries.supplierId, suppliers.id))
      .innerJoin(productCategories, eq(localDeliveryItems.productCategoryId, productCategories.id))
      .where(and(
        sql`${localDeliveries.voidedAt} is null`,
        gte(localDeliveries.dateReceived, query.dateFrom),
        lte(localDeliveries.dateReceived, query.dateTo),
        productFilter(localDeliveryItems.productCategoryId),
      ))
      .orderBy(asc(localDeliveries.dateReceived), asc(productCategories.brand), asc(productCategories.sizeKg));

    const value = (qty: number | null, price: number | null) =>
      qty === null || price === null ? null : Math.round(qty * price * 100) / 100;

    const product = (row: { productId: string; brand: string; variety: string | null; code: string | null; sizeKg: number }) => ({
      product_category_id: row.productId,
      brand: row.brand,
      variety: row.variety,
      code: row.code,
      size_kg: row.sizeKg,
    });

    return [
      ...shipmentRows.map((row) => ({
        line_id: row.lineId,
        source: "SHIPMENT" as const,
        reference: row.reference,
        date: row.date,
        supplier: row.supplier,
        container_no: row.containerNo,
        status: row.status,
        date_unloaded: row.dateUnloaded,
        ...product(row),
        declared_qty: row.declaredQty,
        // Counted only once unloaded; until then the declared figure stands alone.
        actual_qty: row.actualQty,
        variance: row.actualQty === null ? null : row.actualQty - row.declaredQty,
        price_per_sack: row.pricePerSack,
        value: value(row.actualQty ?? row.declaredQty, row.pricePerSack),
      })),
      ...localRows.map((row) => ({
        line_id: row.lineId,
        source: "LOCAL" as const,
        reference: row.reference,
        date: row.date,
        supplier: row.supplier,
        container_no: null,
        status: null,
        date_unloaded: null,
        ...product(row),
        declared_qty: row.qty,
        actual_qty: row.qty,
        variance: 0,
        price_per_sack: row.pricePerSack,
        value: value(row.qty, row.pricePerSack),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
  });
}
