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
  isNotNull,
  isNull,
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
  shippingCompanies,
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
  kind: z.enum(["INTERNATIONAL", "NATIONAL"]).optional(),
  archived: z.stringbool().default(false),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
const portPullOutQuery = z.object({
  kind: z.enum(["INTERNATIONAL", "NATIONAL"]),
});

const shipmentBody = z.object({
  supplierId: z.uuid(),
  dateListReceived: isoDate,
  reference: z.string().trim().max(500).nullable().default(null),
  notes: z.string().trim().max(2_000).nullable().optional(),
  containers: z.array(z.object({
    container_no: z.string().trim().min(1).max(100).nullable(),
    shipping_company_id: z.uuid(),
    items: z.array(z.object({
      product_category_id: z.uuid(),
      qty_sacks: z.number().int().nonnegative(),
      price_per_sack: z.number().nonnegative().nullable(),
    })).min(1),
  })).min(1),
});

const eventBody = z.object({ date: isoDate });
const arriveAtPortBody = z.object({
  date: isoDate,
});
const haulingBody = z.discriminatedUnion("assignment", [
  z.object({ assignment: z.literal("NOT_ASSIGNED") }),
  z.object({ assignment: z.literal("OWN_TRUCK") }),
  z.object({
    assignment: z.literal("THIRD_PARTY"),
    hauler: z.string().trim().min(1).max(500),
  }),
]);
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

