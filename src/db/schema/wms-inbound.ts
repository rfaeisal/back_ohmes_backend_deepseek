import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";
import { user } from "./identity";
import { shiftReport } from "./shift";
import { supplierSj } from "./supplier-sj";

// =============================================================================
// Enums & master supplier — didefinisikan di tsg-types.ts (bebas circular
// import), di-re-export di sini supaya import lama tetap jalan.
// =============================================================================

import { tsgTypeEnum, tsgSupplier } from "./tsg-types";
export { tsgTypeEnum, tsgSupplier };

export const tsgInventoryStatusEnum = pgEnum("tsg_inventory_status", [
  "AVAILABLE",
  "ALLOCATED",
  "USED",
  "WRITTEN_OFF",
  "TRANSFERRED",
  "RETURNED",
]);

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
    supplierSjId: uuid("supplier_sj_id").references(() => supplierSj.id), // link balik ke Surat Jalan (NULL = receiving manual) — mobile handoff v2.2.3 §4
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
    source: text("source").notNull().default("MANUAL"), // MANUAL | SJ
    approvalStatus: text("approval_status").notNull().default("APPROVED"), // PENDING | APPROVED | REJECTED (manual tanpa SJ wajib approve)
    approvedBy: uuid("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    // Penolakan approval (mobile minta tolak + catatan) — diisi saat status REJECTED
    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by").references(() => user.id),
    rejectedAt: timestamp("rejected_at"),
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
    tsgType: tsgTypeEnum("tsg_type").notNull().default("REGULER"), // REGULER, MILD, PUTIHAN
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
    tsgType: tsgTypeEnum("tsg_type").notNull().default("REGULER"), // denormalized dari receiving
    status: tsgInventoryStatusEnum("status").notNull().default("AVAILABLE"),
    allocatedToShiftId: uuid("allocated_to_shift_id").references(
      () => shiftReport.id
    ),
    allocatedAt: timestamp("allocated_at"),
    usedAt: timestamp("used_at"),
    writeoffReason: text("writeoff_reason"),
    writeoffBy: uuid("writeoff_by").references(() => user.id),
    writeoffAt: timestamp("writeoff_at"),
    // FIFO override — otorisasi pakai boks di luar urutan FIFO (mobile handoff §6)
    fifoOverrideReason: text("fifo_override_reason"),
    fifoOverrideBy: uuid("fifo_override_by").references(() => user.id),
    fifoOverrideAt: timestamp("fifo_override_at"),
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


// =============================================================================
// TSG Transfer Out — kirim TSG ke pabrik lain (eksternal, di luar sistem)
// =============================================================================

export const tsgTransferOut = pgTable(
  "tsg_transfer_out",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    destinationName: text("destination_name").notNull(), // 'Pabrik Pamekasan'
    transferCode: text("transfer_code").notNull(), // 'TRF-20260814-01' unique per plant
    totalBoxCount: integer("total_box_count").notNull(),
    totalWeightKg: decimal("total_weight_kg", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    sentBy: uuid("sent_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.transferCode),
    idxPlantDate: index("idx_tsg_transfer_plant").on(t.plantId, t.sentAt),
  })
);

export const tsgTransferOutItem = pgTable(
  "tsg_transfer_out_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => tsgTransferOut.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => tsgInventory.id),
    boxCode: text("box_code").notNull(),
    weightKg: decimal("weight_kg", { precision: 10, scale: 2 }).notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => ({
    uniqueSeqInTransfer: unique().on(t.transferId, t.seq),
  })
);


// =============================================================================
// TSG Return Out — retur TSG ke supplier (cacat, salah kirim, dll)
// =============================================================================

export const tsgReturnOut = pgTable(
  "tsg_return_out",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => tsgSupplier.id),
    returnCode: text("return_code").notNull(), // 'RTR-20260814-01' unique per plant
    totalBoxCount: integer("total_box_count").notNull(),
    totalWeightKg: decimal("total_weight_kg", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason").notNull(), // alasan retur
    notes: text("notes"),
    returnedAt: timestamp("returned_at").notNull().defaultNow(),
    returnedBy: uuid("returned_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.returnCode),
    idxPlantDate: index("idx_tsg_return_plant").on(t.plantId, t.returnedAt),
  })
);

export const tsgReturnOutItem = pgTable(
  "tsg_return_out_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => tsgReturnOut.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => tsgInventory.id),
    boxCode: text("box_code").notNull(),
    weightKg: decimal("weight_kg", { precision: 10, scale: 2 }).notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => ({
    uniqueSeqInReturn: unique().on(t.returnId, t.seq),
  })
);
