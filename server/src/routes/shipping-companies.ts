import type { FastifyInstance } from "fastify";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { shippingCompanies, shippingCompanyCodes } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { requireRole } from "../plugins/auth.js";

const idParams = z.object({ id: z.uuid() });

const createShippingCompany = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(50).nullable().optional(),
  codes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  gracePeriodDays: z.number().int().min(1).max(3650),
});

const updateShippingCompany = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(50).nullable().optional(),
    codes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    gracePeriodDays: z.number().int().min(1).max(3650).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Nothing to update",
  });

const shippingCompanyColumns = {
  id: shippingCompanies.id,
  name: shippingCompanies.name,
  code: shippingCompanies.code,
  grace_period_days: shippingCompanies.gracePeriodDays,
  is_active: shippingCompanies.isActive,
};

function normalizedCodes(input: { code?: string | null | undefined; codes?: string[] | undefined }): string[] {
  const source = input.codes ?? (input.code ? [input.code] : []);
  return [...new Set(source.map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

function withCodes<T extends { id: string; code: string | null }>(
  company: T,
  codes: string[],
) {
  return { ...company, code: codes[0] ?? company.code, codes };
}

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
    const companies = await db
      .select(shippingCompanyColumns)
      .from(shippingCompanies)
      .where(eq(shippingCompanies.isActive, true))
      .orderBy(asc(shippingCompanies.name));
    if (!companies.length) return [];

    const codeRows = await db
      .select({ shippingCompanyId: shippingCompanyCodes.shippingCompanyId, code: shippingCompanyCodes.code })
      .from(shippingCompanyCodes)
      .where(inArray(shippingCompanyCodes.shippingCompanyId, companies.map((company) => company.id)))
      .orderBy(asc(shippingCompanyCodes.code));
    const codesByCompany = new Map<string, string[]>();
    for (const row of codeRows) {
      const current = codesByCompany.get(row.shippingCompanyId) ?? [];
      current.push(row.code);
      codesByCompany.set(row.shippingCompanyId, current);
    }
    return companies.map((company) => withCodes(company, codesByCompany.get(company.id) ?? []));
  });

  app.post("/shipping-companies", warehouseOnly, async (request, reply) => {
    const body = createShippingCompany.parse(request.body);
    const codes = normalizedCodes(body);
    try {
      const created = await db.transaction(async (tx) => {
        const [company] = await tx
          .insert(shippingCompanies)
          .values({
            name: body.name,
            code: codes[0] ?? null,
            gracePeriodDays: body.gracePeriodDays,
          })
          .returning(shippingCompanyColumns);
        if (!company) throw new ApiError(500, "CREATE_FAILED", "Shipping company was not created");
        if (codes.length) {
          await tx.insert(shippingCompanyCodes).values(
            codes.map((code) => ({ shippingCompanyId: company.id, code })),
          );
        }
        return withCodes(company, codes);
      });
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
    const replacesCodes = body.codes !== undefined || body.code !== undefined;
    const codes = normalizedCodes(body);
    try {
      return await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(shippingCompanies)
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
            ...(body.gracePeriodDays !== undefined ? { gracePeriodDays: body.gracePeriodDays } : {}),
            ...(replacesCodes ? { code: codes[0] ?? null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(shippingCompanies.id, id))
          .returning(shippingCompanyColumns);
        if (!updated) {
          throw new ApiError(404, "SHIPPING_COMPANY_NOT_FOUND", "Shipping company was not found");
        }

        if (replacesCodes) {
          await tx.delete(shippingCompanyCodes).where(eq(shippingCompanyCodes.shippingCompanyId, id));
          if (codes.length) {
            await tx.insert(shippingCompanyCodes).values(
              codes.map((code) => ({ shippingCompanyId: id, code })),
            );
          }
        }
        const currentCodes = replacesCodes
          ? codes
          : (await tx
              .select({ code: shippingCompanyCodes.code })
              .from(shippingCompanyCodes)
              .where(eq(shippingCompanyCodes.shippingCompanyId, id))
              .orderBy(asc(shippingCompanyCodes.code)))
              .map((row) => row.code);
        return withCodes(updated, currentCodes);
      });
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
    const codes = await db
      .select({ code: shippingCompanyCodes.code })
      .from(shippingCompanyCodes)
      .where(eq(shippingCompanyCodes.shippingCompanyId, id))
      .orderBy(asc(shippingCompanyCodes.code));
    return withCodes(updated, codes.map((row) => row.code));
  });
}
