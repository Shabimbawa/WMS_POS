import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, gt, gte, ilike, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  containerDiscrepancies,
  containerItems,
  containers,
  orderSlips,
  productCategories,
  shipments,
  stockBalances,
  stockMovements,
  suppliers,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const pagination = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

const stockQuery = z.object({
  ...pagination,
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  brand: z.string().trim().min(1).optional(),
  inStockOnly: z.stringbool().optional().default(false),
  availableOnly: z.stringbool().optional().default(false),
  sortBy: z.enum(["brand", "size_kg", "remaining_qty", "selling_price", "updated_at"]).default("updated_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const movementQuery = z.object({
  ...pagination,
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
  productCategoryId: z.uuid().optional(),
  movementType: z
    .enum(["OPENING_BALANCE", "INBOUND_UNLOAD", "OUTBOUND_ORDER", "ORDER_REVERSAL", "MANUAL_ADJUSTMENT"])
    .optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const adjustmentBody = z.object({
  productCategoryId: z.uuid(),
  quantityDelta: z.number().int().refine((value) => value !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(3).max(2_000),
});

const discrepancyListQuery = z.object({
  ...pagination,
  mismatchOnly: z.stringbool().optional().default(false),
});

const discrepancyParams = z.object({ id: z.uuid() });
const resolutionBody = z.object({ note: z.string().trim().min(1).max(2_000) });

function pageResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

const stockSortColumns = {
  brand: productCategories.brand,
  size_kg: productCategories.sizeKg,
  remaining_qty: stockBalances.remainingQty,
  selling_price: productCategories.sellingPrice,
  updated_at: stockBalances.updatedAt,
} as const;

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/stock",
    { preHandler: requireRole("warehouse_admin", "pos_admin") },
    async (request) => {
      const query = stockQuery.parse(request.query);
      if (query.dateFrom > query.dateTo) {
        throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
      }

      const filters = [
        gte(stockBalances.updatedAt, new Date(`${query.dateFrom}T00:00:00Z`)),
        lte(stockBalances.updatedAt, new Date(`${query.dateTo}T23:59:59.999Z`)),
        ...(query.brand ? [ilike(productCategories.brand, query.brand)] : []),
        ...(query.inStockOnly ? [gt(stockBalances.remainingQty, 0)] : []),
        ...(query.availableOnly ? [eq(productCategories.isAvailable, true)] : []),
      ];
      const where = and(...filters);
      const [countRow] = await db
        .select({ value: count() })
        .from(stockBalances)
        .innerJoin(productCategories, eq(stockBalances.productCategoryId, productCategories.id))
        .where(where);
      const sortColumn = stockSortColumns[query.sortBy];

      const rows = await db
        .select({
          id: stockBalances.productCategoryId,
          remaining_qty: stockBalances.remainingQty,
          updated_at: stockBalances.updatedAt,
          product_category: {
            id: productCategories.id,
            brand: productCategories.brand,
            variety: productCategories.variety,
            code: productCategories.code,
            size_kg: productCategories.sizeKg,
            selling_price: productCategories.sellingPrice,
            is_available: productCategories.isAvailable,
          },
        })
        .from(stockBalances)
        .innerJoin(productCategories, eq(stockBalances.productCategoryId, productCategories.id))
        .where(where)
        .orderBy(query.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return pageResult(rows, countRow?.value ?? 0, query.page, query.pageSize);
    },
  );

  app.post(
    "/stock/adjustments",
    { preHandler: requireRole("warehouse_admin") },
    async (request, reply) => {
      const input = adjustmentBody.parse(request.body);
      const result = await db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: productCategories.id })
          .from(productCategories)
          .where(eq(productCategories.id, input.productCategoryId))
          .limit(1);
        if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product was not found");

        await tx
          .insert(stockBalances)
          .values({ productCategoryId: input.productCategoryId, remainingQty: 0 })
          .onConflictDoNothing();
        await tx.execute(sql`
          select product_category_id from ${stockBalances}
          where ${stockBalances.productCategoryId} = ${input.productCategoryId}
          for update
        `);
        const [current] = await tx
          .select({ remainingQty: stockBalances.remainingQty })
          .from(stockBalances)
          .where(eq(stockBalances.productCategoryId, input.productCategoryId));
        if (!current) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product was not found");
        const next = current.remainingQty + input.quantityDelta;
        if (next < 0) throw new ApiError(409, "INSUFFICIENT_STOCK", "Adjustment would make stock negative");

        await tx
          .update(stockBalances)
          .set({ remainingQty: next, updatedAt: new Date() })
          .where(eq(stockBalances.productCategoryId, input.productCategoryId));
        const [movement] = await tx
          .insert(stockMovements)
          .values({
            batchId: randomUUID(),
            productCategoryId: input.productCategoryId,
            movementType: "MANUAL_ADJUSTMENT",
            quantityDelta: input.quantityDelta,
            balanceAfter: next,
            note: input.reason,
            createdBy: request.currentUser!.id,
          })
          .returning({ id: stockMovements.id });
        return { movementId: movement!.id, remainingQty: next };
      });
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/stock/movements",
    { preHandler: requireRole("warehouse_admin") },
    async (request) => {
      const query = movementQuery.parse(request.query);
      if (query.dateFrom > query.dateTo) {
        throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
      }
      const filters = [
        gte(stockMovements.occurredAt, new Date(`${query.dateFrom}T00:00:00Z`)),
        lte(stockMovements.occurredAt, new Date(`${query.dateTo}T23:59:59.999Z`)),
        ...(query.productCategoryId
          ? [eq(stockMovements.productCategoryId, query.productCategoryId)]
          : []),
        ...(query.movementType ? [eq(stockMovements.movementType, query.movementType)] : []),
        ...(query.direction === "IN" ? [gt(stockMovements.quantityDelta, 0)] : []),
        ...(query.direction === "OUT" ? [lt(stockMovements.quantityDelta, 0)] : []),
      ];
      const where = and(...filters);

      const [countRow] = await db
        .select({ value: count() })
        .from(stockMovements)
        .where(where);

      const direction = sql<"IN" | "OUT">`case when ${stockMovements.quantityDelta} > 0 then 'IN' else 'OUT' end`;
      const order = query.sortDir === "asc" ? asc : desc;

      const rows = await db
        .select({
          id: stockMovements.id,
          occurred_at: stockMovements.occurredAt,
          created_at: stockMovements.createdAt,
          movement_type: stockMovements.movementType,
          direction,
          quantity_delta: stockMovements.quantityDelta,
          balance_after: stockMovements.balanceAfter,
          note: stockMovements.note,
          product_category_id: stockMovements.productCategoryId,
          brand: productCategories.brand,
          variety: productCategories.variety,
          code: productCategories.code,
          size_kg: productCategories.sizeKg,
          container_id: stockMovements.containerId,
          container_no: containers.containerNo,
          supplier: suppliers.name,
          order_slip_id: stockMovements.orderSlipId,
          order_slip_number: orderSlips.slipNumber,
          // Slip numbers restart daily, so the number alone is ambiguous.
          order_slip_date: orderSlips.date,
          order_revision: stockMovements.orderRevision,
        })
        .from(stockMovements)
        .innerJoin(productCategories, eq(stockMovements.productCategoryId, productCategories.id))
        // every source is optional on a movement, so these stay left joins
        .leftJoin(containers, eq(stockMovements.containerId, containers.id))
        .leftJoin(shipments, eq(containers.shipmentId, shipments.id))
        .leftJoin(suppliers, eq(shipments.supplierId, suppliers.id))
        .leftJoin(orderSlips, eq(stockMovements.orderSlipId, orderSlips.id))
        .where(where)
        // created_at breaks ties so one unload batch keeps its insert order
        .orderBy(order(stockMovements.occurredAt), order(stockMovements.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return pageResult(rows, countRow?.value ?? 0, query.page, query.pageSize);
    },
  );

  app.get(
    "/discrepancies/variance",
    { preHandler: requireRole("warehouse_admin") },
    async (request) => {
      const query = discrepancyListQuery.parse(request.query);
      const mismatchFilter = query.mismatchOnly ? sql`and totals.actual_sacks <> totals.declared_sacks` : sql``;
      const totalResult = await db.execute(sql`
        with totals as (
          select c.id,
            coalesce(sum(ci.qty_sacks), 0)::int as declared_sacks,
            coalesce(sum(ci.actual_qty_sacks), 0)::int as actual_sacks
          from ${containers} c
          left join ${containerItems} ci on ci.container_id = c.id
          where c.status = 'UNLOADED'
          group by c.id
        )
        select count(*)::int as total from totals where true ${mismatchFilter}
      `);
      const total = Number(totalResult[0]?.total ?? 0);

      const result = await db.execute(sql`
        with totals as (
          select c.id as container_id, c.container_no, c.status, c.items_match,
            c.date_unloaded, s.date_list_received, sup.name as supplier,
            coalesce(sum(ci.qty_sacks), 0)::int as declared_sacks,
            coalesce(sum(ci.actual_qty_sacks), 0)::int as actual_sacks,
            (select count(*)::int from ${containerDiscrepancies} cd where cd.container_id = c.id) as discrepancy_count
          from ${containers} c
          join ${shipments} s on s.id = c.shipment_id
          join ${suppliers} sup on sup.id = s.supplier_id
          left join ${containerItems} ci on ci.container_id = c.id
          where c.status = 'UNLOADED'
          group by c.id, s.id, sup.id
        )
        select *, (actual_sacks - declared_sacks)::int as variance_sacks
        from totals
        where true ${mismatchFilter}
        order by date_unloaded desc nulls last
        limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}
      `);
      return pageResult(Array.from(result), total, query.page, query.pageSize);
    },
  );

  app.get(
    "/discrepancies/open-questions",
    { preHandler: requireRole("warehouse_admin") },
    async (request) => {
      const query = discrepancyListQuery.pick({ page: true, pageSize: true }).parse(request.query);
      const where = and(
        eq(containerDiscrepancies.reason, "OTHER"),
        sql`${containerDiscrepancies.resolvedAt} is null`,
      );
      const [countRow] = await db.select({ value: count() }).from(containerDiscrepancies).where(where);
      const rows = await db
        .select({
          id: containerDiscrepancies.id,
          created_at: containerDiscrepancies.createdAt,
          container_no: containers.containerNo,
          supplier: suppliers.name,
          brand: productCategories.brand,
          variety: productCategories.variety,
          size_kg: productCategories.sizeKg,
          note: containerDiscrepancies.note,
        })
        .from(containerDiscrepancies)
        .innerJoin(containers, eq(containerDiscrepancies.containerId, containers.id))
        .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
        .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
        .innerJoin(productCategories, eq(containerDiscrepancies.productCategoryId, productCategories.id))
        .where(where)
        .orderBy(desc(containerDiscrepancies.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return pageResult(rows, countRow?.value ?? 0, query.page, query.pageSize);
    },
  );

  app.get(
    "/discrepancies/open-questions/count",
    { preHandler: requireRole("warehouse_admin") },
    async () => {
      const [row] = await db
        .select({ value: count() })
        .from(containerDiscrepancies)
        .where(and(eq(containerDiscrepancies.reason, "OTHER"), sql`${containerDiscrepancies.resolvedAt} is null`));
      return { count: row?.value ?? 0 };
    },
  );

  app.post(
    "/discrepancies/:id/resolve",
    { preHandler: requireRole("warehouse_admin") },
    async (request) => {
      const { id } = discrepancyParams.parse(request.params);
      const { note } = resolutionBody.parse(request.body);
      const [updated] = await db
        .update(containerDiscrepancies)
        .set({ resolvedAt: new Date(), resolvedBy: request.currentUser!.id, resolutionNote: note })
        .where(and(
          eq(containerDiscrepancies.id, id),
          eq(containerDiscrepancies.reason, "OTHER"),
          sql`${containerDiscrepancies.resolvedAt} is null`,
        ))
        .returning({ id: containerDiscrepancies.id, resolvedAt: containerDiscrepancies.resolvedAt });
      if (!updated) throw new ApiError(404, "OPEN_QUESTION_NOT_FOUND", "Open question was not found or is already resolved");
      return updated;
    },
  );
}
