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
  shippingCompanies,
  suppliers,
} from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

/** Comma-separated UUIDs, as a query string carries an array. */
const idList = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").filter(Boolean) : []))
  .pipe(z.array(z.uuid()).max(200));

const range = {
  dateFrom: z.iso.date(),
  dateTo: z.iso.date(),
};

const source = z.enum(["ALL", "SHIPMENT", "INTERNATIONAL", "NATIONAL", "LOCAL"]).default("ALL");

const reportFilters = {
  ...range,
  source,
  supplierIds: idList,
  shipmentIds: idList,
  productIds: idList,
};
const inboundQuery = z.object(reportFilters);
const receivingQuery = z.object(reportFilters);
const productOptionsQuery = z.object({
  ...range,
  source,
  supplierIds: idList,
  shipmentIds: idList,
});
const shipmentOptionsQuery = z.object({
  ...range,
  source,
  supplierIds: idList,
});

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
type InboundQuery = z.infer<typeof inboundQuery>;

// The report filters, shared by the per-product totals and the per-container
// breakdown so the two always cover the same stock.
const wantsShipments = (query: InboundQuery) => query.source !== "LOCAL";
const wantsLocal = (query: InboundQuery) =>
  (query.source === "ALL" || query.source === "LOCAL") && !query.shipmentIds.length;
const shipmentFilter = (query: InboundQuery) => and(
  unloadedIn(query.dateFrom, query.dateTo),
  query.productIds.length ? inArray(containerItems.productCategoryId, query.productIds) : undefined,
  query.source === "INTERNATIONAL" ? eq(suppliers.kind, "INTERNATIONAL") : undefined,
  query.source === "NATIONAL" ? eq(suppliers.kind, "NATIONAL") : undefined,
  query.supplierIds.length ? inArray(suppliers.id, query.supplierIds) : undefined,
  query.shipmentIds.length ? inArray(shipments.id, query.shipmentIds) : undefined,
);
const localFilter = (query: InboundQuery) => and(
  deliveredIn(query.dateFrom, query.dateTo),
  query.productIds.length ? inArray(localDeliveryItems.productCategoryId, query.productIds) : undefined,
  query.supplierIds.length ? inArray(suppliers.id, query.supplierIds) : undefined,
);

/**
 * Sacks received per product per day, from unloaded containers and local
 * deliveries, under the report filters. Shared by the stock summary and the
 * product filter's options, so a listed product always has figures.
 */
async function receivedCells(query: InboundQuery): Promise<Cell[]> {
  // The two sources are independent, so both queries run at once.
  const [shipmentCells, localCells] = await Promise.all([!wantsShipments(query) ? [] : db
    .select({
      productId: containerItems.productCategoryId,
      date: sql<string>`${containers.dateUnloaded}`,
      sacks: sql<number>`coalesce(sum(${containerItems.actualQtySacks}), 0)::int`,
    })
    .from(containerItems)
    .innerJoin(containers, eq(containerItems.containerId, containers.id))
    .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
    .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
    .where(shipmentFilter(query))
    .groupBy(containerItems.productCategoryId, containers.dateUnloaded),
  !wantsLocal(query) ? [] : db
    .select({
      productId: localDeliveryItems.productCategoryId,
      date: localDeliveries.dateReceived,
      sacks: sql<number>`sum(${localDeliveryItems.qtySacks})::int`,
    })
    .from(localDeliveryItems)
    .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
    .innerJoin(suppliers, eq(localDeliveries.supplierId, suppliers.id))
    .where(localFilter(query))
    .groupBy(localDeliveryItems.productCategoryId, localDeliveries.dateReceived)]);

  // A product can arrive both ways on one day; merge them into one cell.
  const merged = new Map<string, Cell>();
  for (const cell of [...shipmentCells, ...localCells]) {
    const key = `${cell.productId}|${cell.date}`;
    const current = merged.get(key);
    if (current) current.sacks += cell.sacks;
    else merged.set(key, { ...cell });
  }
  return [...merged.values()].filter((cell) => cell.sacks !== 0);
}

