import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const profileRole = pgEnum("profile_role", [
  "warehouse_admin",
  "pos_admin",
]);

export const containerStatus = pgEnum("container_status", [
  "DOCUMENTED",
  "ARRIVED_AT_PORT",
  "DELIVERED",
  "UNLOADED",
  "CANCELLED",
]);

export const discrepancyReason = pgEnum("discrepancy_reason", [
  "SHORT",
  "OVER",
  "DAMAGED",
  "UNDECLARED",
  "OTHER",
]);

export const paymentStatus = pgEnum("payment_status", [
  "paid",
  "unpaid",
  "partial",
]);

export const stockMovementType = pgEnum("stock_movement_type", [
  "OPENING_BALANCE",
  "INBOUND_UNLOAD",
  "OUTBOUND_ORDER",
  "ORDER_REVERSAL",
  "MANUAL_ADJUSTMENT",
]);

const auditTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const appUsers = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditTimestamps,
  },
  (table) => [uniqueIndex("app_user_email_lower_uq").on(sql`lower(${table.email})`)],
);

export const profiles = pgTable("profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
  role: profileRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("session_token_hash_uq").on(table.tokenHash),
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);

export const suppliers = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("supplier_name_lower_uq").on(sql`lower(${table.name})`),
    uniqueIndex("supplier_code_lower_uq")
      .on(sql`lower(${table.code})`)
      .where(sql`${table.code} is not null`),
  ],
);

export const productCategories = pgTable(
  "product_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brand: text("brand").notNull(),
    variety: text("variety"),
    sizeKg: numeric("size_kg", { precision: 10, scale: 3, mode: "number" }).notNull(),
    code: text("code"),
    isActive: boolean("is_active").notNull().default(true),
    isAvailable: boolean("is_available").notNull().default(false),
    sellingPrice: numeric("selling_price", { precision: 14, scale: 2, mode: "number" }),
    ...auditTimestamps,
  },
  (table) => [
    check("product_category_size_positive", sql`${table.sizeKg} > 0`),
    check(
      "product_category_selling_price_nonnegative",
      sql`${table.sellingPrice} is null or ${table.sellingPrice} >= 0`,
    ),
    uniqueIndex("product_category_identity_uq").on(
      sql`lower(${table.brand})`,
      sql`lower(coalesce(${table.variety}, ''))`,
      table.sizeKg,
    ),
  ],
);

export const shipments = pgTable(
  "shipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    dateListReceived: date("date_list_received", { mode: "string" }).notNull(),
    reference: text("reference"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("shipment_supplier_id_idx").on(table.supplierId),
    index("shipment_date_list_received_idx").on(table.dateListReceived),
  ],
);

export const containers = pgTable(
  "container",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shipmentId: uuid("shipment_id")
      .notNull()
      .references(() => shipments.id, { onDelete: "cascade" }),
    containerNo: text("container_no"),
    isCompanyTruck: boolean("is_company_truck").notNull().default(true),
    dateArrivedAtPort: date("date_arrived_at_port", { mode: "string" }),
    dateDelivered: date("date_delivered", { mode: "string" }),
    dateUnloaded: date("date_unloaded", { mode: "string" }),
    status: containerStatus("status").notNull().default("DOCUMENTED"),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    itemsMatch: boolean("items_match"),
    ...auditTimestamps,
  },
  (table) => [
    index("container_shipment_id_idx").on(table.shipmentId),
    index("container_number_lower_idx")
      .on(sql`lower(${table.containerNo})`)
      .where(sql`${table.containerNo} is not null`),
    check(
      "container_lifecycle_dates_ck",
      sql`
        (${table.status} = 'DOCUMENTED' and ${table.dateDelivered} is null and ${table.dateUnloaded} is null)
        or (${table.status} = 'ARRIVED_AT_PORT' and ${table.dateArrivedAtPort} is not null and ${table.dateDelivered} is null and ${table.dateUnloaded} is null)
        or (${table.status} = 'DELIVERED' and ${table.dateDelivered} is not null and ${table.dateUnloaded} is null)
        or (${table.status} = 'UNLOADED' and ${table.dateDelivered} is not null and ${table.dateUnloaded} is not null)
        or (${table.status} = 'CANCELLED' and ${table.dateUnloaded} is null)
      `,
    ),
    check(
      "container_date_order_ck",
      sql`${table.dateUnloaded} is null or ${table.dateDelivered} is null or ${table.dateUnloaded} >= ${table.dateDelivered}`,
    ),
  ],
);

