import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_NAME: z.string().min(1).default("wms_session"),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  SESSION_COOKIE_SECURE: z.stringbool().default(false),
  VITE_DEV_ORIGIN: z.string().url().default("http://localhost:5173"),
});

export const config = configSchema.parse(process.env);
export const isProduction = config.NODE_ENV === "production";
