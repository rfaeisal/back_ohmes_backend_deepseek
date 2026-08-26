import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  unique,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";

// Enums akan digunakan di schema ini — didefinisikan di sini untuk circular ref avoidance
export const machineTypeEnum = pgEnum("machine_type", ["MAKER", "HLP"]);
export const downtimeCategoryEnum = pgEnum("downtime_category", [
  "GANTI_MATERIAL",
  "KENDALA_MESIN",
  "TUNGGU_BAHAN",
  "ISTIRAHAT_IZIN",
  "MAINTENANCE",
]);
export const wasteCategoryEnum = pgEnum("waste_category", [
  "MENIR",
  "RIJEKAN",
  "DEBU_KASAR",
  "DEBU_HALUS",
]);
export const settlementStatusEnum = pgEnum("settlement_status", [
  "PENDING",
  "LUNAS",
]);

// =============================================================================
// Product & Machine Template
// =============================================================================

export const product = pgTable("product", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'PRD-HMR-STD'
  brand: text("brand").notNull(), // 'Hummer'
  variant: text("variant"), // 'STD', 'LTS', dst
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const plantProduct = pgTable(
  "plant_product",
  {
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.plantId, t.productId] }),
  })
);

export const machine = pgTable(
  "machine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    code: text("code").notNull(), // 'MKR-01', 'HLP-01'
    name: text("name").notNull(),
    type: machineTypeEnum("type").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.code),
    idxPlant: index("idx_machine_plant").on(t.plantId),
  })
);

export const machineTemplate = pgTable(
  "machine_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    machineType: machineTypeEnum("machine_type").notNull(),
    yieldMinPct: decimal("yield_min_pct", { precision: 5, scale: 2 }).notNull(), // 110.00
    yieldMaxPct: decimal("yield_max_pct", { precision: 5, scale: 2 }).notNull(), // 114.00
    targetBeratPerBatangGram: decimal("target_berat_per_batang_gram", {
      precision: 5,
      scale: 3,
    }),
    isCurrent: boolean("is_current").notNull().default(true), // versioning
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCurrentPerProductMachine: uniqueIndex("uq_mt_current")
      .on(t.productId, t.machineType)
      .where(sql`is_current = true`),
  })
);

// =============================================================================
// Consumable, Sparepart, Shift Role, Shift Template, dan referensi lain
// =============================================================================

export const consumableItem = pgTable("consumable_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'item_BOBIN_BLK'
  name: text("name").notNull(), // 'Bobbin Hummer'
  unit: text("unit").notNull().default("roll"), // 'roll', 'kg', 'unit'
  productId: uuid("product_id").references(() => product.id), // NULL = universal
  isActive: boolean("is_active").notNull().default(true),
  allowAtEndShift: boolean("allow_at_end_shift").notNull().default(false), // boleh dicatat saat akhiri shift
  // Penanda mesin berlaku — MAKER / HLP / BOTH (filter form gudang pemakaian)
  applicableMachines: text("applicable_machines").notNull().default("BOTH"),
});

export const sparepart = pgTable("sparepart", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'sp_PISAU_FILTER'
  name: text("name").notNull(),
  unit: text("unit").notNull().default("unit"),
  isActive: boolean("is_active").notNull().default(true),
  // Penanda mesin berlaku — MAKER / HLP / BOTH (filter form gudang pemakaian)
  applicableMachines: text("applicable_machines").notNull().default("BOTH"),
});

export const shiftRole = pgTable(
  "shift_role",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id").references(() => plant.id), // NULL = global untuk semua plant
    code: text("code").notNull(), // 'ketua_kecer', 'operator', 'pembantu'
    name: text("name").notNull(),
    canApproveShift: boolean("can_approve_shift").notNull().default(false),
    canEndShift: boolean("can_end_shift").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    uniqueCodePerScope: unique().on(t.plantId, t.code),
  })
);

export const shiftTemplate = pgTable(
  "shift_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    code: text("code").notNull(), // 'shift_pagi', 'shift_malam'
    name: text("name").notNull(),
    startTime: text("start_time").notNull(), // 'HH:MM' — '05:30'
    durationMinutes: integer("duration_minutes").notNull(), // 660 = 11h; 780 = 13h
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.code),
  })
);

export const rejectReason = pgTable("reject_reason", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'BATANG_PATAH'
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});
