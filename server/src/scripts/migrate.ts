import { readMigrationFiles, type MigrationConfig, type MigrationMeta } from "drizzle-orm/migrator";
import { closeDatabase, db } from "../db/client.js";

const config: MigrationConfig = { migrationsFolder: "drizzle" };

/**
 * Drizzle's migrate() applies every pending migration in one transaction.
 * PostgreSQL won't let a migration use an enum value added earlier in the same
 * transaction (0012 adds NATIONAL, 0013 uses it), so each migration is
 * committed on its own instead. Passing the list one entry longer each time
 * makes Drizzle apply only the newest pending one, in its own transaction.
 */
const { dialect, session } = db as unknown as {
  dialect: { migrate(migrations: MigrationMeta[], session: unknown, config: MigrationConfig): Promise<void> };
  session: unknown;
};

try {
  const migrations = readMigrationFiles(config);
  for (let count = 1; count <= migrations.length; count += 1) {
    await dialect.migrate(migrations.slice(0, count), session, config);
  }
  process.stdout.write("Database migrations applied successfully.\n");
} finally {
  await closeDatabase();
}
