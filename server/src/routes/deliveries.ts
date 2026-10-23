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

const updateBody = createBody.extend({
  allowNegativeInventory: z.boolean().optional().default(false),
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The supplier must be an active local one, and every product active. */
async function assertDeliveryReferences(tx: Tx, input: z.infer<typeof createBody>) {
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
}

/**
 * Local suppliers deliver by truck, unannounced. There is no packing list and
 * no declared-versus-counted step: the load is counted as it comes off, logged
 * once, and moves stock immediately. A wrong count is corrected by editing the
 * delivery (only the difference moves stock) or by voiding it outright.
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
      await assertDeliveryReferences(tx, input);

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

  // Editing rewrites the lines and posts only the net change per product, so
  // the ledger shows the correction instead of a full reversal and re-entry.
  // Like a shipment edit, a change that would take stock below zero needs
  // allowNegativeInventory (the sacks may already have been sold).
  app.patch("/deliveries/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updateBody.parse(request.body);
    assertDistinct(
      input.items.map((item) => item.product_category_id),
      "A product can appear only once in a delivery",
    );
    const userId = request.currentUser!.id;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: localDeliveries.id,
          supplierId: localDeliveries.supplierId,
          dateReceived: localDeliveries.dateReceived,
          reference: localDeliveries.reference,
          notes: localDeliveries.notes,
          voidedAt: localDeliveries.voidedAt,
        })
        .from(localDeliveries)
        .where(eq(localDeliveries.id, id))
        .for("update");
      if (!existing) throw new ApiError(404, "DELIVERY_NOT_FOUND", "Delivery was not found");
      if (existing.voidedAt) {
        throw new ApiError(409, "DELIVERY_VOIDED", "A voided delivery cannot be edited");
      }

      await assertDeliveryReferences(tx, input);

      const oldItems = await tx
        .select({
          productCategoryId: localDeliveryItems.productCategoryId,
          qtySacks: localDeliveryItems.qtySacks,
          pricePerSack: localDeliveryItems.pricePerSack,
        })
        .from(localDeliveryItems)
        .where(eq(localDeliveryItems.localDeliveryId, id));

      // New sacks minus old sacks, per product.
      const delta = new Map<string, number>();
      for (const item of oldItems) {
        delta.set(item.productCategoryId, (delta.get(item.productCategoryId) ?? 0) - item.qtySacks);
      }
      for (const item of input.items) {
        delta.set(item.product_category_id, (delta.get(item.product_category_id) ?? 0) + item.qty_sacks);
      }
      // Sorted so concurrent writers take balance locks in the same order.
      const changed = [...delta.entries()]
        .filter(([, change]) => change !== 0)
        .sort(([a], [b]) => a.localeCompare(b));

      if (changed.length) {
        const balances = await tx
          .select({ id: stockBalances.productCategoryId, remaining: stockBalances.remainingQty })
          .from(stockBalances)
          .where(inArray(stockBalances.productCategoryId, changed.map(([productId]) => productId)))
          .orderBy(asc(stockBalances.productCategoryId))
          .for("update");
        const current = new Map(balances.map((balance) => [balance.id, balance.remaining]));
        const negative = changed
          .filter(([, change]) => change < 0)
          .map(([productId, change]) => ({ productId, balance: (current.get(productId) ?? 0) + change }))
          .filter((item) => item.balance < 0);
        if (negative.length && !input.allowNegativeInventory) {
          throw new ApiError(
            409,
            "NEGATIVE_INVENTORY_CONFIRMATION_REQUIRED",
            "This change will make inventory negative",
            negative,
          );
        }
      }

      await tx
        .update(localDeliveries)
        .set({
          supplierId: input.supplierId,
          dateReceived: input.dateReceived,
          reference: input.reference,
          // The form does not edit notes, so they are kept unless sent.
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(localDeliveries.id, id));

      await tx.delete(localDeliveryItems).where(eq(localDeliveryItems.localDeliveryId, id));
      await tx.insert(localDeliveryItems).values(
        input.items.map((item) => ({
          localDeliveryId: id,
          productCategoryId: item.product_category_id,
          qtySacks: item.qty_sacks,
          pricePerSack: item.price_per_sack,
        })),
      );

      const batchId = randomUUID();
      for (const [productId, change] of changed) {
        const [balance] = await tx
          .insert(stockBalances)
          .values({ productCategoryId: productId, remainingQty: change })
          .onConflictDoUpdate({
            target: stockBalances.productCategoryId,
            set: {
              remainingQty: sql`${stockBalances.remainingQty} + ${change}`,
              updatedAt: new Date(),
            },
          })
          .returning({ remainingQty: stockBalances.remainingQty });
        if (!balance) throw new ApiError(500, "STOCK_UPDATE_FAILED", "Stock balance was not updated");

        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: productId,
          movementType: change > 0 ? "INBOUND_LOCAL" : "LOCAL_REVERSAL",
          quantityDelta: change,
          balanceAfter: balance.remainingQty,
          localDeliveryId: id,
          note: "Delivery edited",
          createdBy: userId,
        });
      }

      // The audit log records what changed, not just the submitted form.
      (request as typeof request & { body: unknown }).body = {
        before: { delivery: existing, items: oldItems },
        after: input,
        stockChanges: changed.map(([productId, change]) => ({ productId, change })),
      };
    });

    return { id };
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
