import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { shippingCompanies } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const idParams = z.object({ id: z.uuid() });

const createShippingCompany = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50).nullable().default(null),
});

const updateShippingCompany = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(50).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Nothing to update",
  });

const shippingCompanyColumns = {
  id: shippingCompanies.id,
  name: shippingCompanies.name,
  code: shippingCompanies.code,
  is_active: shippingCompanies.isActive,
};

/** Postgres unique_violation, possibly wrapped by drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return (
    code(error) === "23505" ||
    code((error as { cause?: unknown } | null)?.cause) === "23505"
  );
}

export async function shippingCompanyRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.get("/shipping-companies", warehouseOnly, async () => {
    return db
      .select(shippingCompanyColumns)
      .from(shippingCompanies)
      .where(eq(shippingCompanies.isActive, true))
      .orderBy(asc(shippingCompanies.name));
  });

  app.post("/shipping-companies", warehouseOnly, async (request, reply) => {
    const body = createShippingCompany.parse(request.body);
    try {
      const [created] = await db
        .insert(shippingCompanies)
        .values(body)
        .returning(shippingCompanyColumns);
      return reply.code(201).send(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          "SHIPPING_COMPANY_EXISTS",
          "A shipping company with that name or code already exists",
        );
      }
      throw error;
    }
  });

  app.patch("/shipping-companies/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateShippingCompany.parse(request.body);
    try {
      const [updated] = await db
        .update(shippingCompanies)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(shippingCompanies.id, id))
        .returning(shippingCompanyColumns);
      if (!updated) {
        throw new ApiError(404, "SHIPPING_COMPANY_NOT_FOUND", "Shipping company was not found");
      }
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          "SHIPPING_COMPANY_EXISTS",
          "A shipping company with that name or code already exists",
        );
      }
      throw error;
    }
  });

  app.delete("/shipping-companies/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const [shippingCompany] = await db
      .select({ isActive: shippingCompanies.isActive })
      .from(shippingCompanies)
      .where(eq(shippingCompanies.id, id));
    if (!shippingCompany) {
      throw new ApiError(404, "SHIPPING_COMPANY_NOT_FOUND", "Shipping company was not found");
    }

    const [updated] = await db
      .update(shippingCompanies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(shippingCompanies.id, id))
      .returning(shippingCompanyColumns);
    if (!updated) {
      throw new ApiError(500, "DELETE_FAILED", "Shipping company was not deleted");
    }
    return updated;
  });
}
