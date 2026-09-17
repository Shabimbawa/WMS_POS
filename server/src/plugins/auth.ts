import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, gt } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { appUsers, profiles, sessions } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { hashSessionToken } from "../lib/session.js";
import type { ProfileRole } from "../types/roles.js";

export const sessionCookieOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.SESSION_COOKIE_SECURE,
};

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("currentUser", null);

  app.addHook("preHandler", async (request) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    if (!token) return;

    const [row] = await db
      .select({
        sessionId: sessions.id,
        userId: appUsers.id,
        email: appUsers.email,
        role: profiles.role,
      })
      .from(sessions)
      .innerJoin(appUsers, eq(sessions.userId, appUsers.id))
      .innerJoin(profiles, eq(profiles.userId, appUsers.id))
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(token)),
          gt(sessions.expiresAt, new Date()),
          eq(appUsers.isActive, true),
        ),
      )
      .limit(1);

    if (row) {
      request.currentUser = {
        id: row.userId,
        email: row.email,
        role: row.role,
        sessionId: row.sessionId,
      };
    }
  });
}

export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required");
  }
}

export function requireRole(...roles: ProfileRole[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.currentUser) {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required");
    }
    if (!roles.includes(request.currentUser.role)) {
      throw new ApiError(403, "FORBIDDEN", "You do not have access to this operation");
    }
  };
}
