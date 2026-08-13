import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";
import { user } from "./identity";
import {
  machine,
  consumableItem,
  sparepart,
  downtimeCategoryEnum,
} from "./master-product";
import { shiftReport, shiftHandoff } from "./shift";
import { tsgInventory } from "./wms-inbound";

// =============================================================================
// TSG Box Process — tracking per boks dalam shift
// =============================================================================

export const tsgBoxProcess = pgTable(
  "tsg_box_process",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    boxNumber: integer("box_number").notNull(), // 1, 2, ..., n per shift
    boxCode: text("box_code"), // dari QR receiving gudang (Fase 3)
    tsgWeightKg: decimal("tsg_weight_kg", { precision: 10, scale: 2 }).notNull(),
    outputWeightKg: decimal("output_weight_kg", { precision: 10, scale: 2 }),
    yieldPct: decimal("yield_pct", { precision: 5, scale: 2 }), // dihitung server
    isPartial: boolean("is_partial").notNull().default(false), // boks parsial dari handoff
    handoffId: uuid("handoff_id").references(() => shiftHandoff.id), // link ke handoff
    inventoryBoxId: uuid("inventory_box_id").references(
      () => tsgInventory.id
    ), // ← FK ke inventory (WMS Inbound)
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    uniqueBoxNumber: unique().on(t.shiftReportId, t.boxNumber),
    idxActive: index("idx_box_active")
      .on(t.shiftReportId)
      .where(sql`completed_at IS NULL`),
  })
);

// =============================================================================
// TSG Box Consumption — event log consumables per boks
// =============================================================================

export const tsgBoxConsumption = pgTable("tsg_box_consumption", {
  id: uuid("id").primaryKey().defaultRandom(),
  tsgBoxId: uuid("tsg_box_id")
    .notNull()
    .references(() => tsgBoxProcess.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id), // ← denormalized untuk RLS
  consumableItemId: uuid("consumable_item_id")
    .notNull()
    .references(() => consumableItem.id),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  loggedBy: uuid("logged_by")
    .notNull()
    .references(() => user.id),
  note: text("note"),
});

// =============================================================================
// Downtime Log
// =============================================================================

export const downtimeLog = pgTable("downtime_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftReportId: uuid("shift_report_id")
    .notNull()
    .references(() => shiftReport.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  category: downtimeCategoryEnum("category").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  linkedBoxId: uuid("linked_box_id").references(() => tsgBoxProcess.id),
  description: text("description"),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  loggedBy: uuid("logged_by")
    .notNull()
    .references(() => user.id),
});

// =============================================================================
// Maintenance Event — sparepart log
// =============================================================================

export const maintenanceEvent = pgTable("maintenance_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftReportId: uuid("shift_report_id")
    .notNull()
    .references(() => shiftReport.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  sparepartId: uuid("sparepart_id")
    .notNull()
    .references(() => sparepart.id),
  quantity: integer("quantity").notNull().default(1),
  linkedBoxId: uuid("linked_box_id").references(() => tsgBoxProcess.id),
  note: text("note"),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  loggedBy: uuid("logged_by")
    .notNull()
    .references(() => user.id),
});

// =============================================================================
// Batch — tray/trolley batangan dari Maker
// =============================================================================

export const batch = pgTable("batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftReportId: uuid("shift_report_id")
    .notNull()
    .references(() => shiftReport.id),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  machineId: uuid("machine_id")
    .notNull()
    .references(() => machine.id), // Maker asal
  code: text("code").notNull().unique(), // 'btc_MKR01_20260810_03'
  batanganKg: decimal("batangan_kg", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// HLP Pack — output pack dari mesin HLP
// =============================================================================

export const hlpPack = pgTable("hlp_pack", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batch.id),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  hlpMachineId: uuid("hlp_machine_id")
    .notNull()
    .references(() => machine.id),
  packsLolos: integer("packs_lolos").notNull(),
  isiPerPack: integer("isi_per_pack").notNull().default(20),
  rejectBatangan: integer("reject_batangan").notNull().default(0),
  totalBatang: integer("total_batang").notNull(), // dihitung server
  beratPerBatangGram: decimal("berat_per_batang_gram", {
    precision: 5,
    scale: 3,
  }),
  packedAt: timestamp("packed_at").notNull().defaultNow(),
});

// =============================================================================
// Shift Consumption — pemakaian consumable level shift (bukan per boks)
// Dicatat saat Akhiri Shift — material tambahan seperti karton, dus, dll
// =============================================================================

export const shiftConsumption = pgTable(
  "shift_consumption",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    consumableItemId: uuid("consumable_item_id")
      .notNull()
      .references(() => consumableItem.id),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
    note: text("note"),
    loggedAt: timestamp("logged_at").notNull().defaultNow(),
    loggedBy: uuid("logged_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => ({
    idxShift: index("idx_shift_cons_shift").on(t.shiftReportId),
  })
);
