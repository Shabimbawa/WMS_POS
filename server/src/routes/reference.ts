import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { productCategories, suppliers } from "../db/schema.js";
import { requireRole } from "../plugins/auth.js";

const productQuery = z.object({
  availableOnly: z.stringbool().optional().default(false),
});

export async function referenceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/suppliers",
    { preHandler: requireRole("warehouse_admin") },
    async () => db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        code: suppliers.code,
        is_active: suppliers.isActive,
      })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(asc(suppliers.name)),
  );

  app.get(
    "/products",
    { preHandler: requireRole("warehouse_admin", "pos_admin") },
    async (request) => {
      const query = productQuery.parse(request.query);
      return db
        .select({
          id: productCategories.id,
          brand: productCategories.brand,
          variety: productCategories.variety,
          size_kg: productCategories.sizeKg,
          code: productCategories.code,
          is_available: productCategories.isAvailable,
          selling_price: productCategories.sellingPrice,
        })
        .from(productCategories)
        .where(query.availableOnly ? eq(productCategories.isAvailable, true) : undefined)
        .orderBy(
          asc(productCategories.brand),
          asc(productCategories.variety),
          asc(productCategories.sizeKg),
        );
    },
  );
}
