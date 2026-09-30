import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  localDeliveries,
  localDeliveryItems,
  productCategories,
  stockBalances,
  stockMovements,
  suppliers,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const isoDate = z.iso.date();
const idParams = z.object({ id: z.uuid() });

const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: isoDate,
  dateTo: isoDate,
  supplierId: z.uuid().optional(),
  includeVoided: z.stringbool().optional().default(false),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const createBody = z.object({
  supplierId: z.uuid(),
  dateReceived: isoDate,
  reference: z.string().trim().max(500).nullable().default(null),
  notes: z.string().trim().max(2_000).nullable().optional(),
  items: z
    .array(
      z.object({
        product_category_id: z.uuid(),
        qty_sacks: z.number().int().positive(),
        price_per_sack: z.number().nonnegative().nullable(),
      }),
    )
    .min(1),
});

const voidBody = z.object({ reason: z.string().trim().min(3).max(2_000) });

function pageResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = grouped.get(key);
    if (current) current.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

function assertDistinct(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new ApiError(400, "DUPLICATE_PRODUCT", message);
  }
}

/**
 * Local suppliers deliver by truck, unannounced. There is no packing list and
 * no declared-versus-counted step: the load is counted as it comes off, logged
 * once, and moves stock immediately. Corrections are voids, not edits.
 */
