import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  containerDiscrepancies,
  containerItems,
  containers,
  productCategories,
  shipments,
  stockBalances,
  stockMovements,
  suppliers,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const isoDate = z.iso.date();
const idParams = z.object({ id: z.uuid() });

const shipmentQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: isoDate,
  dateTo: isoDate,
  supplierId: z.uuid().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

const shipmentBody = z.object({
  supplierId: z.uuid(),
  dateListReceived: isoDate,
  reference: z.string().trim().max(500).nullable().default(null),
  notes: z.string().trim().max(2_000).nullable().optional(),
  containers: z.array(z.object({
    container_no: z.string().trim().min(1).max(100).nullable(),
    is_company_truck: z.boolean(),
    items: z.array(z.object({
      product_category_id: z.uuid(),
      qty_sacks: z.number().int().nonnegative(),
      price_per_sack: z.number().nonnegative().nullable(),
    })).min(1),
  })).min(1),
});

const eventBody = z.object({ date: isoDate });
const cancelBody = z.object({ reason: z.string().trim().min(1).max(1_000) });

const discrepancyInput = z.object({
  product_category_id: z.uuid(),
  reason: z.enum(["SHORT", "OVER", "DAMAGED", "UNDECLARED", "OTHER"]),
  actual_qty: z.number().int().nonnegative().optional(),
  note: z.string().trim().max(2_000).nullable().optional(),
});

const unloadBody = z.object({
  dateUnloaded: isoDate,
  discrepancies: z.array(discrepancyInput).default([]),
});

function pageResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function assertDistinct(values: string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new ApiError(400, "DUPLICATE_PRODUCT", message);
  }
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

