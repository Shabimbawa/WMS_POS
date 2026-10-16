import type { FastifyInstance } from "fastify";
import { and, asc, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import { requireRole } from "../plugins/auth.js";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  module: z.string().trim().optional(),
  success: z.stringbool().optional(),
  search: z.string().trim().max(200).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/audit-logs",
    { preHandler: requireRole("warehouse_admin", "pos_admin") },
    async (request) => {
      const query = querySchema.parse(request.query);
      const filters = [
        ...(query.dateFrom ? [gte(auditLogs.occurredAt, new Date(`${query.dateFrom}T00:00:00.000+08:00`))] : []),
        ...(query.dateTo ? [lte(auditLogs.occurredAt, new Date(`${query.dateTo}T23:59:59.999+08:00`))] : []),
        ...(query.module ? [eq(auditLogs.module, query.module)] : []),
        ...(query.success !== undefined ? [eq(auditLogs.success, query.success)] : []),
        ...(query.search ? [or(
          ilike(auditLogs.action, `%${query.search}%`),
          ilike(auditLogs.actorEmail, `%${query.search}%`),
          ilike(auditLogs.recordId, `%${query.search}%`),
        )!] : []),
      ];
      const where = filters.length ? and(...filters) : undefined;
      const [totalRow] = await db.select({ value: count() }).from(auditLogs).where(where);
      const rows = await db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(query.sortDir === "asc" ? asc(auditLogs.occurredAt) : desc(auditLogs.occurredAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const total = totalRow?.value ?? 0;
      return { rows, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
    },
  );
}
