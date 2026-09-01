// =============================================================================
// Material Receiving — Consumable & Sparepart dari supplier
// =============================================================================
// Tiru pola TSG receiving: header per penerimaan, item per baris.
// Stok dihitung: SUM(received) - SUM(usage) — tanpa tabel inventory.
// =============================================================================

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
import { plant } from "./tenancy";
import { user } from "./identity";
import { tsgSupplier } from "./wms-inbound";
import { consumableItem, sparepart, machine } from "./master-product";

// =============================================================================
// Enums
// =============================================================================

export const materialTypeEnum = pgEnum("material_type", [
  "CONSUMABLE",
  "SPAREPART",
]);

// =============================================================================
// Material Receiving — header penerimaan
// =============================================================================

export const materialReceiving = pgTable(
  "material_receiving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => tsgSupplier.id),
    receivingCode: text("receiving_code").notNull(), // 'RCV-20260813-01' — unique per plant
    receivedAt: timestamp("received_at").notNull(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => user.id),
    materialType: materialTypeEnum("material_type").notNull(),
    supplierDocRef: text("supplier_doc_ref"), // nomor surat jalan supplier
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.receivingCode),
    idxPlantDate: index("idx_material_recv_plant_date").on(t.plantId, t.receivedAt),
  })
);

// =============================================================================
// Consumable Receiving Item — baris consumable dalam penerimaan
// =============================================================================

export const consumableReceivingItem = pgTable(
  "consumable_receiving_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivingId: uuid("receiving_id")
      .notNull()
      .references(() => materialReceiving.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    consumableItemId: uuid("consumable_item_id")
      .notNull()
      .references(() => consumableItem.id),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2 }), // harga beli per unit
    seq: integer("seq").notNull(), // urutan baris dalam penerimaan
  },
  (t) => ({
    uniqueSeqInReceiving: unique().on(t.receivingId, t.seq),
  })
);

// =============================================================================
// Sparepart Receiving Item — baris sparepart dalam penerimaan
// =============================================================================

export const sparepartReceivingItem = pgTable(
  "sparepart_receiving_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivingId: uuid("receiving_id")
      .notNull()
      .references(() => materialReceiving.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← denormalized untuk RLS
    sparepartId: uuid("sparepart_id")
      .notNull()
      .references(() => sparepart.id),
    quantity: integer("quantity").notNull(),
    unitPrice: decimal("unit_price", { precision: 14, scale: 2 }), // harga beli per unit
    seq: integer("seq").notNull(), // urutan baris dalam penerimaan
  },
  (t) => ({
    uniqueSeqInReceiving: unique().on(t.receivingId, t.seq),
  })
);


// =============================================================================
// Material Out — keluar consumable/sparepart (kirim pabrik lain / retur supplier)
// =============================================================================

export const materialOutTypeEnum = pgEnum("material_out_type", ["TRANSFER", "RETUR", "PEMAKAIAN", "RUSAK"]);

export const materialOut = pgTable(
  "material_out",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← untuk RLS
    materialType: materialTypeEnum("material_type").notNull(),
    outType: materialOutTypeEnum("out_type").notNull(),
    // Mesin tujuan — wajib untuk PEMAKAIAN, NULL untuk TRANSFER/RETUR
    machineId: uuid("machine_id").references(() => machine.id),
    counterpartName: text("counterpart_name").notNull(), // pabrik tujuan / nama supplier / kode mesin
    outCode: text("out_code").notNull(), // 'MTR-20260814-01' unique per plant
    reason: text("reason").notNull(),
    notes: text("notes"),
    outAt: timestamp("out_at").notNull().defaultNow(),
    outBy: uuid("out_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueCodePerPlant: unique().on(t.plantId, t.outCode),
    idxPlantDate: index("idx_material_out_plant").on(t.plantId, t.outAt),
  })
);

export const consumableOutItem = pgTable(
  "consumable_out_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outId: uuid("out_id")
      .notNull()
      .references(() => materialOut.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    consumableItemId: uuid("consumable_item_id")
      .notNull()
      .references(() => consumableItem.id),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => ({
    uniqueSeqInOut: unique().on(t.outId, t.seq),
  })
);

export const sparepartOutItem = pgTable(
  "sparepart_out_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outId: uuid("out_id")
      .notNull()
      .references(() => materialOut.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    sparepartId: uuid("sparepart_id")
      .notNull()
      .references(() => sparepart.id),
    quantity: integer("quantity").notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => ({
    uniqueSeqInOut: unique().on(t.outId, t.seq),
  })
);
