import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  cashiers,
  orderSlipItems,
  orderSlips,
  productCategories,
  stockBalances,
  stockMovements,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const idParams = z.object({ id: z.uuid() });
const orderQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  search: z.string().trim().max(200).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  cashierId: z.uuid().optional(),
});

const summaryQuery = z.object({
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
});

const orderBody = z.object({
  date: z.iso.date(),
  orderBy: z.string().trim().min(1).max(500),
  address: z.string().trim().max(2_000).default(""),
  status: z.enum(["paid", "unpaid", "partial"]),
  paymentDueDate: z.iso.date(),
  cashierId: z.uuid(),
  items: z.array(z.object({
    productId: z.uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
});

type OrderItemRow = {
  id: string;
  orderSlipId: string;
  quantity: number;
  productId: string;
  brand: string;
  variety: string | null;
  sizeKg: number;
  unitPrice: number;
  stockQuantity: number;
};

function variant(variety: string | null, sizeKg: number): string {
  return [variety, `${sizeKg}kg`].filter(Boolean).join(" ");
}

function toApiItem(row: OrderItemRow) {
  return {
    id: row.id,
    quantity: row.quantity,
    article: {
      id: row.productId,
      brand: row.brand,
      variant: variant(row.variety, row.sizeKg),
      unitPrice: row.unitPrice,
      quantity: row.stockQuantity,
    },
  };
}

function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = result.get(key);
    if (current) current.push(row);
    else result.set(key, [row]);
  }
  return result;
}

function assertOrderInput(input: z.infer<typeof orderBody>): void {
  if (input.paymentDueDate < input.date) {
    throw new ApiError(400, "INVALID_DUE_DATE", "Payment due date cannot be before the order date");
  }
  const ids = input.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, "DUPLICATE_PRODUCT", "A product can appear only once on an order slip");
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Next slip number for `date`. Numbers restart at 1 each day.
 *
 * The advisory lock serializes numbering per day until the transaction ends,
 * so two slips saved at once can't both read the same max. Callers take it
 * after their stock_balance row locks, in the same order everywhere, so the
 * two kinds of lock can't deadlock each other. The (date, slip_number)
 * unique index is the backstop.
 */
async function nextSlipNumber(tx: Tx, date: string): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order_slip_number:${date}`}))`);
  const [row] = await tx
    .select({ value: sql<number>`coalesce(max(${orderSlips.slipNumber}), 0)::int` })
    .from(orderSlips)
    .where(eq(orderSlips.date, date));
  return (row?.value ?? 0) + 1;
}

/**
 * The slip's cashier must exist, and must be active unless the slip already
 * had them (so editing an old slip doesn't force a reassignment).
 */