function addCalendarDays(isoDateValue: string, days: number): string {
  const date = new Date(`${isoDateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function shipmentRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get("/port-pull-outs", warehouseOnly, async (request) => {
    const query = portPullOutQuery.parse(request.query);
    return db
      .select({
        id: containers.id,
        container_no: containers.containerNo,
        date_arrived_at_port: containers.dateArrivedAtPort,
        pull_out_before: containers.pullOutBefore,
        shipment_reference: shipments.reference,
        supplier: suppliers.name,
        shipping_company: shippingCompanies.name,
        shipping_company_code: shippingCompanies.code,
      })
      .from(containers)
      .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .leftJoin(shippingCompanies, eq(containers.shippingCompanyId, shippingCompanies.id))
      .where(and(eq(containers.status, "ARRIVED_AT_PORT"), eq(suppliers.kind, query.kind), isNull(shipments.archivedAt)))
      .orderBy(asc(containers.pullOutBefore), asc(containers.dateArrivedAtPort));
  });

  app.get("/shipments", warehouseOnly, async (request) => {
    const query = shipmentQuery.parse(request.query);
    if (query.dateFrom > query.dateTo) {
      throw new ApiError(400, "INVALID_DATE_RANGE", "dateFrom cannot be after dateTo");
    }

    const filters = [
      gte(shipments.dateListReceived, query.dateFrom),
      lte(shipments.dateListReceived, query.dateTo),
      query.archived ? isNotNull(shipments.archivedAt) : isNull(shipments.archivedAt),
      ...(query.kind ? [eq(suppliers.kind, query.kind)] : []),
      ...(query.supplierId ? [eq(shipments.supplierId, query.supplierId)] : []),
    ];
    const where = and(...filters);
    const [countRow] = await db
      .select({ value: count() })
      .from(shipments)
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .where(where);
    const total = countRow?.value ?? 0;

    const shipmentRows = await db
      .select({
        id: shipments.id,
        date_list_received: shipments.dateListReceived,
        reference: shipments.reference,
        notes: shipments.notes,
        archived_at: shipments.archivedAt,
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          code: suppliers.code,
        },
      })
      .from(shipments)
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .where(where)
      .orderBy(
        query.sortDir === "asc" ? asc(shipments.dateListReceived) : desc(shipments.dateListReceived),
        query.sortDir === "asc" ? asc(shipments.createdAt) : desc(shipments.createdAt),
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    if (!shipmentRows.length) return pageResult([], total, query.page, query.pageSize);

    const containerRows = await db
      .select({
        id: containers.id,
        shipmentId: containers.shipmentId,
        container_no: containers.containerNo,
        is_company_truck: containers.isCompanyTruck,
        hauler: containers.hauler,
        shipping_company: {
          id: shippingCompanies.id,
          name: shippingCompanies.name,
          code: shippingCompanies.code,
          grace_period_days: shippingCompanies.gracePeriodDays,
        },
        status: containers.status,
        date_arrived_at_port: containers.dateArrivedAtPort,
        pull_out_before: containers.pullOutBefore,
        date_delivered: containers.dateDelivered,
        date_unloaded: containers.dateUnloaded,
        items_match: containers.itemsMatch,
      })
      .from(containers)
      .leftJoin(shippingCompanies, eq(containers.shippingCompanyId, shippingCompanies.id))
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
      container_item: (itemsByContainer.get(container.id) ?? []).map((item) => ({
        id: item.id,
        qty_sacks: item.qty_sacks,
        actual_qty_sacks: item.actual_qty_sacks,
        price_per_sack: item.price_per_sack,
        product_category: item.product_category,
      })),
    }));
    const containersByShipment = groupBy(enrichedContainers, (row) => row.shipmentId);

    return pageResult(
      shipmentRows.map((row) => ({
        ...row,
        container: (containersByShipment.get(row.id) ?? []).map((container) => ({
          id: container.id,
          container_no: container.container_no,
          is_company_truck: container.is_company_truck,
          hauler: container.hauler,
          shipping_company: container.shipping_company?.id
            ? container.shipping_company
            : null,
          status: container.status,
          date_arrived_at_port: container.date_arrived_at_port,
          pull_out_before: container.pull_out_before,
          date_delivered: container.date_delivered,
          date_unloaded: container.date_unloaded,
          items_match: container.items_match,
          container_item: container.container_item,
        })),
      })),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.post("/shipments/:id/archive", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const userId = request.currentUser!.id;

    return db.transaction(async (tx) => {
      const [shipment] = await tx
        .select({ id: shipments.id, archivedAt: shipments.archivedAt })
        .from(shipments)
        .where(eq(shipments.id, id))
        .limit(1);

      if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
      if (shipment.archivedAt) return { id, archived_at: shipment.archivedAt };

      const rows = await tx
        .select({ status: containers.status })
        .from(containers)
        .where(eq(containers.shipmentId, id));
      const complete = rows.length > 0 && rows.every(
        ({ status }) => status === "UNLOADED" || status === "CANCELLED",
      );
      if (!complete) {
        throw new ApiError(
          409,
          "SHIPMENT_NOT_COMPLETE",
          "Only shipments whose containers are all unloaded or cancelled can be archived",
        );
      }

      const archivedAt = new Date();
      await tx
        .update(shipments)
        .set({ archivedAt, archivedBy: userId })
        .where(eq(shipments.id, id));
      return { id, archived_at: archivedAt };
    });
  });

  app.post("/shipments/:id/restore", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const [restored] = await db
      .update(shipments)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(shipments.id, id), isNotNull(shipments.archivedAt)))
      .returning({ id: shipments.id });

    if (restored) return restored;
    const [shipment] = await db
      .select({ id: shipments.id })
      .from(shipments)
      .where(eq(shipments.id, id))
      .limit(1);
    if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
    return shipment;
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
        .select({ kind: suppliers.kind })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.isActive, true)))
        .limit(1);
      if (!supplier) throw new ApiError(400, "UNKNOWN_SUPPLIER", "Supplier does not exist or is inactive");
      if (supplier.kind === "LOCAL") {
        throw new ApiError(
          400,
          "SUPPLIER_NOT_SHIPPED",
          "Local suppliers are logged as deliveries, not packing lists",
        );
      }

      const productIds = [...new Set(input.containers.flatMap((c) => c.items.map((i) => i.product_category_id)))];
      const products = await tx
        .select({ id: productCategories.id })
        .from(productCategories)
        .where(and(inArray(productCategories.id, productIds), eq(productCategories.isActive, true)));
      if (products.length !== productIds.length) {
        throw new ApiError(400, "UNKNOWN_PRODUCT", "One or more products do not exist or are inactive");
      }

      const shippingCompanyIds = [...new Set(input.containers.map((c) => c.shipping_company_id))];
      const shippingCompanyRows = await tx
        .select({ id: shippingCompanies.id })
        .from(shippingCompanies)
        .where(and(inArray(shippingCompanies.id, shippingCompanyIds), eq(shippingCompanies.isActive, true)));
      if (shippingCompanyRows.length !== shippingCompanyIds.length) {
        throw new ApiError(400, "UNKNOWN_SHIPPING_COMPANY", "One or more shipping companies do not exist or are inactive");
      }

      const [created] = await tx
        .insert(shipments)
        .values({
          supplierId: input.supplierId,
          // Do not rely on the INTERNATIONAL database default: this route is
          // shared by international and national shipment registration, and
          // the composite FK requires the stored kind to match the supplier.
          supplierKind: supplier.kind,
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
            shippingCompanyId: container.shipping_company_id,
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
        hauler: containers.hauler,
        shipping_company: {
          id: shippingCompanies.id,
          name: shippingCompanies.name,
          code: shippingCompanies.code,
          grace_period_days: shippingCompanies.gracePeriodDays,
        },
        status: containers.status,
        date_arrived_at_port: containers.dateArrivedAtPort,
        pull_out_before: containers.pullOutBefore,
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
      .leftJoin(shippingCompanies, eq(containers.shippingCompanyId, shippingCompanies.id))
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

    const { supplier, shipping_company, ...rest } = container;
    return {
      ...rest,
      shipment: { ...rest.shipment, supplier },
      shipping_company: shipping_company?.id ? shipping_company : null,
      container_item: items,
    };
  });

  app.post("/containers/:id/arrive-at-port", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const input = arriveAtPortBody.parse(request.body);
    const [company] = await db
      .select({ gracePeriodDays: shippingCompanies.gracePeriodDays })
      .from(containers)
      .leftJoin(shippingCompanies, eq(containers.shippingCompanyId, shippingCompanies.id))
      .where(eq(containers.id, id))
      .limit(1);
    if (!company) throw new ApiError(404, "CONTAINER_NOT_FOUND", "Container was not found");
    if (!company.gracePeriodDays) {
      throw new ApiError(
        409,
        "SHIPPING_COMPANY_GRACE_PERIOD_REQUIRED",
        "Set this shipping company's grace period before marking the container at port",
      );
    }
    const pullOutBefore = addCalendarDays(input.date, company.gracePeriodDays);
    const updated = await db
      .update(containers)
      .set({
        status: "ARRIVED_AT_PORT",
        dateArrivedAtPort: input.date,
        pullOutBefore,
        updatedAt: new Date(),
      })
      .where(and(eq(containers.id, id), eq(containers.status, "DOCUMENTED")))
      .returning({ id: containers.id, status: containers.status });
    if (!updated[0]) throw new ApiError(409, "INVALID_CONTAINER_TRANSITION", "Only a documented container can arrive at port");
    return updated[0];
  });

  app.patch("/containers/:id/hauling", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const input = haulingBody.parse(request.body);
    const assignment = input.assignment === "NOT_ASSIGNED"
      ? { isCompanyTruck: null, hauler: null }
      : input.assignment === "OWN_TRUCK"
        ? { isCompanyTruck: true, hauler: null }
        : { isCompanyTruck: false, hauler: input.hauler };

    const [updated] = await db
      .update(containers)
      .set({ ...assignment, updatedAt: new Date() })
      .where(and(
        eq(containers.id, id),
        inArray(containers.status, ["DOCUMENTED", "ARRIVED_AT_PORT"]),
      ))
      .returning({
        id: containers.id,
        is_company_truck: containers.isCompanyTruck,
        hauler: containers.hauler,
      });
    if (!updated) {
      throw new ApiError(
        409,
        "HAULING_ASSIGNMENT_LOCKED",
        "Hauling can only be changed before the container is delivered",
      );
    }
    return updated;
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
