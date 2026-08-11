import {
  pgTable,
  pgEnum,
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
import { shiftReport } from "./shift";

// =============================================================================
// Enums
// =============================================================================

export const tsgInventoryStatusEnum = pgEnum("tsg_inventory_status", [
  "AVAILABLE",
  "ALLOCATED",
  "USED",
  "WRITTEN_OFF",
]);

// =============================================================================
// TSG Supplier — master data supplier
// =============================================================================

export const tsgSupplier = pgTable("tsg_supplier", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'SUP-JAWA-01'
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

// =============================================================================
// TSG Receiving — header penerimaan dari supplier
// =============================================================================

export const tsgReceiving = pgTable(
  "tsg_receiving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => tsgSupplier.id),
    receivingCode: text("receiving_code").notNull(), // 'RCV-MLG-20260810-01' — unique per plant
    receivedAt: timestamp("received_at").notNull(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => user.id),
    totalBoxCount: integer("total_box_count").notNull(),
    totalWeightKg: decimal("total_weight_kg", {
      precision: 12,
      scale: 2,
    }).notNull(),
    supplierDocRef: text("supplier_doc_ref"), // nomor surat jalan supplier
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.receivingCode),
    idxPlantDate: index("idx_tsg_recv_plant_date").on(t.plantId, t.receivedAt),
  })
);

// =============================================================================
// TSG Receiving Box — detail per boks dalam pengiriman
// =============================================================================

export const tsgReceivingBox = pgTable(
  "tsg_receiving_box",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivingId: uuid("receiving_id")
      .notNull()
      .references(() => tsgReceiving.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    boxCode: text("box_code").notNull().unique(), // 'TSG-20260810-001' unique global
    weightKg: decimal("weight_kg", { precision: 10, scale: 2 }).notNull(),
    boxSeq: integer("box_seq").notNull(), // urutan boks dalam pengiriman
    receivedAt: timestamp("received_at").notNull(),
  },
  (t) => ({
    uniqueSeqInReceiving: unique().on(t.receivingId, t.boxSeq),
  })
);

// =============================================================================
// TSG Inventory — tracking FIFO boks di gudang
// =============================================================================

export const tsgInventory = pgTable(
  "tsg_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    boxId: uuid("box_id")
      .notNull()
      .references(() => tsgReceivingBox.id)
      .unique(),
    locationCode: text("location_code"), // 'RAK-A-01-03'
    status: tsgInventoryStatusEnum("status").notNull().default("AVAILABLE"),
    allocatedToShiftId: uuid("allocated_to_shift_id").references(
      () => shiftReport.id
    ),
    allocatedAt: timestamp("allocated_at"),
    usedAt: timestamp("used_at"),
    writeoffReason: text("writeoff_reason"),
    writeoffBy: uuid("writeoff_by").references(() => user.id),
    writeoffAt: timestamp("writeoff_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxAvailableFifo: index("idx_inv_available_fifo")
      .on(t.plantId, t.createdAt)
      .where(sql`status = 'AVAILABLE'`),
    idxAllocated: index("idx_inv_allocated")
      .on(t.allocatedToShiftId)
      .where(sql`status = 'ALLOCATED'`),
  })
);