async function assertCashier(tx: Tx, cashierId: string, currentCashierId?: string): Promise<void> {
  const [cashier] = await tx
    .select({ isActive: cashiers.isActive })
    .from(cashiers)
    .where(eq(cashiers.id, cashierId))
    .limit(1);
  if (!cashier) throw new ApiError(400, "UNKNOWN_CASHIER", "Cashier does not exist");
  if (!cashier.isActive && cashierId !== currentCashierId) {
    throw new ApiError(409, "CASHIER_INACTIVE", "That cashier is no longer active");
  }
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getItemRows(orderSlipIds: string[]): Promise<OrderItemRow[]> {
  if (!orderSlipIds.length) return [];
  return db
    .select({
      id: orderSlipItems.id,
      orderSlipId: orderSlipItems.orderSlipId,
      quantity: orderSlipItems.quantity,
      productId: productCategories.id,
      brand: productCategories.brand,
      variety: productCategories.variety,
      sizeKg: productCategories.sizeKg,
      unitPrice: orderSlipItems.unitPrice,
      stockQuantity: stockBalances.remainingQty,
    })
    .from(orderSlipItems)
    .innerJoin(productCategories, eq(orderSlipItems.productCategoryId, productCategories.id))
    .innerJoin(stockBalances, eq(stockBalances.productCategoryId, productCategories.id))
    .where(inArray(orderSlipItems.orderSlipId, orderSlipIds))
    .orderBy(asc(orderSlipItems.createdAt));
}

const slipColumns = {
  id: orderSlips.id,
  slipNumber: orderSlips.slipNumber,
  date: orderSlips.date,
  orderBy: orderSlips.orderBy,
  address: orderSlips.address,
  status: orderSlips.status,
  paymentDueDate: orderSlips.paymentDueDate,
  totalAmount: orderSlips.totalAmount,
  cashierId: cashiers.id,
  cashierName: cashiers.name,
  cashierActive: cashiers.isActive,
};

type SlipRow = {
  [K in keyof typeof slipColumns]: (typeof slipColumns)[K]["_"]["data"];
};

function toApiSlip({ cashierId, cashierName, cashierActive, ...slip }: SlipRow) {
  return { ...slip, cashier: { id: cashierId, name: cashierName, isActive: cashierActive } };
}

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  const posOnly = { preHandler: requireRole("pos_admin") };

  app.get("/pos/products", posOnly, async () => {
    const rows = await db
      .select({
        id: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        sizeKg: productCategories.sizeKg,
        unitPrice: productCategories.sellingPrice,
        quantity: stockBalances.remainingQty,
      })
      .from(productCategories)
      .innerJoin(stockBalances, eq(stockBalances.productCategoryId, productCategories.id))
      .where(and(eq(productCategories.isActive, true), eq(productCategories.isAvailable, true)))
      .orderBy(asc(productCategories.brand), asc(productCategories.variety), asc(productCategories.sizeKg));

    return rows
      .filter((row): row is typeof row & { unitPrice: number } => row.unitPrice !== null)
      .map((row) => ({
        id: row.id,
        brand: row.brand,
        variant: variant(row.variety, row.sizeKg),
        unitPrice: row.unitPrice,
        quantity: row.quantity,
      }));
  });

  app.get("/order-slips", posOnly, async (request) => {
    const query = orderQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }
    const pattern = query.search ? `%${query.search}%` : undefined;
    const searchFilter = pattern
      ? or(
        ilike(orderSlips.orderBy, pattern),
        ilike(cashiers.name, pattern),
        sql`${orderSlips.slipNumber}::text ilike ${pattern}`,
      )
      : undefined;
    const where = and(
      gte(orderSlips.date, query.dateFrom),
      lte(orderSlips.date, query.dateTo),
      query.cashierId ? eq(orderSlips.cashierId, query.cashierId) : undefined,
      searchFilter,
    );
    const [countRow] = await db
      .select({ value: count() })
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .where(where);
    const order = query.sortDir === "asc" ? asc : desc;
    const slips = await db
      .select(slipColumns)
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .where(where)
      // Numbers restart daily, so they only order slips within one date.
      .orderBy(order(orderSlips.date), order(orderSlips.slipNumber))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const itemsBySlip = groupBy(await getItemRows(slips.map((row) => row.id)), (row) => row.orderSlipId);
    return {
      rows: slips.map((slip) => ({
        ...toApiSlip(slip),
        items: (itemsBySlip.get(slip.id) ?? []).map(toApiItem),
      })),
      total: countRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil((countRow?.value ?? 0) / query.pageSize)),
    };
  });

  /**
   * One group per (slip date, cashier) with at least one slip in the range.
   * `paidAmount` sums fully paid slips only: partial slips don't record how
   * much has been paid, so they count toward `totalAmount` but not here.
   */
  app.get("/order-slips/summary", posOnly, async (request) => {
    const query = summaryQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }
    const inRange = and(gte(orderSlips.date, query.dateFrom), lte(orderSlips.date, query.dateTo));
    const statusCount = (status: "paid" | "partial" | "unpaid") =>
      sql<number>`(count(*) filter (where ${orderSlips.status} = ${status}))::int`;

    const groups = await db
      .select({
        date: orderSlips.date,
        cashierId: cashiers.id,
        cashierName: cashiers.name,
        cashierActive: cashiers.isActive,
        slipCount: sql<number>`count(*)::int`,
        paid: statusCount("paid"),
        partial: statusCount("partial"),
        unpaid: statusCount("unpaid"),
        totalAmount: sql<number>`coalesce(sum(${orderSlips.totalAmount}), 0)::float8`,
        paidAmount: sql<number>`coalesce(sum(${orderSlips.totalAmount}) filter (where ${orderSlips.status} = 'paid'), 0)::float8`,
      })
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .where(inRange)
      .groupBy(orderSlips.date, cashiers.id)
      .orderBy(asc(orderSlips.date), asc(cashiers.name));

    const productRows = await db
      .select({
        date: orderSlips.date,
        cashierId: orderSlips.cashierId,
        productId: productCategories.id,
        brand: productCategories.brand,
        variety: productCategories.variety,
        sizeKg: productCategories.sizeKg,
        sacks: sql<number>`sum(${orderSlipItems.quantity})::int`,
      })
      .from(orderSlipItems)
      .innerJoin(orderSlips, eq(orderSlipItems.orderSlipId, orderSlips.id))
      .innerJoin(productCategories, eq(orderSlipItems.productCategoryId, productCategories.id))
      .where(inRange)
      .groupBy(orderSlips.date, orderSlips.cashierId, productCategories.id)
      .orderBy(asc(productCategories.brand), asc(productCategories.variety), asc(productCategories.sizeKg));
    const productsByGroup = groupBy(productRows, (row) => `${row.date}|${row.cashierId}`);

    return groups.map((group) => ({
      date: group.date,
      cashier: { id: group.cashierId, name: group.cashierName, isActive: group.cashierActive },
      slipCount: group.slipCount,
      statusCounts: { paid: group.paid, partial: group.partial, unpaid: group.unpaid },
      totalAmount: group.totalAmount,
      paidAmount: group.paidAmount,
      products: (productsByGroup.get(`${group.date}|${group.cashierId}`) ?? []).map((row) => ({
        productId: row.productId,
        brand: row.brand,
        variant: variant(row.variety, row.sizeKg),
        sacks: row.sacks,
      })),
    }));
  });

  app.get("/order-slips/:id", posOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const [slip] = await db
      .select(slipColumns)
      .from(orderSlips)
      .innerJoin(cashiers, eq(orderSlips.cashierId, cashiers.id))
      .where(eq(orderSlips.id, id))
      .limit(1);
    if (!slip) throw new ApiError(404, "ORDER_SLIP_NOT_FOUND", "Order slip was not found");
    return { ...toApiSlip(slip), items: (await getItemRows([id])).map(toApiItem) };
  });

  app.post("/order-slips", posOnly, async (request, reply) => {
    const input = orderBody.parse(request.body);
    assertOrderInput(input);
    const orderId = await db.transaction(async (tx) => {
      await assertCashier(tx, input.cashierId);
      const productIds = [...input.items.map((item) => item.productId)].sort();
      const products = await tx
        .select({
          id: productCategories.id,
          isActive: productCategories.isActive,
          isAvailable: productCategories.isAvailable,
          sellingPrice: productCategories.sellingPrice,
        })
        .from(productCategories)
        .where(inArray(productCategories.id, productIds));
      if (products.length !== productIds.length) throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more products do not exist");

      await tx.insert(stockBalances).values(productIds.map((id) => ({ productCategoryId: id, remainingQty: 0 }))).onConflictDoNothing();
      const balances = await tx
        .select({ productId: stockBalances.productCategoryId, quantity: stockBalances.remainingQty })
        .from(stockBalances)
        .where(inArray(stockBalances.productCategoryId, productIds))
        .orderBy(asc(stockBalances.productCategoryId))
        .for("update");
      const productById = new Map(products.map((product) => [product.id, product]));
      const balanceById = new Map(balances.map((balance) => [balance.productId, balance.quantity]));

      let totalAmount = 0;
      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        if (!product.isActive || !product.isAvailable || product.sellingPrice === null) {
          throw new ApiError(409, "PRODUCT_NOT_FOR_SALE", "One or more products are not currently for sale");
        }
        const available = balanceById.get(item.productId) ?? 0;
        if (item.quantity > available) {
          throw new ApiError(409, "INSUFFICIENT_STOCK", `Only ${available} sacks are available`, { productId: item.productId, available });
        }
        totalAmount = money(totalAmount + money(item.quantity * product.sellingPrice));
      }

      const slipNumber = await nextSlipNumber(tx, input.date);
      const [created] = await tx
        .insert(orderSlips)
        .values({
          slipNumber,
          cashierId: input.cashierId,
          date: input.date,
          orderBy: input.orderBy,
          address: input.address,
          status: input.status,
          paymentDueDate: input.paymentDueDate,
          totalAmount,
          createdBy: request.currentUser!.id,
          updatedBy: request.currentUser!.id,
        })
        .returning({ id: orderSlips.id });
      if (!created) throw new ApiError(500, "CREATE_FAILED", "Order slip was not created");

      await tx.insert(orderSlipItems).values(input.items.map((item) => {
        const price = productById.get(item.productId)!.sellingPrice!;
        return {
          orderSlipId: created.id,
          productCategoryId: item.productId,
          quantity: item.quantity,
          unitPrice: price,
          lineTotal: money(item.quantity * price),
        };
      }));

      const batchId = randomUUID();
      for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const next = (balanceById.get(item.productId) ?? 0) - item.quantity;
        await tx.update(stockBalances).set({ remainingQty: next, updatedAt: new Date() }).where(eq(stockBalances.productCategoryId, item.productId));
        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.productId,
          movementType: "OUTBOUND_ORDER",
          quantityDelta: -item.quantity,
          balanceAfter: next,
          orderSlipId: created.id,
          orderRevision: 1,
          occurredAt: new Date(`${input.date}T12:00:00Z`),
          createdBy: request.currentUser!.id,
        });
      }
      return created.id;
    });
    return reply.code(201).send({ id: orderId });
  });

  app.put("/order-slips/:id", posOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const input = orderBody.parse(request.body);
    assertOrderInput(input);

    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${orderSlips} where ${orderSlips.id} = ${id} for update`);
      const [current] = await tx
        .select({
          status: orderSlips.status,
          revision: orderSlips.revision,
          date: orderSlips.date,
          slipNumber: orderSlips.slipNumber,
          cashierId: orderSlips.cashierId,
        })
        .from(orderSlips)
        .where(eq(orderSlips.id, id));
      if (!current) throw new ApiError(404, "ORDER_SLIP_NOT_FOUND", "Order slip was not found");
      if (current.status === "paid") throw new ApiError(409, "PAID_ORDER_IMMUTABLE", "Paid order slips cannot be edited");
      await assertCashier(tx, input.cashierId, current.cashierId);

      const oldItems = await tx
        .select({ productId: orderSlipItems.productCategoryId, quantity: orderSlipItems.quantity })
        .from(orderSlipItems)
        .where(eq(orderSlipItems.orderSlipId, id));
      const productIds = [...new Set([...oldItems.map((item) => item.productId), ...input.items.map((item) => item.productId)])].sort();
      const products = await tx
        .select({
          id: productCategories.id,
          isActive: productCategories.isActive,
          isAvailable: productCategories.isAvailable,
          sellingPrice: productCategories.sellingPrice,
        })
        .from(productCategories)
        .where(inArray(productCategories.id, productIds));
      if (products.length !== productIds.length) throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more products do not exist");

      await tx.insert(stockBalances).values(productIds.map((productId) => ({ productCategoryId: productId, remainingQty: 0 }))).onConflictDoNothing();
      const balances = await tx
        .select({ productId: stockBalances.productCategoryId, quantity: stockBalances.remainingQty })
        .from(stockBalances)
        .where(inArray(stockBalances.productCategoryId, productIds))
        .orderBy(asc(stockBalances.productCategoryId))
        .for("update");
      const available = new Map(balances.map((row) => [row.productId, row.quantity]));
      for (const item of oldItems) available.set(item.productId, (available.get(item.productId) ?? 0) + item.quantity);

      // Moving a slip to another day renumbers it within that day. Its old
      // number is left as a gap rather than shifting that day's other slips.
      const slipNumber = input.date === current.date
        ? current.slipNumber
        : await nextSlipNumber(tx, input.date);

      const productById = new Map(products.map((product) => [product.id, product]));
      let totalAmount = 0;
      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        if (!product.isActive || !product.isAvailable || product.sellingPrice === null) {
          throw new ApiError(409, "PRODUCT_NOT_FOR_SALE", "One or more products are not currently for sale");
        }
        const quantity = available.get(item.productId) ?? 0;
        if (item.quantity > quantity) {
          throw new ApiError(409, "INSUFFICIENT_STOCK", `Only ${quantity} sacks are available`, { productId: item.productId, available: quantity });
        }
        totalAmount = money(totalAmount + money(item.quantity * product.sellingPrice));
      }

      const reversalBatchId = randomUUID();
      for (const item of [...oldItems].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const [balance] = await tx
          .update(stockBalances)
          .set({ remainingQty: sql`${stockBalances.remainingQty} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(stockBalances.productCategoryId, item.productId))
          .returning({ quantity: stockBalances.remainingQty });
        await tx.insert(stockMovements).values({
          batchId: reversalBatchId,
          productCategoryId: item.productId,
          movementType: "ORDER_REVERSAL",
          quantityDelta: item.quantity,
          balanceAfter: balance!.quantity,
          orderSlipId: id,
          orderRevision: current.revision,
          createdBy: request.currentUser!.id,
        });
      }

      const newRevision = current.revision + 1;
      const outboundBatchId = randomUUID();
      for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const [balance] = await tx
          .update(stockBalances)
          .set({ remainingQty: sql`${stockBalances.remainingQty} - ${item.quantity}`, updatedAt: new Date() })
          .where(eq(stockBalances.productCategoryId, item.productId))
          .returning({ quantity: stockBalances.remainingQty });
        if (!balance || balance.quantity < 0) throw new ApiError(409, "INSUFFICIENT_STOCK", "Stock changed while the order was being updated");
        await tx.insert(stockMovements).values({
          batchId: outboundBatchId,
          productCategoryId: item.productId,
          movementType: "OUTBOUND_ORDER",
          quantityDelta: -item.quantity,
          balanceAfter: balance.quantity,
          orderSlipId: id,
          orderRevision: newRevision,
          occurredAt: new Date(`${input.date}T12:00:00Z`),
          createdBy: request.currentUser!.id,
        });
      }

      await tx.delete(orderSlipItems).where(eq(orderSlipItems.orderSlipId, id));
      await tx.insert(orderSlipItems).values(input.items.map((item) => {
        const price = productById.get(item.productId)!.sellingPrice!;
        return {
          orderSlipId: id,
          productCategoryId: item.productId,
          quantity: item.quantity,
          unitPrice: price,
          lineTotal: money(item.quantity * price),
        };
      }));
      await tx
        .update(orderSlips)
        .set({
          slipNumber,
          cashierId: input.cashierId,
          date: input.date,
          orderBy: input.orderBy,
          address: input.address,
          status: input.status,
          paymentDueDate: input.paymentDueDate,
          totalAmount,
          revision: newRevision,
          updatedBy: request.currentUser!.id,
          updatedAt: new Date(),
        })
        .where(eq(orderSlips.id, id));
    });
    return { id };
  });
}

