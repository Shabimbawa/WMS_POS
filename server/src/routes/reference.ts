import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { productCategories, suppliers } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const supplierQuery = z.object({
  kind: z.enum(["INTERNATIONAL", "LOCAL"]).optional(),
});

const productQuery = z.object({
  availableOnly: z.stringbool().optional().default(false),
});

const idParams = z.object({ id: z.uuid() });

const createProduct = z.object({
  brand: z.string().trim().min(1).max(200),
  variety: z.string().trim().min(1).max(200).nullable().default(null),
  sizeKg: z.number().positive().max(10_000),
  code: z.string().trim().min(1).max(50).nullable().default(null),
  isAvailable: z.boolean().default(false),
  sellingPrice: z.number().nonnegative().nullable().default(null),
});

/**
 * sizeKg is deliberately absent: brand + variety + size is the product's
 * identity, and every container item and stock movement points at this row.
 * Changing a sack size would rewrite the weight of everything already counted.
 */
const updateProduct = z
  .object({
    brand: z.string().trim().min(1).max(200).optional(),
    variety: z.string().trim().min(1).max(200).nullable().optional(),
    code: z.string().trim().min(1).max(50).nullable().optional(),
    isAvailable: z.boolean().optional(),
    sellingPrice: z.number().nonnegative().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });

const productColumns = {
  id: productCategories.id,
  brand: productCategories.brand,
  variety: productCategories.variety,
  size_kg: productCategories.sizeKg,
  code: productCategories.code,
  is_available: productCategories.isAvailable,
  selling_price: productCategories.sellingPrice,
};

/** Postgres unique_violation, possibly wrapped by drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

/** product_category_identity_uq is lower(brand) + lower(variety) + size_kg. */
const duplicateProduct = () =>
  new ApiError(
    409,
    "PRODUCT_EXISTS",
    "A product with that brand, variety and size already exists",
  );

export async function referenceRoutes(app: FastifyInstance): Promise<void> {
  // Reads are shared with POS; writes to the catalogue are warehouse-only.
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get(
    "/suppliers",
    { preHandler: requireRole("warehouse_admin") },
    async (request) => {
      const query = supplierQuery.parse(request.query);
      return db
        .select({
          id: suppliers.id,
          name: suppliers.name,
          code: suppliers.code,
          kind: suppliers.kind,
          is_active: suppliers.isActive,
        })
        .from(suppliers)
        .where(
          query.kind
            ? and(eq(suppliers.isActive, true), eq(suppliers.kind, query.kind))
            : eq(suppliers.isActive, true),
        )
        .orderBy(asc(suppliers.name));
    },
  );

  app.get(
    "/products",
    { preHandler: requireRole("warehouse_admin", "pos_admin") },
    async (request) => {
      const query = productQuery.parse(request.query);
      return db
        .select(productColumns)
        .from(productCategories)
        .where(query.availableOnly ? eq(productCategories.isAvailable, true) : undefined)
        .orderBy(
          asc(productCategories.brand),
          asc(productCategories.variety),
          asc(productCategories.sizeKg),
        );
    },
  );

  // No stock handling here: the product_category trigger creates the
  // stock_balance row at 0, and quantities only ever move through the ledger.
  app.post("/products", warehouseOnly, async (request, reply) => {
    const body = createProduct.parse(request.body);
    try {
      const [created] = await db
        .insert(productCategories)
        .values(body)
        .returning(productColumns);
      return reply.code(201).send(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateProduct();
      throw error;
    }
  });

  // No DELETE: a product with movements or container items cannot be removed,
  // so retiring one is is_active = false.
  app.patch("/products/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateProduct.parse(request.body);
    try {
      const [updated] = await db
        .update(productCategories)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(productCategories.id, id))
        .returning(productColumns);
      if (!updated) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product was not found");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateProduct();
      throw error;
    }
  });
}
