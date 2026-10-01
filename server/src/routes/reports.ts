import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  containerItems,
  containers,
  localDeliveries,
  localDeliveryItems,
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

const range = {
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
};

const source = z.enum(["ALL", "SHIPMENT", "LOCAL"]).default("ALL");

const inboundQuery = z.object({ ...range, productIds: productIdList, source });
const receivingQuery = z.object({ ...range, supplierId: z.uuid().optional(), source });

function assertRange(query: { dateFrom: string; dateTo: string }) {
  if (query.dateFrom > query.dateTo) {
    throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
  }
}

/**
 * Received stock only, dated by when it physically came in: containers once
 * UNLOADED (counted sacks, on the unload date — the same date as their
 * INBOUND_UNLOAD movement) and local deliveries on the date received.
 * Pending and cancelled containers and voided deliveries never appear.
 */
const unloadedIn = (dateFrom: string, dateTo: string) =>
  and(
    eq(containers.status, "UNLOADED"),
    gte(containers.dateUnloaded, dateFrom),
    lte(containers.dateUnloaded, dateTo),
  );

const deliveredIn = (dateFrom: string, dateTo: string) =>
  and(
    isNull(localDeliveries.voidedAt),
    gte(localDeliveries.dateReceived, dateFrom),
    lte(localDeliveries.dateReceived, dateTo),
  );

type Cell = { productId: string; date: string; sacks: number };

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  /**
   * Stock summary: inbound sacks per product per arrival day, for the
   * timeframe grids. `products` lists every active product (or the
   * filtered ones) so the client can show a brand's quiet sizes as zeros.
   */
  app.get("/reports/inbound", warehouseOnly, async (request) => {
    const query = inboundQuery.parse(request.query);
    assertRange(query);
    const productFilter = (column: Parameters<typeof inArray>[0]) =>
      query.productIds.length ? inArray(column, query.productIds) : undefined;

    const shipmentCells = query.source === "LOCAL" ? [] : await db
      .select({
        productId: containerItems.productCategoryId,
        date: sql<string>`${containers.dateUnloaded}`,
        sacks: sql<number>`coalesce(sum(${containerItems.actualQtySacks}), 0)::int`,
      })
      .from(containerItems)
      .innerJoin(containers, eq(containerItems.containerId, containers.id))
      .where(and(unloadedIn(query.dateFrom, query.dateTo), productFilter(containerItems.productCategoryId)))
      .groupBy(containerItems.productCategoryId, containers.dateUnloaded);
    const localCells = query.source === "SHIPMENT" ? [] : await db
      .select({
        productId: localDeliveryItems.productCategoryId,
        date: localDeliveries.dateReceived,
        sacks: sql<number>`sum(${localDeliveryItems.qtySacks})::int`,
      })
      .from(localDeliveryItems)
      .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
      .where(and(deliveredIn(query.dateFrom, query.dateTo), productFilter(localDeliveryItems.productCategoryId)))
      .groupBy(localDeliveryItems.productCategoryId, localDeliveries.dateReceived);

    // A product can arrive both ways on one day; merge them into one cell.
    const merged = new Map<string, Cell>();
    for (const cell of [...shipmentCells, ...localCells]) {
      const key = `${cell.productId}|${cell.date}`;
      const current = merged.get(key);
      if (current) current.sacks += cell.sacks;
      else merged.set(key, { ...cell });
    }
    const cells = [...merged.values()].filter((cell) => cell.sacks !== 0);

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
      cells: cells.map((cell) => ({ product_category_id: cell.productId, date: cell.date, sacks: cell.sacks })),
    };
  });

  /**
   * Receiving: every line received in the range, for one supplier or all,
   * sorted by supplier then date. Shipments by unload date with declared vs
   * counted; local deliveries by date received, where the two are the same.
   */
  app.get("/reports/receiving", warehouseOnly, async (request) => {
    const query = receivingQuery.parse(request.query);
    assertRange(query);
    const product = {
      product_category_id: productCategories.id,
      brand: productCategories.brand,
      variety: productCategories.variety,
      code: productCategories.code,
      size_kg: productCategories.sizeKg,
    };

    const shipmentRows = query.source === "LOCAL" ? [] : await db
      .select({
        line_id: containerItems.id,
        supplier_id: suppliers.id,
        supplier: suppliers.name,
        date: sql<string>`${containers.dateUnloaded}`,
        reference: shipments.reference,
        container_no: containers.containerNo,
        ...product,
        declared_qty: containerItems.qtySacks,
        actual_qty: sql<number>`coalesce(${containerItems.actualQtySacks}, 0)::int`,
        price_per_sack: containerItems.pricePerSack,
      })
      .from(containerItems)
      .innerJoin(containers, eq(containerItems.containerId, containers.id))
      .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .innerJoin(productCategories, eq(containerItems.productCategoryId, productCategories.id))
      .where(and(
        unloadedIn(query.dateFrom, query.dateTo),
        query.supplierId ? eq(suppliers.id, query.supplierId) : undefined,
      ));

    const localRows = query.source === "SHIPMENT" ? [] : await db
      .select({
        line_id: localDeliveryItems.id,
        supplier_id: suppliers.id,
        supplier: suppliers.name,
        date: localDeliveries.dateReceived,
        reference: localDeliveries.reference,
        ...product,
        qty: localDeliveryItems.qtySacks,
        price_per_sack: localDeliveryItems.pricePerSack,
      })
      .from(localDeliveryItems)
      .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
      .innerJoin(suppliers, eq(localDeliveries.supplierId, suppliers.id))
      .innerJoin(productCategories, eq(localDeliveryItems.productCategoryId, productCategories.id))
      .where(and(
        deliveredIn(query.dateFrom, query.dateTo),
        query.supplierId ? eq(suppliers.id, query.supplierId) : undefined,
      ));

    const value = (qty: number, price: number | null) =>
      price === null ? null : Math.round(qty * price * 100) / 100;

    return [
      ...shipmentRows.map((row) => ({
        ...row,
        source: "SHIPMENT" as const,
        variance: row.actual_qty - row.declared_qty,
        value: value(row.actual_qty, row.price_per_sack),
      })),
      ...localRows.map(({ qty, ...row }) => ({
        ...row,
        source: "LOCAL" as const,
        container_no: null,
        declared_qty: qty,
        actual_qty: qty,
        variance: 0,
        value: value(qty, row.price_per_sack),
      })),
    ].sort((a, b) =>
      a.supplier.localeCompare(b.supplier)
      || a.date.localeCompare(b.date)
      || a.brand.localeCompare(b.brand)
      || a.size_kg - b.size_kg);
  });
}