export async function shipmentRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get("/shipments", warehouseOnly, async (request) => {
    const query = shipmentQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }

    const filters = [
      gte(shipments.dateListReceived, query.dateFrom),
      lte(shipments.dateListReceived, query.dateTo),
      ...(query.supplierId ? [eq(shipments.supplierId, query.supplierId)] : []),
    ];
    const where = and(...filters);
    const [countRow] = await db
      .select({ value: count() })
      .from(shipments)
      .where(where);
    const total = countRow?.value ?? 0;

    const shipmentRows = await db
      .select({
        id: shipments.id,
        date_list_received: shipments.dateListReceived,
        reference: shipments.reference,
        notes: shipments.notes,
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          code: suppliers.code,
        },
      })
      .from(shipments)
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .where(where)
      .orderBy(query.sortDir === "asc" ? asc(shipments.dateListReceived) : desc(shipments.dateListReceived))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    if (!shipmentRows.length) return pageResult([], total, query.page, query.pageSize);

    const containerRows = await db
      .select({
        id: containers.id,
        shipmentId: containers.shipmentId,
        container_no: containers.containerNo,
        is_company_truck: containers.isCompanyTruck,
        status: containers.status,
        date_delivered: containers.dateDelivered,
        date_unloaded: containers.dateUnloaded,
        items_match: containers.itemsMatch,
      })
      .from(containers)
      .where(inArray(containers.shipmentId, shipmentRows.map((row) => row.id)))
      .orderBy(asc(containers.createdAt));

    const itemRows = containerRows.length
      ? await db
        .select({
          id: containerItems.id,
          containerId: containerItems.containerId,
          qty_sacks: containerItems.qtySacks,
          actual_qty_sacks: containerItems.actualQtySacks,
          price_per_sack: containerItems.pricePerSack,
          product_category: {
            id: productCategories.id,
            brand: productCategories.brand,
            variety: productCategories.variety,
            code: productCategories.code,
            size_kg: productCategories.sizeKg,
          },
        })
        .from(containerItems)
        .innerJoin(productCategories, eq(containerItems.productCategoryId, productCategories.id))
        .where(inArray(containerItems.containerId, containerRows.map((row) => row.id)))
        .orderBy(asc(containerItems.createdAt))
      : [];

    const itemsByContainer = groupBy(itemRows, (row) => row.containerId);
    const enrichedContainers = containerRows.map((container) => ({
      ...container,
      container_item: (itemsByContainer.get(container.id) ?? []).map(
        ({ containerId: _containerId, ...item }) => item,
      ),
    }));
    const containersByShipment = groupBy(enrichedContainers, (row) => row.shipmentId);

    return pageResult(
      shipmentRows.map((row) => ({
        ...row,
        container: (containersByShipment.get(row.id) ?? []).map(
          ({ shipmentId: _shipmentId, ...container }) => container,
        ),
      })),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.post("/shipments", warehouseOnly, async (request, reply) => {
    const input = shipmentBody.parse(request.body);
    for (const container of input.containers) {
      assertDistinct(
        container.items.map((item) => item.product_category_id),
        "A product can appear only once in a container",
      );
    }

    const shipmentId = await db.transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.isActive, true)))
        .limit(1);
      if (!supplier) throw new ApiError(400, "UNKNOWN_SUPPLIER", "Supplier does not exist or is inactive");

      const productIds = [...new Set(input.containers.flatMap((c) => c.items.map((i) => i.product_category_id)))];
      const products = await tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(inArray(productCategories.id, productIds), eq(productCategories.isActive, true)));
      if (products.length !== productIds.length) {
        throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more products do not exist or are inactive");
      }

      const [created] = await tx
        .insert(shipments)
        .values({
          supplierId: input.supplierId,
          dateListReceived: input.dateListReceived,
          reference: input.reference,
          notes: input.notes,
          createdBy: request.currentUser!.id,
        })
        .returning({ id: shipments.id });
      if (!created) throw new ApiError(500, "CREATE_FAILED", "Shipment was not created");

      for (const container of input.containers) {
        const [createdContainer] = await tx
          .insert(containers)
          .values({
            shipmentId: created.id,
            containerNo: container.container_no,
            isCompanyTruck: container.is_company_truck,
          })
          .returning({ id: containers.id });
        if (!createdContainer) throw new ApiError(500, "CREATE_FAILED", "Container was not created");

        await tx.insert(containerItems).values(container.items.map((item) => ({
          containerId: createdContainer.id,
          productCategoryId: item.product_category_id,
          qtySacks: item.qty_sacks,
          pricePerSack: item.price_per_sack,
        })));
      }
      return created.id;
    });

    return reply.code(201).send({ id: shipmentId });
  });

  app.get("/containers/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const [container] = await db
      .select({
        id: containers.id,
        container_no: containers.containerNo,
        is_company_truck: containers.isCompanyTruck,
        status: containers.status,
        date_delivered: containers.dateDelivered,
        date_unloaded: containers.dateUnloaded,
        items_match: containers.itemsMatch,
        shipment: {
          id: shipments.id,
          date_list_received: shipments.dateListReceived,
          reference: shipments.reference,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(containers)
      .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .where(eq(containers.id, id))
      .limit(1);
    if (!container) throw new ApiError(404, "CONTAINER_NOT_FOUND", "Container was not found");

    const items = await db
      .select({
        id: containerItems.id,
        qty_sacks: containerItems.qtySacks,
        actual_qty_sacks: containerItems.actualQtySacks,
        price_per_sack: containerItems.pricePerSack,
        product_category: {
          id: productCategories.id,
          brand: productCategories.brand,
          variety: productCategories.variety,
          code: productCategories.code,
          size_kg: productCategories.sizeKg,
        },
      })
      .from(containerItems)
      .innerJoin(productCategories, eq(containerItems.productCategoryId, productCategories.id))
      .where(eq(containerItems.containerId, id))
      .orderBy(asc(containerItems.createdAt));

    const { supplier, ...rest } = container;
    return { ...rest, shipment: { ...rest.shipment, supplier }, container_item: items };
  });

  app.post("/containers/:id/arrive-at-port", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const { date } = eventBody.parse(request.body);
    const updated = await db
      .update(containers)
      .set({ status: "ARRIVED_AT_PORT", dateArrivedAtPort: date, updatedAt: new Date() })
      .where(and(eq(containers.id, id), eq(containers.status, "DOCUMENTED")))
      .returning({ id: containers.id, status: containers.status });
    if (!updated[0]) throw new ApiError(409, "INVALID_CONTAINER_TRANSITION", "Only a documented container can arrive at port");
    return updated[0];
  });

  app.post("/containers/:id/deliver", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const { date } = eventBody.parse(request.body);
    const updated = await db
      .update(containers)
      .set({ status: "DELIVERED", dateDelivered: date, updatedAt: new Date() })
      .where(and(eq(containers.id, id), inArray(containers.status, ["DOCUMENTED", "ARRIVED_AT_PORT"])))
      .returning({ id: containers.id, status: containers.status, date_delivered: containers.dateDelivered });
    if (!updated[0]) throw new ApiError(409, "INVALID_CONTAINER_TRANSITION", "Container cannot be marked delivered from its current status");
    return updated[0];
  });

  app.post("/containers/:id/cancel", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const { reason } = cancelBody.parse(request.body);
    const updated = await db
      .update(containers)
      .set({ status: "CANCELLED", cancellationReason: reason, updatedAt: new Date() })
      .where(and(eq(containers.id, id), inArray(containers.status, ["DOCUMENTED", "ARRIVED_AT_PORT", "DELIVERED"])))
      .returning({ id: containers.id, status: containers.status });
    if (!updated[0]) throw new ApiError(409, "INVALID_CONTAINER_TRANSITION", "Container cannot be cancelled from its current status");
    return updated[0];
  });

  app.post("/containers/:id/unload", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const input = unloadBody.parse(request.body);
    assertDistinct(
      input.discrepancies.map((issue) => issue.product_category_id),
      "Only one discrepancy is allowed per product",
    );

    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${containers} where ${containers.id} = ${id} for update`);
      const [container] = await tx
        .select({ status: containers.status, delivered: containers.dateDelivered })
        .from(containers)
        .where(eq(containers.id, id))
        .limit(1);
      if (!container) throw new ApiError(404, "CONTAINER_NOT_FOUND", "Container was not found");
      if (container.status !== "DELIVERED") {
        throw new ApiError(409, "INVALID_CONTAINER_TRANSITION", "Only a delivered container can be unloaded");
      }
      if (container.delivered && input.dateUnloaded < container.delivered) {
        throw new ApiError(400, "INVALID_UNLOAD_DATE", "Unload date cannot be before delivery date");
      }

      const declaredItems = await tx
        .select()
        .from(containerItems)
        .where(eq(containerItems.containerId, id))
        .orderBy(asc(containerItems.productCategoryId));
      const byProduct = new Map(declaredItems.map((item) => [item.productCategoryId, item]));
      const issueProductIds = [...new Set(input.discrepancies.map((issue) => issue.product_category_id))];
      if (issueProductIds.length) {
        const validProducts = await tx
          .select({ id: productCategories.id })
          .from(productCategories)
          .where(and(
            inArray(productCategories.id, issueProductIds),
            eq(productCategories.isActive, true),
          ));
        if (validProducts.length !== issueProductIds.length) {
          throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more discrepancy products do not exist or are inactive");
        }
      }

      await tx
        .update(containerItems)
        .set({ actualQtySacks: sql`${containerItems.qtySacks}` })
        .where(eq(containerItems.containerId, id));

      for (const issue of input.discrepancies) {
        const existing = byProduct.get(issue.product_category_id);
        if (issue.reason === "UNDECLARED") {
          if (existing) throw new ApiError(400, "PRODUCT_ALREADY_DECLARED", "An undeclared issue must reference a product not already on the container");
          if (issue.actual_qty === undefined) throw new ApiError(400, "ACTUAL_QTY_REQUIRED", "Undeclared quantity is required");
          const [createdItem] = await tx
            .insert(containerItems)
            .values({
              containerId: id,
              productCategoryId: issue.product_category_id,
              qtySacks: 0,
              actualQtySacks: issue.actual_qty,
            })
            .returning({ id: containerItems.id });
          if (!createdItem) throw new ApiError(500, "CREATE_FAILED", "Undeclared item was not created");
          await tx.insert(containerDiscrepancies).values({
            containerId: id,
            containerItemId: createdItem.id,
            productCategoryId: issue.product_category_id,
            declaredQty: 0,
            actualQty: issue.actual_qty,
            reason: issue.reason,
            note: issue.note,
            createdBy: request.currentUser!.id,
          });
          continue;
        }

        if (!existing) throw new ApiError(400, "PRODUCT_NOT_DECLARED", "The discrepancy product is not declared on this container");
        if (issue.reason === "OTHER") {
          if (!issue.note?.trim()) throw new ApiError(400, "NOTE_REQUIRED", "Other discrepancies require a note");
        } else {
          if (issue.actual_qty === undefined) throw new ApiError(400, "ACTUAL_QTY_REQUIRED", "Actual quantity is required");
          if (issue.reason === "SHORT" && issue.actual_qty >= existing.qtySacks) {
            throw new ApiError(400, "INVALID_SHORT_QTY", "A short count must be below the declared quantity");
          }
          if (issue.reason === "OVER" && issue.actual_qty <= existing.qtySacks) {
            throw new ApiError(400, "INVALID_OVER_QTY", "An over count must be above the declared quantity");
          }
          await tx
            .update(containerItems)
            .set({ actualQtySacks: issue.actual_qty })
            .where(eq(containerItems.id, existing.id));
        }

        await tx.insert(containerDiscrepancies).values({
          containerId: id,
          containerItemId: existing.id,
          productCategoryId: issue.product_category_id,
          declaredQty: existing.qtySacks,
          actualQty: issue.actual_qty,
          reason: issue.reason,
          note: issue.note,
          createdBy: request.currentUser!.id,
        });
      }

      const received = await tx
        .select({
          productCategoryId: containerItems.productCategoryId,
          quantity: containerItems.actualQtySacks,
        })
        .from(containerItems)
        .where(eq(containerItems.containerId, id))
        .orderBy(asc(containerItems.productCategoryId));

      const batchId = randomUUID();
      for (const item of received) {
        if (!item.quantity) continue;
        const [balance] = await tx
          .insert(stockBalances)
          .values({ productCategoryId: item.productCategoryId, remainingQty: item.quantity })
          .onConflictDoUpdate({
            target: stockBalances.productCategoryId,
            set: {
              remainingQty: sql`${stockBalances.remainingQty} + ${item.quantity}`,
              updatedAt: new Date(),
            },
          })
          .returning({ remainingQty: stockBalances.remainingQty });
        if (!balance) throw new ApiError(500, "STOCK_UPDATE_FAILED", "Stock balance was not updated");
        await tx.insert(stockMovements).values({
          batchId,
          productCategoryId: item.productCategoryId,
          movementType: "INBOUND_UNLOAD",
          quantityDelta: item.quantity,
          balanceAfter: balance.remainingQty,
          containerId: id,
          occurredAt: new Date(`${input.dateUnloaded}T12:00:00Z`),
          createdBy: request.currentUser!.id,
        });
      }

      await tx
        .update(containers)
        .set({
          status: "UNLOADED",
          dateUnloaded: input.dateUnloaded,
          itemsMatch: input.discrepancies.length === 0,
          updatedAt: new Date(),
        })
        .where(eq(containers.id, id));
    });

    return { id, status: "UNLOADED" as const };
  });
}
