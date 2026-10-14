import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { suppliers } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const idParams = z.object({ id: z.uuid() });

const updateSupplier = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(50).nullable().optional(),
    origin: z.string().trim().min(1).max(200).nullable().optional(),
    kind: z.enum(["INTERNATIONAL", "LOCAL", "NATIONAL"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });

const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  code: suppliers.code,
  origin: suppliers.origin,
  kind: suppliers.kind,
  is_active: suppliers.isActive,
};

/** Postgres unique_violation, possibly wrapped by drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

export async function supplierRoutes(app: FastifyInstance): Promise<void> {
  const warehouseOnly = { preHandler: requireRole("warehouse_admin") };

  app.patch("/suppliers/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateSupplier.parse(request.body);
    try {
      const [updated] = await db
        .update(suppliers)
        .set({ ...body })
        .where(eq(suppliers.id, id))
        .returning(supplierColumns);
      if (!updated) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "SUPPLIER_EXISTS", "A supplier with that name or code already exists");
      }
      throw error;
    }
  });

  app.delete("/suppliers/:id", warehouseOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const [supplier] = await db
      .select({ isActive: suppliers.isActive })
      .from(suppliers)
      .where(eq(suppliers.id, id));
    if (!supplier) throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier was not found");

    const updated = await db
      .update(suppliers)
      .set({ isActive: false })
      .where(eq(suppliers.id, id))
      .returning(supplierColumns);
    if (!updated[0]) throw new ApiError(500, "DELETE_FAILED", "Supplier was not deleted");
    return updated[0];
  });
}
