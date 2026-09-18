import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { appUsers, profiles, sessions } from "../db/schema.js";
import { ApiError } from "../lib/api-error.js";
import { verifyPassword } from "../lib/password.js";
import { createSessionToken, hashSessionToken } from "../lib/session.js";
import { requireUser, sessionCookieOptions } from "../plugins/auth.js";

const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    const input = loginBody.parse(request.body);
    const [user] = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        passwordHash: appUsers.passwordHash,
        role: profiles.role,
      })
      .from(appUsers)
      .innerJoin(profiles, eq(profiles.userId, appUsers.id))
      .where(and(sql`lower(${appUsers.email}) = lower(${input.email})`, eq(appUsers.isActive, true)))
      .limit(1);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    reply.setCookie(config.SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions,
      expires: expiresAt,
    });
    return { user: { id: user.id, email: user.email, role: user.role } };
  });

  app.post("/logout", { preHandler: requireUser }, async (request, reply) => {
    await db.delete(sessions).where(eq(sessions.id, request.currentUser!.sessionId));
    reply.clearCookie(config.SESSION_COOKIE_NAME, sessionCookieOptions);
    return reply.code(204).send();
  });

  app.get("/me", { preHandler: requireUser }, async (request) => ({
    user: {
      id: request.currentUser!.id,
      email: request.currentUser!.email,
      role: request.currentUser!.role,
    },
  }));
}

