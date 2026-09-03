import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  numeric,
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
import { hlpShift } from "./hlp";
import { makloonOrder } from "./makloon-order";

// =============================================================================
// TSG Box Session — sesi buka 1–6 boks sekaligus + timbang batangan kolektif
// =============================================================================

export const tsgBoxSession = pgTable(
  "tsg_box_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    batchId: uuid("batch_id").references(() => batch.id), // batch batangan setelah timbang kolektif
    status: text("status").notNull().default("OPEN"), // OPEN | WEIGHED | HANDOFF
    totalBatanganKg: decimal("total_batangan_kg", { precision: 10, scale: 2 }),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    weighedAt: timestamp("weighed_at"),
  },
  (t) => ({
    idxSessionActive: index("idx_box_session_active")
      .on(t.shiftReportId)
      .where(sql`status = 'OPEN'`),
  })
);

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
    sessionId: uuid("session_id").references(() => tsgBoxSession.id), // ← sesi multi-boks
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
    .references(() => tsgBoxProcess.id, { onDelete: "cascade" }), // NULL = pemakaian level sesi
  sessionId: uuid("session_id").references(() => tsgBoxSession.id), // ← entry level sesi multi-boks
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
  sessionId: uuid("session_id").references(() => tsgBoxSession.id), // ← entry level sesi multi-boks
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
  sessionId: uuid("session_id").references(() => tsgBoxSession.id), // ← entry level sesi multi-boks
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
  // NULL untuk batch EXTERNAL (makloon, docs/24) — bukan produksi MAKER
  shiftReportId: uuid("shift_report_id").references(() => shiftReport.id),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  machineId: uuid("machine_id").references(() => machine.id), // Maker asal
  // INTERNAL (dari MAKER) | EXTERNAL (makloon — docs/24)
  source: text("source").notNull().default("INTERNAL"),
  externalReceivingId: uuid("external_receiving_id"),
  // Progress rantai produksi (docs/25): PACKED | WRAPPED | SLOPPED | BALED
  stage: text("stage").notNull().default("PACKED"),
  // Produk jadi target (diputuskan di HLP, 0030): PACK | PACK_WRAP | SLOP | BAL
  // — menentukan rantai stage wajib; PACK = tanpa stage lanjutan.
  targetUnit: text("target_unit").notNull().default("PACK"),
  // Batangan ini dibuat dari TSG milik makloon (0031) — jejak sampai produk akhir
  isMakloonTsg: boolean("is_makloon_tsg").notNull().default(false),
  makloonCustomer: text("makloon_customer"), // pemesan makloon (0031)
  makloonTarget: text("makloon_target"), // produk jadi pesanan (0031)
  // Order makloon (docs/26 §2) — tautan resmi, kolom free-text di atas
  // dipertahankan untuk data lama.
  makloonOrderId: uuid("makloon_order_id").references(() => makloonOrder.id),
  code: text("code").notNull().unique(), // 'btc_MKR01_20260810_03' | 'btx_...'
  batanganKg: decimal("batangan_kg", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// Batangan Out — batangan keluar sebagai produk final (docs/26 §6)
// =============================================================================
// Produk final #1 (batangan) untuk kebutuhan internal (antar pabrik /
// keperluan pabrik) dan order makloon (PT. B). MAKLOON bisa juga lewat
// external_pack_out exitStage=BATANGAN + dokumen serah terima makloon.
// =============================================================================

export const batanganOut = pgTable(
  "batangan_out",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    batchId: uuid("batch_id").references(() => batch.id),
    qtyKg: decimal("qty_kg", { precision: 10, scale: 2 }).notNull(),
    batangEst: integer("batang_est"), // perkiraan jumlah batang (estimasi)
    destinationType: text("destination_type").notNull(), // INTERNAL | MAKLOON | LAIN
    destinationName: text("destination_name").notNull(), // free text
    docRef: text("doc_ref"),
    outBy: uuid("out_by")
      .notNull()
      .references(() => user.id),
    outAt: timestamp("out_at").notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxPlant: index("idx_batangan_out_plant").on(t.plantId, t.outAt),
    idxBatch: index("idx_batangan_out_batch").on(t.batchId),
  })
);

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
  // Sesi HLP yang sedang terbuka saat packing dicatat (docs/23 §2.2) — nullable
  hlpShiftId: uuid("hlp_shift_id").references(() => hlpShift.id),
  packsLolos: integer("packs_lolos").notNull(),
  isiPerPack: integer("isi_per_pack").notNull().default(20),
  rejectBatangan: integer("reject_batangan").notNull().default(0),
  // Reject pack = pack utuh ditolak, dihitung sebagai batangan (docs/23 §4)
  rejectPacks: integer("reject_packs").notNull().default(0),
  rejectReason: text("reject_reason"),
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

// =============================================================================
// Batch Stage Event — catatan per-stage rantai produksi (docs/25)
// =============================================================================
// HLP → WR → SLOP → BAL. Tanpa sesi formal: 1 baris = 1 kegiatan selesai,
// input/output/reject per satuan stage (pack/slop/bal). Urutan bebas.
// =============================================================================

export const batchStageEvent = pgTable(
  "batch_stage_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batch.id),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    stage: text("stage").notNull(), // WR | SLOP | BAL
    machineId: uuid("machine_id").references(() => machine.id), // NULL kalau manual
    inputQty: numeric("input_qty").notNull(),
    outputQty: numeric("output_qty").notNull(),
    rejectQty: numeric("reject_qty").notNull().default("0"),
    // Rasio input per 1 output (SLOP: pack/slop; BAL: slop/bal) — fleksibel (0032)
    isiPerUnit: integer("isi_per_unit"),
    // Sisa input tidak terpakai — angka resmi untuk isi karton (0032)
    sisaQty: integer("sisa_qty"),
    unit: text("unit").notNull(), // PACK | SLOP | BAL
    operatorBy: uuid("operator_by")
      .notNull()
      .references(() => user.id),
    eventAt: timestamp("event_at").notNull().defaultNow(),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxBatch: index("idx_stage_event_batch").on(t.batchId, t.eventAt),
    idxPlant: index("idx_stage_event_plant").on(t.plantId, t.stage),
  })
);
