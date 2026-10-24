import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "tokenHash",
  "token_hash",
  "authorization",
  "cookie",
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitize(item),
    ]),
  );
}

function routeInfo(method: string, route: string): { action: string; module: string } {
  const rules: Array<[RegExp, string, string]> = [
    [/\/auth\/login$/, "Signed in", "Authentication"],
    [/\/auth\/logout$/, "Signed out", "Authentication"],
    [/\/shipments\/:id\/archive$/, "Archived shipment", "Shipments"],
    [/\/shipments\/:id\/restore$/, "Restored shipment", "Shipments"],
    [/\/shipments\/:id$/, method === "DELETE" ? "Deleted shipment" : "Updated shipment", "Shipments"],
    [/\/shipments$/, "Registered shipment", "Shipments"],
    [/\/containers\/:id\/arrive-at-port$/, "Marked container at port", "Containers"],
    [/\/containers\/:id\/hauling$/, "Changed hauling assignment", "Containers"],
    [/\/containers\/:id\/dates$/, "Edited container dates", "Containers"],
    [/\/containers\/:id\/move-back$/, "Moved container back", "Containers"],
    [/\/containers\/:id\/deliver$/, "Marked container delivered", "Containers"],
    [/\/containers\/:id\/cancel$/, "Cancelled container", "Containers"],
    [/\/containers\/:id\/unload$/, "Unloaded container", "Containers"],
    [/\/deliveries\/:id\/void$/, "Voided local delivery", "Local deliveries"],
    [/\/deliveries\/:id$/, "Updated local delivery", "Local deliveries"],
    [/\/deliveries$/, "Recorded local delivery", "Local deliveries"],
    [/\/stock\/adjustments$/, "Adjusted stock", "Inventory"],
    [/\/discrepancies\/:id\/resolve$/, "Resolved discrepancy", "Discrepancies"],
    [/\/shipping-companies\/:id$/, method === "DELETE" ? "Deactivated shipping company" : "Updated shipping company", "Shipping companies"],
    [/\/shipping-companies$/, "Created shipping company", "Shipping companies"],
    [/\/suppliers\/:id$/, method === "DELETE" ? "Deactivated supplier" : "Updated supplier", "Suppliers"],
    [/\/suppliers$/, "Created supplier", "Suppliers"],
    [/\/products\/:id$/, "Updated product", "Products"],
    [/\/products$/, "Created product", "Products"],
    [/\/pos\/cashiers\/:id$/, "Updated cashier", "Cashiers"],
    [/\/pos\/cashiers$/, "Created cashier", "Cashiers"],
    [/\/order-slips\/:id\/restore$/, "Restored order slip", "Order slips"],
    [/\/order-slips\/trash\/:id$/, "Permanently deleted order slip", "Order slips"],
    [/\/order-slips\/trash$/, "Emptied order slip trash", "Order slips"],
    [/\/order-slips\/:id$/, method === "DELETE" ? "Moved order slip to trash" : "Updated order slip", "Order slips"],
    [/\/order-slips$/, "Created order slip", "Order slips"],
  ];
  for (const [pattern, action, module] of rules) {
    if (pattern.test(route)) return { action, module };
  }
  return { action: `${method} ${route}`, module: "System" };
}

function recordId(request: FastifyRequest): string | null {
  const params = (request.params ?? {}) as Record<string, unknown>;
  const value = params.id ?? params.containerId;
  return typeof value === "string" ? value : null;
}

export async function auditLogPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onResponse", async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    const route = request.routeOptions.url || request.url.split("?")[0] || request.url;
    const { action, module } = routeInfo(request.method, route);
    const loginEmail = route.endsWith("/auth/login")
      ? (request.body as { email?: unknown } | null)?.email
      : undefined;

    try {
      await db.insert(auditLogs).values({
        actorUserId: request.currentUser?.id ?? null,
        actorEmail: request.currentUser?.email ?? (typeof loginEmail === "string" ? loginEmail : null),
        actorRole: request.currentUser?.role ?? null,
        action,
        module,
        method: request.method,
        route,
        recordId: recordId(request),
        details: sanitize(request.body),
        statusCode: reply.statusCode,
        success: reply.statusCode < 400,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
    } catch (error) {
      request.log.error({ err: error }, "could not write audit log");
    }
  });
}