/**
 * One entry per unloaded container or local delivery in the period, with the
 * products it brought (counted sacks; a product on several lines of one
 * container is added up). This is the stock summary's "by container" view,
 * laid out like the shipments notebook: which brands arrived together.
 */
async function receivedArrivals(query: InboundQuery) {
  const product = {
    productId: productCategories.id,
    brand: productCategories.brand,
    variety: productCategories.variety,
    code: productCategories.code,
    sizeKg: productCategories.sizeKg,
  };
  const [containerRows, localRows] = await Promise.all([!wantsShipments(query) ? [] : db
    .select({
      id: containers.id,
      date: sql<string>`${containers.dateUnloaded}`,
      containerNo: containers.containerNo,
      shippingCompany: shippingCompanies.name,
      reference: shipments.reference,
      supplier: suppliers.name,
      supplierKind: suppliers.kind,
      ...product,
      sacks: sql<number>`coalesce(sum(${containerItems.actualQtySacks}), 0)::int`,
    })
    .from(containerItems)
    .innerJoin(containers, eq(containerItems.containerId, containers.id))
    .innerJoin(shipments, eq(containers.shipmentId, shipments.id))
    .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
    .innerJoin(productCategories, eq(containerItems.productCategoryId, productCategories.id))
    .leftJoin(shippingCompanies, eq(containers.shippingCompanyId, shippingCompanies.id))
    .where(shipmentFilter(query))
    .groupBy(containers.id, shippingCompanies.id, shipments.id, suppliers.id, productCategories.id),
  !wantsLocal(query) ? [] : db
    .select({
      id: localDeliveries.id,
      date: localDeliveries.dateReceived,
      reference: localDeliveries.reference,
      supplier: suppliers.name,
      ...product,
      sacks: sql<number>`sum(${localDeliveryItems.qtySacks})::int`,
    })
    .from(localDeliveryItems)
    .innerJoin(localDeliveries, eq(localDeliveryItems.localDeliveryId, localDeliveries.id))
    .innerJoin(suppliers, eq(localDeliveries.supplierId, suppliers.id))
    .innerJoin(productCategories, eq(localDeliveryItems.productCategoryId, productCategories.id))
    .where(localFilter(query))
    .groupBy(localDeliveries.id, suppliers.id, productCategories.id)]);

  type Arrival = {
    key: string;
    kind: "CONTAINER" | "LOCAL";
    date: string;
    container_no: string | null;
    shipping_company: string | null;
    reference: string | null;
    supplier: string;
    supplier_kind: "INTERNATIONAL" | "NATIONAL" | "LOCAL";
    lines: { product_category_id: string; brand: string; variety: string | null; code: string | null; size_kg: number | null; sacks: number }[];
    total: number;
  };
  const arrivals = new Map<string, Arrival>();
  const add = (key: string, base: Omit<Arrival, "key" | "lines" | "total">, row: typeof containerRows[number] | typeof localRows[number]) => {
    if (!row.sacks) return;
    const arrival = arrivals.get(key) ?? { key, ...base, lines: [], total: 0 };
    arrival.lines.push({
      product_category_id: row.productId,
      brand: row.brand,
      variety: row.variety,
      code: row.code,
      size_kg: row.sizeKg,
      sacks: row.sacks,
    });
    arrival.total += row.sacks;
    arrivals.set(key, arrival);
  };
  for (const row of containerRows) {
    add(`container:${row.id}`, {
      kind: "CONTAINER",
      date: row.date,
      container_no: row.containerNo,
      shipping_company: row.shippingCompany,
      reference: row.reference,
      supplier: row.supplier,
      supplier_kind: row.supplierKind,
    }, row);
  }
  for (const row of localRows) {
    add(`local:${row.id}`, {
      kind: "LOCAL",
      date: row.date,
      container_no: null,
      shipping_company: null,
      reference: row.reference,
      supplier: row.supplier,
      supplier_kind: "LOCAL",
    }, row);
  }
  // By day, containers before local deliveries, then by number or reference.
  return [...arrivals.values()]
    .map((arrival) => ({
      ...arrival,
      lines: arrival.lines.sort((a, b) =>
        a.brand.localeCompare(b.brand)
        || (a.variety ?? "").localeCompare(b.variety ?? "")
        // Largest size first; products without one last.
        || Number(a.size_kg === null) - Number(b.size_kg === null)
        || (b.size_kg ?? 0) - (a.size_kg ?? 0)),
    }))
    .sort((a, b) =>
      a.date.localeCompare(b.date)
      || (a.kind === b.kind ? 0 : a.kind === "CONTAINER" ? -1 : 1)
      || (a.container_no ?? a.reference ?? "").localeCompare(b.container_no ?? b.reference ?? ""));
}

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get("/reports/shipment-options", warehouseOnly, async (request) => {
    const query = shipmentOptionsQuery.parse(request.query);
    assertRange(query);
    if (query.source === "LOCAL") return [];

    return db
      .selectDistinct({
        id: shipments.id,
        reference: shipments.reference,
        date_list_received: shipments.dateListReceived,
        supplier_id: suppliers.id,
        supplier: suppliers.name,
        kind: suppliers.kind,
      })
      .from(shipments)
      .innerJoin(containers, eq(containers.shipmentId, shipments.id))
      .innerJoin(suppliers, eq(shipments.supplierId, suppliers.id))
      .where(and(
        unloadedIn(query.dateFrom, query.dateTo),
        query.source === "INTERNATIONAL" ? eq(suppliers.kind, "INTERNATIONAL") : undefined,
        query.source === "NATIONAL" ? eq(suppliers.kind, "NATIONAL") : undefined,
        query.supplierIds.length ? inArray(suppliers.id, query.supplierIds) : undefined,
      ))
      .orderBy(desc(shipments.dateListReceived), asc(suppliers.name));
  });

  /**
   * IDs of the products that received more than zero sacks under these
   * filters, for the report's product picker.
   */
  app.get("/reports/product-options", warehouseOnly, async (request) => {
    const query = productOptionsQuery.parse(request.query);
    assertRange(query);
    const totals = new Map<string, number>();
    for (const cell of await receivedCells({ ...query, productIds: [] })) {
      totals.set(cell.productId, (totals.get(cell.productId) ?? 0) + cell.sacks);
    }
    return [...totals].filter(([, sacks]) => sacks > 0).map(([productId]) => productId);
  });

  /**
   * Stock summary: inbound sacks per product per arrival day, for the
   * timeframe grids. `products` lists every active product (or the
   * filtered ones) so the client can show a brand's quiet sizes as zeros.
   */
  app.get("/reports/inbound", warehouseOnly, async (request) => {
    const query = inboundQuery.parse(request.query);
    assertRange(query);
    const [cells, arrivals] = await Promise.all([receivedCells(query), receivedArrivals(query)]);

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
      .orderBy(asc(productCategories.brand), asc(productCategories.variety), sql`${productCategories.sizeKg} desc nulls last`);

    return {
      products,
      cells: cells.map((cell) => ({ product_category_id: cell.productId, date: cell.date, sacks: cell.sacks })),
      arrivals,
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
        query.source === "INTERNATIONAL" ? eq(suppliers.kind, "INTERNATIONAL") : undefined,
        query.source === "NATIONAL" ? eq(suppliers.kind, "NATIONAL") : undefined,
        query.supplierIds.length ? inArray(suppliers.id, query.supplierIds) : undefined,
        query.shipmentIds.length ? inArray(shipments.id, query.shipmentIds) : undefined,
        query.productIds.length ? inArray(productCategories.id, query.productIds) : undefined,
      ));

    const localRows = query.source !== "ALL" && query.source !== "LOCAL" || query.shipmentIds.length ? [] : await db
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
        query.supplierIds.length ? inArray(suppliers.id, query.supplierIds) : undefined,
        query.productIds.length ? inArray(productCategories.id, query.productIds) : undefined,
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
      // Products without a size after the sized ones.
      || Number(a.size_kg === null) - Number(b.size_kg === null)
      || (a.size_kg ?? 0) - (b.size_kg ?? 0));
  });
}
