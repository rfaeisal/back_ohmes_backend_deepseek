import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  date,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";
import { user } from "./identity";
import { product, machine, shiftRole, shiftTemplate, wasteCategoryEnum, settlementStatusEnum } from "./master-product";

// =============================================================================
// Shift Report — core operasional
// =============================================================================

export const shiftStatusEnum = pgEnum("shift_status", [
  "RUNNING",
  "COMPLETED",
  "APPROVED",
]);

export const shiftReport = pgTable(
  "shift_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← wajib untuk RLS
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machine.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    shiftTemplateId: uuid("shift_template_id")
      .notNull()
      .references(() => shiftTemplate.id),
    reportDate: date("report_date").notNull(), // tanggal shift mulai (WIB)
    actualStart: timestamp("actual_start").notNull(),
    actualEnd: timestamp("actual_end"),
    status: shiftStatusEnum("status").notNull().default("RUNNING"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    approvedBy: uuid("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    reviewNotes: text("review_notes"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxPlantDate: index("idx_shift_plant_date").on(t.plantId, t.reportDate),
    idxMachineRunning: index("idx_shift_machine_running")
      .on(t.machineId)
      .where(sql`status = 'RUNNING'`),
  })
);

// =============================================================================
// Shift Member — many-to-many tim shift
// =============================================================================

export const shiftMember = pgTable(
  "shift_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    shiftRoleId: uuid("shift_role_id")
      .notNull()
      .references(() => shiftRole.id),
    leaveMinutes: integer("leave_minutes").notNull().default(0), // izin dalam menit
    note: text("note"), // 'Izin pengajian 18:30-19:30'
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueUserPerShift: unique().on(t.shiftReportId, t.userId),
  })
);

// =============================================================================
// Shift Waste — 4 kategori waste per shift
// =============================================================================

export const shiftWaste = pgTable(
  "shift_waste",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id, { onDelete: "cascade" }),
    category: wasteCategoryEnum("category").notNull(),
    kg: decimal("kg", { precision: 10, scale: 2 }).notNull(),
    settlementStatus: settlementStatusEnum("settlement_status")
      .notNull()
      .default("PENDING"),
    settledAt: timestamp("settled_at"),
    settledBy: uuid("settled_by").references(() => user.id),
    note: text("note"),
  },
  (t) => ({
    uniqueCategoryPerShift: unique().on(t.shiftReportId, t.category),
  })
);

// =============================================================================
// Shift Handoff — carry-over TSG antar shift
// =============================================================================

export const shiftHandoff = pgTable(
  "shift_handoff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromShiftId: uuid("from_shift_id")
      .notNull()
      .references(() => shiftReport.id),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machine.id),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    sisaTsgKg: decimal("sisa_tsg_kg", { precision: 10, scale: 2 }).notNull(),
    batanganSementaraKg: decimal("batangan_sementara_kg", {
      precision: 10,
      scale: 2,
    }).notNull(),
    weighedAt: timestamp("weighed_at").notNull(),
    weighedBy: uuid("weighed_by")
      .notNull()
      .references(() => user.id),
    note: text("note"),
    claimedByShiftId: uuid("claimed_by_shift_id").references(
      () => shiftReport.id
    ),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => ({
    // Hanya boleh 1 handoff unclaimed per mesin
    uniqueUnclaimedPerMachine: uniqueIndex("uq_handoff_unclaimed_machine")
      .on(t.machineId)
      .where(sql`claimed_by_shift_id IS NULL`),
  })
);
