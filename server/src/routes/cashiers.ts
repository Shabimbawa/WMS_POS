import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cashiers } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const idParams = z.object({ id: z.uuid() });
const listQuery = z.object({
  // Query strings are text, so parse "true" explicitly instead of z.coerce,
  // which would read "false" as true.
  includeInactive: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});
const createBody = z.object({ name: z.string().trim().min(1).max(200) });
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.isActive !== undefined, {
    message: "Nothing to update",
  });

const cashierColumns = {
  id: cashiers.id,
  name: cashiers.name,
  isActive: cashiers.isActive,
};

/** Postgres unique_violation, possibly wrapped by drizzle. */
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}

const duplicateName = () =>
  new ApiError(409, "CASHIER_NAME_TAKEN", "A cashier with that name already exists");

export async function cashierRoutes(app: FastifyInstance): Promise<void> {
  const posOnly = { preHandler: requireRole("pos_admin") };

  app.get("/pos/cashiers", posOnly, async (request) => {
    const { includeInactive } = listQuery.parse(request.query);
    return db
      .select(cashierColumns)
      .from(cashiers)
      .where(includeInactive ? undefined : eq(cashiers.isActive, true))
      .orderBy(asc(cashiers.name));
  });

  app.post("/pos/cashiers", posOnly, async (request, reply) => {
    const { name } = createBody.parse(request.body);
    try {
      const [created] = await db.insert(cashiers).values({ name }).returning(cashierColumns);
      return reply.code(201).send(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  });

  // No DELETE on purpose: a cashier who leaves is deactivated, so the slips
  // assigned to them keep pointing at a real row.
  app.patch("/pos/cashiers/:id", posOnly, async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateBody.parse(request.body);
    try {
      const [updated] = await db
        .update(cashiers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(cashiers.id, id))
        .returning(cashierColumns);
      if (!updated) throw new ApiError(404, "CASHIER_NOT_FOUND", "Cashier was not found");
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  });
}
