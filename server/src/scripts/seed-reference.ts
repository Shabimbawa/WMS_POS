/**
 * Seeds the reference data every other flow depends on: suppliers and the
 * product catalogue, transcribed from the Supabase MVP database.
 *
 * Idempotent — re-running skips rows that already exist, because both tables
 * carry unique indexes (supplier name/code, and brand+variety+size).
 *
 * Usage: npm run seed
 */
import { sql } from "drizzle-orm";
import { closeDatabase, db } from "../db/client.js";
import { productCategories, stockBalances, suppliers } from "../db/schema.js";

const SUPPLIERS: Array<{ name: string; code: string | null }> = [
  { name: "GY", code: "GY" },
  { name: "LI CY", code: "LI CY" },
  // Possibly a misreading of "LI CY" in the notebooks — kept separate until confirmed.
  { name: "LI LY", code: "LI LY" },
];

/** [brand, variety, size_kg, notebook code, is_available] */
type ProductSeed = [string, string | null, number, string | null, boolean];

const PRODUCTS: ProductSeed[] = [
  ["Bea", null, 5, null, false],
  ["Bea", null, 10, null, false],
  ["Bea", null, 25, null, false],
  ["Bea", null, 50, null, false],
  ["Binhi", null, 25, null, true],
  ["Binhi", null, 50, null, false],
  ["Carlos Uno", null, 25, null, false],
  ["Crack Corn", null, 25, null, true],
  ["Dona Conchita", "Blue", 5, null, true],
  ["Dona Conchita", "Blue", 25, null, true],
  ["Dona Conchita", "Blue", 50, null, true],
  ["Dona Conchita", "Orange", 5, null, true],
  ["Dona Conchita", "Orange", 25, null, true],
  ["Dona Conchita", "Orange", 50, null, true],
  ["Dona Conchita", "Pink", 5, null, true],
  ["Dona Conchita", "Pink", 25, null, true],
  ["Excellent", null, 5, null, true],
  ["Excellent", null, 25, null, true],
  ["Excellent", null, 50, null, true],
  ["Ganador", null, 5, "G", true],
  ["Ganador", null, 10, "G", true],
  ["Ganador", null, 25, "G", true],
  ["Ganador", null, 50, "G", true],
  ["Grandeur", null, 5, null, false],
  ["Grandeur", null, 10, null, false],
  ["Grandeur", null, 25, null, false],
  ["Grandeur", null, 50, null, false],
  ["Ivory", "Red", 5, null, true],
  ["Ivory", "Red", 25, null, true],
  ["Ivory", "Red", 50, null, true],
  ["Jaguar", "Blue", 25, null, false],
  ["Jaguar", "Blue", 50, null, false],
  ["L-King", "Blue", 5, "L", true],
  ["L-King", "Blue", 25, "L", true],
  ["L-King", "Blue", 50, "L", true],
  ["Lion Ivory", null, 5, "L-I", true],
  ["Lion Ivory", null, 10, "L-I", true],
  ["Lion Ivory", null, 25, "L-I", true],
  ["Lion Ivory", null, 50, "L-I", true],
  ["Oil", null, 14, null, true],
  ["Palawan", null, 5, "PAL", true],
  ["Palawan", null, 25, "PAL", true],
  ["Palawan", null, 50, "PAL", true],
  ["Palawan", "Blue 5%", 5, null, true],
  ["Palawan", "Blue 5%", 25, null, true],
  ["Palawan", "Blue 5%", 50, null, true],
  ["Palawan", "Japonica", 5, null, true],
  ["Palawan", "Japonica", 25, null, true],
  ["Palawan", "Japonica", 50, null, true],
  ["Palawan", "Jasmin Broken", 50, null, false],
  ["Palawan", "Lami-Ah (Red)", 5, "P/LAMI", true],
  ["Palawan", "Lami-Ah (Red)", 25, "P/LAMI", true],
  ["Palawan", "Lami-Ah (Red)", 50, "P/LAMI", true],
  ["Palawan", "Violet", 50, null, true],
  ["PDP", null, 50, null, true],
  ["Pilit", null, 50, null, false],
  ["Planters", "Blue", 25, null, false],
  ["Planters", "Blue", 50, null, false],
  ["Planters", "White", 25, null, false],
  ["Planters", "White", 50, null, false],
  ["Planters", "Yellow", 25, null, false],
  ["Planters", "Yellow", 50, null, false],
  ["Princess Mia", null, 5, null, false],
  ["Princess Raya", null, 5, null, false],
  ["Princess Raya", null, 25, null, false],
  ["Princess Raya", null, 50, null, false],
  ["Queen Bee", null, 25, null, false],
  ["Wowowee", null, 5, null, true],
  ["Wowowee", null, 10, null, false],
  ["Wowowee", null, 25, null, true],
  ["Wowowee", null, 50, null, true],
];

try {
  // No conflict target: both tables guard identity with expression-based
  // unique indexes, which onConflictDoNothing() covers without naming them.
  const insertedSuppliers = await db
    .insert(suppliers)
    .values(SUPPLIERS)
    .onConflictDoNothing()
    .returning({ id: suppliers.id });

  // selling_price stays null: the wall price list has never been transcribed,
  // and a guessed price is worse than none. is_available is the sale signal.
  const insertedProducts = await db
    .insert(productCategories)
    .values(
      PRODUCTS.map(([brand, variety, sizeKg, code, isAvailable]) => ({
        brand,
        variety,
        sizeKg,
        code,
        isAvailable,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: productCategories.id });

  // The product_category trigger already creates these, so this only backfills
  // products that predate it.
  await db.execute(sql`
    insert into ${stockBalances} (product_category_id, remaining_qty)
    select id, 0 from ${productCategories}
    on conflict (product_category_id) do nothing
  `);

  process.stdout.write(
    `Seeded ${insertedSuppliers.length} suppliers and ${insertedProducts.length} products ` +
      `(${SUPPLIERS.length - insertedSuppliers.length} and ${PRODUCTS.length - insertedProducts.length} already present)\n`,
  );
} finally {
  await closeDatabase();
}
