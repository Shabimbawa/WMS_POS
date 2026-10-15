import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, db } from "../db/client.js";

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  process.stdout.write("Database migrations applied successfully.\n");
} finally {
  await closeDatabase();
}