export async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get("/deliveries", warehouseOnly, async (request) => {
    const query = listQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }

    const filters = [
      gte(localDeliveries.dateReceived, query.dateFrom),
      lte(localDeliveries.dateReceived, query.dateTo),
      ...(query.supplierId ? [eq(localDeliveries.supplierId, query.supplierId)] : []),
      ...(query.includeVoided ? [] : [sql`${localDeliveries.voidedAt} is null`]),
    ];
    const where = and(...filters);

    const [countRow] = await db
      .select({ value: count() })
      .from(localDeliveries)
      .where(where);
    const total = countRow?.value ?? 0;

    const deliveryRows = await db
      .select({
        id: localDeliveries.id,
        date_received: localDeliveries.dateReceived,
        reference: localDeliveries.reference,
        notes: localDeliveries.notes,
        voided_at: localDeliveries.voidedAt,
        void_reason: localDeliveries.voidReason,
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          code: suppliers.code,
        },
      })
      .from(localDeliveries)
      .innerJoin(suppliers, eq(localDeliveries.supplierId, suppliers.id))
      .where(where)
      .orderBy(
        query.sortDir === "asc"
          ? asc(localDeliveries.dateReceived)
          : desc(localDeliveries.dateReceived),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    if (!deliveryRows.length) return pageResult([], total, query.page, query.pageSize);

    // Same stitch-in-memory shape as GET /shipments.
    const itemRows = await db
      .select({
        id: localDeliveryItems.id,
        localDeliveryId: localDeliveryItems.localDeliveryId,
        qty_sacks: localDeliveryItems.qtySacks,
        price_per_sack: localDeliveryItems.pricePerSack,
        product_category: {
          id: productCategories.id,
          brand: productCategories.brand,
          variety: productCategories.variety,
          code: productCategories.code,
          size_kg: productCategories.sizeKg,
        },
      })
      .from(localDeliveryItems)
      .innerJoin(
        productCategories,
        eq(localDeliveryItems.productCategoryId, productCategories.id),
      )
      .where(
        inArray(
          localDeliveryItems.localDeliveryId,
          deliveryRows.map((row) => row.id),
        ),
      )
      .orderBy(asc(localDeliveryItems.createdAt));

    const itemsByDelivery = groupBy(itemRows, (row) => row.localDeliveryId);

    return pageResult(
      deliveryRows.map((row) => ({
        ...row,
        items: (itemsByDelivery.get(row.id) ?? []).map(
          ({ localDeliveryId: _localDeliveryId, ...item }) => item,
        ),
      })),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.post("/deliveries", warehouseOnly, async (request, reply) => {
    const input = createBody.parse(request.body);
    assertDistinct(
      input.items.map((item) => item.product_category_id),
      "A product can appear only once in a delivery",
    );

    const deliveryId = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ kind: suppliers.kind })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.isActive, true)))
        .limit(1);
      if (!supplier) {
        throw new ApiError(400, "UNKNOWN_SUPPLIER", "Supplier does not exist or is inactive");
      }
      if (supplier.kind !== "LOCAL") {
        throw new ApiError(
          400,
          "SUPPLIER_NOT_LOCAL",
          "Only local suppliers deliver this way; international suppliers go through a shipment",
        );
      }

      const productIds = input.items.map((item) => item.product_category_id);
      const products = await tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(
          and(
            inArray(productCategories.id, productIds),
            eq(productCategories.isActive, true),
          ),
        );
      if (products.length !== productIds.length) {
        throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more products do not exist or are inactive");
      }

      const [created] = await tx
        .insert(localDeliveries)
        .values({
          supplierId: input.supplierId,
          dateReceived: input.dateReceived,
          reference: input.reference,
          notes: input.notes ?? null,
          createdBy: request.currentUser!.id,
        })
        .returning({ id: localDeliveries.id });
      if (!created) throw new ApiError(500, "CREATE_FAILED", "Delivery was not created");

      await tx.insert(localDeliveryItems).values(
        input.items.map((item) => ({
          localDeliveryId: created.id,
          productCategoryId: item.product_category_id,
          qtySacks: item.qty_sacks,
          pricePerSack: item.price_per_sack,
        })),
      );

      // One batch_id for the delivery, so its movements group together.
      const batchId = randomUUID();
      // Sorted so concurrent writers take balance locks in the same order.
      for (const item of [...input.items].sort((a, b) =>
        a.product_category_id.localeCompare(b.product_category_id),
      )) {
        const [balance] = await tx
          .insert(stockBalances)
          .values({
            productCategoryId: item.product_category_id,
            remainingQty: item.qty_sacks,
          })
          .onConflictDoUpdate({
            target: stockBalances.productCategoryId,
            set: {
              remainingQty: sql`${stockBalances.remainingQty} + ${item.qty_sacks}`,
              updatedAt: new Date(),
            },
          })
          .returning({ remainingQty: stockBalances.remainingQty });
        if (!balance) throw new ApiError(500, "STOCK_UPDATE_FAILED", "Stock balance was not updated");

        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.product_category_id,
          movementType: "INBOUND_LOCAL",
          quantityDelta: item.qty_sacks,
          balanceAfter: balance.remainingQty,
          localDeliveryId: created.id,
          occurredAt: new Date(`${input.dateReceived}T12:00:00Z`),
          createdBy: request.currentUser!.id,
        });
      }

      return created.id;
    });

    return reply.code(201).send({ id: deliveryId });
  });

  // Voiding reverses the stock it added. If those sacks have since been sold
  // the reversal would drive a balance negative, so it is refused rather than
  // silently absorbed.
  app.post("/deliveries/:id/void", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const { reason } = voidBody.parse(request.body);

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${localDeliveries} where ${localDeliveries.id} = ${id} for update`,
      );
      const [delivery] = await tx
        .select({ voidedAt: localDeliveries.voidedAt })
        .from(localDeliveries)
        .where(eq(localDeliveries.id, id))
        .limit(1);
      if (!delivery) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Delivery was not found");
      if (delivery.voidedAt) {
        throw new ApiError(409, "ALREADY_VOIDED", "This delivery is already voided");
      }

      const items = await tx
        .select({
          productCategoryId: localDeliveryItems.productCategoryId,
          qtySacks: localDeliveryItems.qtySacks,
        })
        .from(localDeliveryItems)
        .where(eq(localDeliveryItems.localDeliveryId, id))
        .orderBy(asc(localDeliveryItems.productCategoryId));

      const batchId = randomUUID();
      for (const item of items) {
        const [balance] = await tx
          .update(stockBalances)
          .set({
            remainingQty: sql`${stockBalances.remainingQty} - ${item.qtySacks}`,
            updatedAt: new Date(),
          })
          .where(eq(stockBalances.productCategoryId, item.productCategoryId))
          .returning({ remainingQty: stockBalances.remainingQty });
        if (!balance || balance.remainingQty < 0) {
          throw new ApiError(
            409,
            "INSUFFICIENT_STOCK",
            "Those sacks have already left the warehouse, so this delivery cannot be voided",
          );
        }

        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.productCategoryId,
          movementType: "LOCAL_REVERSAL",
          quantityDelta: -item.qtySacks,
          balanceAfter: balance.remainingQty,
          localDeliveryId: id,
          createdBy: request.currentUser!.id,
        });
      }

      await tx
        .update(localDeliveries)
        .set({
          voidedAt: new Date(),
          voidedBy: request.currentUser!.id,
          voidReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(localDeliveries.id, id));
    });

    return { id, voided: true as const };
  });
}
