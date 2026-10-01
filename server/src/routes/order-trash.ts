import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  appUsers,
  cashiers,
  orderSlipItems,
  orderSlips,
  stockBalances,
  stockMovements,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";
import { getItemRows, groupBy, slipColumns, toApiItem, toApiSlip, type Tx } from "./orders.js";

/** How long a slip sits in Trash before it is emptied automatically. */
export const TRASH_RETENTION_DAYS = 30;

const idParams = z.object({ id: z.uuid() });
const trashQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
});

/** In Trash: deleted, and not yet emptied out of it. */
const inTrash = and(isNotNull(orderSlips.deletedAt), isNull(orderSlips.purgedAt));

/** Locks the slip row and returns what delete and restore need from it. */
async function lockSlip(tx: Tx, id: string) {
  await tx.execute(sql`select id from ${orderSlips} where ${orderSlips.id} = ${id} for update`);
  const [slip] = await tx
    .select({
      revision: orderSlips.revision,
      deletedAt: orderSlips.deletedAt,
      purgedAt: orderSlips.purgedAt,
    })
    .from(orderSlips)
    .where(eq(orderSlips.id, id));
  if (!slip || slip.purgedAt) throw new ApiError(404, "ORDER_SLIP_NOT_FOUND", "Order slip was not found");
  const items = await tx
    .select({ productId: orderSlipItems.productCategoryId, quantity: orderSlipItems.quantity })
    .from(orderSlipItems)
    .where(eq(orderSlipItems.orderSlipId, id));
  // Same lock order as the order routes: stock_balance rows by product id.
  items.sort((a, b) => a.productId.localeCompare(b.productId));
  return { ...slip, items };
}

/**
 * Marks every slip in Trash that is older than the retention period as
 * emptied. Run on a timer by the server; safe to run any number of times.
 */
export async function purgeExpiredOrderSlips(): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const purged = await db
    .update(orderSlips)
    .set({ purgedAt: new Date() })
    .where(and(inTrash, lt(orderSlips.deletedAt, cutoff)))
    .returning({ id: orderSlips.id });
  return purged.length;
}

