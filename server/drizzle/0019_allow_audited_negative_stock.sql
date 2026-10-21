ALTER TABLE "stock_balance" DROP CONSTRAINT IF EXISTS "stock_balance_nonnegative";
ALTER TABLE "stock_movement" DROP CONSTRAINT IF EXISTS "stock_movement_balance_nonnegative";
