import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { plant } from "./tenancy";
import { user } from "./identity";
import { product } from "./master-product";
import { shiftReport } from "./shift";
import { hlpPack } from "./box";

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

export const finishedGoodsReceiving = pgTable("finished_goods_receiving", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  shiftReportId: uuid("shift_report_id")
    .notNull()
    .references(() => shiftReport.id)
    .unique(),
  packsExpectedCount: integer("packs_expected_count").notNull(), // sum(hlp_pack.packsLolos)
  packsActualCount: integer("packs_actual_count"), // input gudang saat confirm
  status: text("status").notNull().default("PENDING"), // PENDING, CONFIRMED, DISPUTED
  receivedAt: timestamp("received_at"),
  receivedBy: uuid("received_by").references(() => user.id),
  disputeNotes: text("dispute_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    hlpPackId: uuid("hlp_pack_id")
      .notNull()
      .references(() => hlpPack.id),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    addedBy: uuid("added_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => ({
    uniquePackPerCarton: unique().on(t.cartonId, t.hlpPackId),
    idxHlpPack: index("idx_content_hlp_pack").on(t.hlpPackId), // cepat traceback pack → carton
  })
);