export const containerItems = pgTable(
  "container_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    productCategoryId: uuid("product_category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    qtySacks: integer("qty_sacks").notNull(),
    actualQtySacks: integer("actual_qty_sacks"),
    pricePerSack: numeric("price_per_sack", { precision: 14, scale: 2, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("container_item_product_uq").on(
      table.containerId,
      table.productCategoryId,
    ),
    check("container_item_qty_nonnegative", sql`${table.qtySacks} >= 0`),
    check(
      "container_item_actual_qty_nonnegative",
      sql`${table.actualQtySacks} is null or ${table.actualQtySacks} >= 0`,
    ),
    check(
      "container_item_price_nonnegative",
      sql`${table.pricePerSack} is null or ${table.pricePerSack} >= 0`,
    ),
  ],
);

export const containerDiscrepancies = pgTable(
  "container_discrepancy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerId: uuid("container_id")
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    containerItemId: uuid("container_item_id").references(() => containerItems.id, {
      onDelete: "restrict",
    }),
    productCategoryId: uuid("product_category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    declaredQty: integer("declared_qty"),
    actualQty: integer("actual_qty"),
    reason: discrepancyReason("reason").notNull(),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => appUsers.id, { onDelete: "set null" }),
    resolutionNote: text("resolution_note"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("container_discrepancy_container_idx").on(table.containerId),
    check(
      "container_discrepancy_quantities_nonnegative",
      sql`(${table.declaredQty} is null or ${table.declaredQty} >= 0) and (${table.actualQty} is null or ${table.actualQty} >= 0)`,
    ),
    check(
      "container_discrepancy_shape_ck",
      sql`
        (${table.reason} in ('SHORT', 'OVER', 'DAMAGED', 'UNDECLARED') and ${table.actualQty} is not null)
        or (${table.reason} = 'OTHER' and length(trim(coalesce(${table.note}, ''))) > 0)
      `,
    ),
  ],
);

/**
 * People an order slip is assigned to. Plain records, not logins: a
 * pos_admin picks one per slip. Deactivated rather than deleted, so old
 * slips keep their cashier.
 */
export const cashiers = pgTable(
  "cashier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex("cashier_name_lower_uq").on(sql`lower(${table.name})`),
    check("cashier_name_nonempty", sql`length(trim(${table.name})) > 0`),
  ],
);

export const orderSlips = pgTable(
  "order_slip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Restarts at 1 each day, per `date` (Philippine time — the date is
     * a calendar day, not a timestamp). Assigned by the API under an
     * advisory lock; unique together with `date`, not on its own.
     */
    slipNumber: integer("slip_number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => cashiers.id, { onDelete: "restrict" }),
    orderBy: text("order_by").notNull(),
    address: text("address").notNull().default(""),
    status: paymentStatus("status").notNull(),
    paymentDueDate: date("payment_due_date", { mode: "string" }).notNull(),
    totalAmount: numeric("total_amount", { precision: 16, scale: 2, mode: "number" }).notNull(),
    revision: integer("revision").notNull().default(1),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => appUsers.id, { onDelete: "set null" }),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex("order_slip_date_number_uq").on(table.date, table.slipNumber),
    index("order_slip_cashier_date_idx").on(table.cashierId, table.date),
    check("order_slip_number_positive", sql`${table.slipNumber} > 0`),
    check("order_slip_total_nonnegative", sql`${table.totalAmount} >= 0`),
    check("order_slip_due_date_ck", sql`${table.paymentDueDate} >= ${table.date}`),
    check("order_slip_order_by_nonempty", sql`length(trim(${table.orderBy})) > 0`),
  ],
);

export const orderSlipItems = pgTable(
  "order_slip_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderSlipId: uuid("order_slip_id")
      .notNull()
      .references(() => orderSlips.id, { onDelete: "cascade" }),
    productCategoryId: uuid("product_category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull(),
    lineTotal: numeric("line_total", { precision: 16, scale: 2, mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("order_slip_item_product_uq").on(
      table.orderSlipId,
      table.productCategoryId,
    ),
    check("order_slip_item_quantity_positive", sql`${table.quantity} > 0`),
    check("order_slip_item_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
    check(
      "order_slip_item_line_total_ck",
      sql`${table.lineTotal} = ${table.quantity} * ${table.unitPrice}`,
    ),
  ],
);

export const stockBalances = pgTable("stock_balance", {
  productCategoryId: uuid("product_category_id")
    .primaryKey()
    .references(() => productCategories.id, { onDelete: "restrict" }),
  remainingQty: integer("remaining_qty").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("stock_balance_nonnegative", sql`${table.remainingQty} >= 0`),
]);

export const stockMovements = pgTable(
  "stock_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id").notNull(),
    productCategoryId: uuid("product_category_id")
      .notNull()
      .references(() => productCategories.id, { onDelete: "restrict" }),
    movementType: stockMovementType("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    containerId: uuid("container_id").references(() => containers.id, { onDelete: "restrict" }),
    orderSlipId: uuid("order_slip_id").references(() => orderSlips.id, { onDelete: "restrict" }),
    orderRevision: integer("order_revision"),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movement_product_occurred_idx").on(
      table.productCategoryId,
      table.occurredAt,
    ),
    index("stock_movement_batch_idx").on(table.batchId),
    index("stock_movement_container_idx").on(table.containerId),
    index("stock_movement_order_slip_idx").on(table.orderSlipId),
    check("stock_movement_delta_nonzero", sql`${table.quantityDelta} <> 0`),
    check("stock_movement_balance_nonnegative", sql`${table.balanceAfter} >= 0`),
    check(
      "stock_movement_source_ck",
      sql`
        (${table.movementType} = 'INBOUND_UNLOAD' and ${table.containerId} is not null and ${table.orderSlipId} is null)
        or (${table.movementType} in ('OUTBOUND_ORDER', 'ORDER_REVERSAL') and ${table.orderSlipId} is not null and ${table.containerId} is null and ${table.orderRevision} is not null)
        or (${table.movementType} in ('OPENING_BALANCE', 'MANUAL_ADJUSTMENT') and ${table.containerId} is null and ${table.orderSlipId} is null)
      `,
    ),
  ],
);

export const schema = {
  appUsers,
  profiles,
  sessions,
  suppliers,
  productCategories,
  shipments,
  containers,
  containerItems,
  containerDiscrepancies,
  cashiers,
  orderSlips,
  orderSlipItems,
  stockBalances,
  stockMovements,
};
