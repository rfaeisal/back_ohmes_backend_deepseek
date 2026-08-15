// =============================================================================
// Surat Jalan Supplier — pre-labeling & pre-weighing di gudang supplier
// =============================================================================
// Alur: area buat SJ (nomor manual supplier) → generate label QR per jenis TSG
// → petugas area scan label & input berat timbangan supplier → pabrik verifikasi
// saat receiving (berat & jumlah sudah diketahui dari SJ).
// =============================================================================

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  decimal,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { plant } from "./tenancy";
import { user } from "./identity";
import { tsgSupplier, tsgTypeEnum } from "./wms-inbound";

export const supplierSjStatusEnum = pgEnum("supplier_sj_status", [
  "DRAFT", // label dibuat, sebagian/semua boks belum ditimbang
  "SHIPPED", // semua boks tertimbang, truk berangkat ke pabrik
  "RECEIVED", // pabrik verifikasi & receiving selesai
]);

// Lifecycle label: AVAILABLE (pool, belum terikat SJ) → ASSIGNED (terikat via scan) | VOID (hilang/rusak)
export const supplierSjLabelStatusEnum = pgEnum("supplier_sj_label_status", [
  "AVAILABLE",
  "ASSIGNED",
  "VOID",
]);

export const supplierSj = pgTable(
  "supplier_sj",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sjNumber: text("sj_number").notNull(), // nomor surat jalan manual dari supplier
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => tsgSupplier.id),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // 1 SJ = 1 pabrik tujuan (RLS)
    status: supplierSjStatusEnum("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id),
    shippedAt: timestamp("shipped_at"),
    receivedAt: timestamp("received_at"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueSjPerSupplier: unique().on(t.supplierId, t.sjNumber),
    idxPlant: index("idx_supplier_sj_plant").on(t.plantId),
    idxStatus: index("idx_supplier_sj_status").on(t.status),
  })
);

export const supplierSjBox = pgTable(
  "supplier_sj_box",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierSjId: uuid("supplier_sj_id").references(() => supplierSj.id, {
      onDelete: "cascade",
    }), // NULL = pool label, belum terikat SJ
    plantId: uuid("plant_id").references(() => plant.id), // NULL untuk pool; diisi saat assign (denormalized untuk RLS)
    boxCode: text("box_code").notNull().unique(), // kode label QR 'TSG-YYYYMMDD-NNN' (ditempel di boks)
    tsgType: tsgTypeEnum("tsg_type"), // REGULER | MILD | PUTIHAN — NULL sampai discan (assign)
    labelStatus: supplierSjLabelStatusEnum("label_status")
      .notNull()
      .default("AVAILABLE"), // AVAILABLE → ASSIGNED | VOID
    createdBy: uuid("created_by").references(() => user.id), // pemilik pool label (RLS)
    supplierWeightKg: decimal("supplier_weight_kg", {
      precision: 10,
      scale: 2,
    }), // NULL = label belum discan/ditimbang
    enteredBy: uuid("entered_by").references(() => user.id),
    enteredAt: timestamp("entered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxSj: index("idx_sj_box_sj").on(t.supplierSjId),
    idxPlant: index("idx_sj_box_plant").on(t.plantId),
    idxLabelStatus: index("idx_sj_box_label_status").on(t.labelStatus),
    idxCreatedBy: index("idx_sj_box_created_by").on(t.createdBy),
  })
);
