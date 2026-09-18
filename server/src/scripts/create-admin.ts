import { sql } from "drizzle-orm";
import { z } from "zod";
import { closeDatabase, db } from "../db/client.js";
import { appUsers, profiles } from "../db/schema.js";
import { hashPassword } from "../lib/password.js";
import { PROFILE_ROLES } from "../types/roles.js";

const args = z
  .object({
    email: z.string().email(),
    password: z.string().min(10),
    role: z.enum(PROFILE_ROLES),
  })
  .parse({
    email: process.argv[2],
    password: process.argv[3],
    role: process.argv[4] ?? "warehouse_admin",
  });

try {
  const existing = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(sql`lower(${appUsers.email}) = lower(${args.email})`)
    .limit(1);
  if (existing.length) throw new Error("A user with that email already exists");

  const passwordHash = await hashPassword(args.password);
  const [user] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(appUsers)
      .values({ email: args.email.trim().toLowerCase(), passwordHash })
      .returning({ id: appUsers.id, email: appUsers.email });
    if (!inserted[0]) throw new Error("User creation returned no row");
    await tx.insert(profiles).values({ userId: inserted[0].id, role: args.role });
    return inserted;
  });

  process.stdout.write(`Created ${args.role} ${user!.email}\n`);
} finally {
  await closeDatabase();
}

