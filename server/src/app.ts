import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config, isProduction } from "./config.js";
import { ApiError } from "./lib/api-error.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { cashierRoutes } from "./routes/cashiers.js";
import { healthRoutes } from "./routes/health.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { orderRoutes } from "./routes/orders.js";
import { referenceRoutes } from "./routes/reference.js";
import { shipmentRoutes } from "./routes/shipments.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cookie);
  if (!isProduction) {
    await app.register(cors, {
      origin: config.VITE_DEV_ORIGIN,
      credentials: true,
    });
  }

  // Set these before registering routes. `await app.register()` loads a
  // plugin immediately, and it keeps whichever handlers exist at that moment,
  // so handlers set afterwards never reach the route plugins.
  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request is invalid",
          details: error.flatten(),
        },
      });
    }
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }

    request.log.error({ err: error }, "unhandled request error");
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
  });

  // Install this hook on the root instance. Registering it as a normal Fastify
  // plugin would encapsulate it, so sibling route plugins would never receive
  // the authenticated currentUser.
  await authPlugin(app);
  await app.register(healthRoutes, { prefix: "/api/v1" });
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(referenceRoutes, { prefix: "/api/v1" });
  await app.register(shipmentRoutes, { prefix: "/api/v1" });
  await app.register(inventoryRoutes, { prefix: "/api/v1" });
  await app.register(orderRoutes, { prefix: "/api/v1" });
  await app.register(cashierRoutes, { prefix: "/api/v1" });

  return app;
}
