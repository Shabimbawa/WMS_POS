import type { ProfileRole } from "./roles.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: {
      id: string;
      email: string;
      role: ProfileRole;
      sessionId: string;
    } | null;
  }
}

export {};

