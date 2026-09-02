import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";
import { user } from "./identity";
import { product } from "./master-product";
import { shiftReport } from "./shift";
import { hlpPack, batch } from "./box";

// Satuan karton — plain text + CHECK (bukan pgEnum, hindari jebakan ALTER TYPE)
export type CartonUnit = "PACK" | "SLOP" | "BAL";

// =============================================================================
// Enums
// =============================================================================

export const cartonStatusEnum = pgEnum("carton_status", [
  "OPEN",
  "READY",
  "DISPATCHED",
]);

// =============================================================================
// Finished Goods Receiving — auto-create saat shift APPROVED
// =============================================================================

export const finishedGoodsReceiving = pgTable(
  "finished_goods_receiving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    shiftReportId: uuid("shift_report_id")
      .notNull()
      .references(() => shiftReport.id),
    // Satuan ekspektasi — satu baris per (shift, unit): PACK | SLOP | BAL
    unit: text("unit").notNull().default("PACK"),
    packsExpectedCount: integer("packs_expected_count").notNull(), // sum sesuai unit
    packsActualCount: integer("packs_actual_count"), // input gudang saat confirm
    status: text("status").notNull().default("PENDING"), // PENDING, CONFIRMED, DISPUTED
    receivedAt: timestamp("received_at"),
    receivedBy: uuid("received_by").references(() => user.id),
    disputeNotes: text("dispute_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueShiftUnit: unique().on(t.shiftReportId, t.unit),
  })
);

// =============================================================================
// Carton — karton untuk bundling pack
// =============================================================================

export const carton = pgTable(
  "carton",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    code: text("code").notNull().unique(), // 'CTN-MLG-20260810-001'
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    // Satu karton = satu satuan (keputusan bisnis 2 Sep 2026) — isi wajib se-unit
    unit: text("unit").notNull().default("PACK"), // PACK | SLOP | BAL
    capacityPack: integer("capacity_pack").notNull().default(50),
    actualPackCount: integer("actual_pack_count").notNull().default(0),
    status: cartonStatusEnum("status").notNull().default("OPEN"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => user.id),
    closedAt: timestamp("closed_at"), // saat status → READY
    closedBy: uuid("closed_by").references(() => user.id),
    notes: text("notes"),
  },
  (t) => ({
    idxPlantStatus: index("idx_carton_plant_status").on(t.plantId, t.status),
  })
);

// =============================================================================
// Carton Content — mapping karton ↔ pack (many-to-many)
// =============================================================================

export const cartonContent = pgTable(
  "carton_content",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartonId: uuid("carton_id")
      .notNull()
      .references(() => carton.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    // Sumber isi: HLP_PACK (pack langsung dari hlp_pack) | STAGE (output
    // WR/SLOP/BAL dari batch_stage_event). Eksklusivitas ditegakkan CHECK.
    sourceType: text("source_type").notNull().default("HLP_PACK"),
    hlpPackId: uuid("hlp_pack_id").references(() => hlpPack.id),
    batchId: uuid("batch_id").references(() => batch.id),
    stage: text("stage"), // WR | SLOP | BAL — hanya untuk source_type STAGE
    // Jumlah satuan (pack/slop/bal sesuai unit karton) dari sumber ini
    // (migrasi 0019: dulu pack fisik dari batch; 0029: generik per unit)
    packQty: integer("pack_qty").notNull().default(1),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => ({
    uniquePackPerCarton: unique().on(t.cartonId, t.hlpPackId),
    // Satu (karton, batch, stage) hanya satu baris untuk source STAGE
    // (NULL hlp_pack_id lolos uniquePackPerCarton sehingga tidak bentrok)
    uniqueStagePerCarton: uniqueIndex("uq_carton_content_stage")
      .on(t.cartonId, t.batchId, t.stage)
      .where(sql`source_type = 'STAGE'`),
    idxHlpPack: index("idx_content_hlp_pack").on(t.hlpPackId), // cepat traceback pack → carton
    idxBatchStage: index("idx_content_batch_stage").on(t.batchId, t.stage),
  })
);