export async function orderTrashRoutes(app: FastifyInstance): Promise<void> {
  const posOnly = { preHandler: requireRole("pos_admin") };

  /**
   * Moves a slip to Trash. Its sacks go back on the shelf straight away, as
   * an ORDER_REVERSAL against its current revision. Paid slips can be
   * deleted too: Trash is how a slip entered by mistake is taken back.
   */
  app.delete("/order-slips/:id", posOnly, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await db.transaction(async (tx) => {
      const slip = await lockSlip(tx, id);
      if (slip.deletedAt) throw new ApiError(409, "ORDER_SLIP_IN_TRASH", "Order slip is already in Trash");

      const batchId = randomUUID();
      for (const item of slip.items) {
        const [balance] = await tx
          .update(stockBalances)
          .set({ remainingQty: sql`${stockBalances.remainingQty} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(stockBalances.productCategoryId, item.productId))
          .returning({ quantity: stockBalances.remainingQty });
        if (!balance) throw new ApiError(500, "STOCK_BALANCE_MISSING", "Stock balance row is missing");
        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.productId,
          movementType: "ORDER_REVERSAL",
          quantityDelta: item.quantity,
          balanceAfter: balance.quantity,
          orderSlipId: id,
          orderRevision: slip.revision,
          note: "Order slip moved to Trash",
          createdBy: request.currentUser!.id,
        });
      }

      await tx
        .update(orderSlips)
        .set({ deletedAt: new Date(), deletedBy: request.currentUser!.id })
        .where(eq(orderSlips.id, id));
    });
    return reply.code(204).send();
  });

  /**
   * Takes a slip back out of Trash and deducts its sacks again, as a new
   * revision. Refused if any product no longer has enough stock.
   */
  app.post("/order-slips/:id/restore", posOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    await db.transaction(async (tx) => {
      const slip = await lockSlip(tx, id);
      if (!slip.deletedAt) throw new ApiError(409, "ORDER_SLIP_NOT_IN_TRASH", "Order slip is not in Trash");

      const productIds = slip.items.map((item) => item.productId);
      const balances = productIds.length
        ? await tx
          .select({ productId: stockBalances.productCategoryId, quantity: stockBalances.remainingQty })
          .from(stockBalances)
          .where(inArray(stockBalances.productCategoryId, productIds))
          .orderBy(asc(stockBalances.productCategoryId))
          .for("update")
        : [];
      const available = new Map(balances.map((row) => [row.productId, row.quantity]));
      for (const item of slip.items) {
        const quantity = available.get(item.productId) ?? 0;
        if (item.quantity > quantity) {
          throw new ApiError(
            409,
            "INSUFFICIENT_STOCK",
            `Only ${quantity} sacks are available, so this slip can't be restored`,
            { productId: item.productId, available: quantity },
          );
        }
      }

      const newRevision = slip.revision + 1;
      const batchId = randomUUID();
      for (const item of slip.items) {
        const next = available.get(item.productId)! - item.quantity;
        await tx
          .update(stockBalances)
          .set({ remainingQty: next, updatedAt: new Date() })
          .where(eq(stockBalances.productCategoryId, item.productId));
        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.productId,
          movementType: "OUTBOUND_ORDER",
          quantityDelta: -item.quantity,
          balanceAfter: next,
          orderSlipId: id,
          orderRevision: newRevision,
          note: "Order slip restored from Trash",
          createdBy: request.currentUser!.id,
        });
      }

      await tx
        .update(orderSlips)
        .set({
          deletedAt: null,
          deletedBy: null,
          revision: newRevision,
          updatedBy: request.currentUser!.id,
          updatedAt: new Date(),
        })
        .where(eq(orderSlips.id, id));
    });
    return { id };
  });

  app.get("/order-slips/trash", posOnly, async (request) => {
    const query = trashQuery.parse(request.query);
    const pattern = query.search ? `%${query.search}%` : undefined;
    const where = and(
      inTrash,
      pattern
        ? or(
          ilike(orderSlips.orderBy, pattern),
          ilike(cashiers.name, pattern),
          sql`${orderSlips.slipNumber}::text ilike ${pattern}`,
        )
        : undefined,
    );
    const [countRow] = await db
      .select({ value: count() })
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .where(where);
    const slips = await db
      .select({
        ...slipColumns,
        deletedAt: orderSlips.deletedAt,
        deletedByEmail: appUsers.email,
        purgeAt: sql<string>`${orderSlips.deletedAt} + make_interval(days => ${TRASH_RETENTION_DAYS})`,
      })
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .leftJoin(appUsers, eq(orderSlips.deletedBy, appUsers.id))
      .where(where)
      .orderBy(desc(orderSlips.deletedAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const itemsBySlip = groupBy(await getItemRows(slips.map((row) => row.id)), (row) => row.orderSlipId);
    const total = countRow?.value ?? 0;
    return {
      rows: slips.map(({ deletedAt, deletedByEmail, purgeAt, ...slip }) => ({
        ...toApiSlip(slip),
        items: (itemsBySlip.get(slip.id) ?? []).map(toApiItem),
        deletedAt,
        deletedBy: deletedByEmail,
        purgeAt: new Date(purgeAt).toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  });

  /** Empties the whole Trash. Emptied slips are kept for the stock ledger, never shown. */
  app.delete("/order-slips/trash", posOnly, async () => {
    const purged = await db
      .update(orderSlips)
      .set({ purgedAt: new Date() })
      .where(inTrash)
      .returning({ id: orderSlips.id });
    return { purged: purged.length };
  });

  /** Permanently removes one slip from Trash. */
  app.delete("/order-slips/trash/:id", posOnly, async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const [purged] = await db
      .update(orderSlips)
      .set({ purgedAt: new Date() })
      .where(and(eq(orderSlips.id, id), inTrash))
      .returning({ id: orderSlips.id });
    if (!purged) throw new ApiError(404, "ORDER_SLIP_NOT_IN_TRASH", "Order slip is not in Trash");
    return reply.code(204).send();
  });
}
