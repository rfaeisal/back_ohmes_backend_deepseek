// =============================================================================
// Order Makloon — entitas order dari customer (docs/26-waste-makloon-final.md §2)
// =============================================================================
// Satu order = pemesan + produk pesanan + satuan akhir + bentuk bahan masuk.
// Tautan ke bawah: receiving (TSG / batangan) → batch → keluaran (pack/batangan).
// File terpisah (pola tsg-types.ts) supaya hlp.ts & makloon.ts bisa import
// tanpa circular.
// =============================================================================

import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { plant } from "./tenancy";

export const makloonOrder = pgTable(
  "makloon_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    code: text("code").notNull(), // 'MKL-20260903-001'
    customer: text("customer").notNull(), // pemesan FREE TEXT
    productName: text("product_name").notNull(), // 'Marbol - Putihan'
    tsgType: text("tsg_type").notNull(), // REGULER | MILD | PUTIHAN
    // Satuan produk akhir (7 bentuk, docs/26 §1):
    finalForm: text("final_form").notNull(), // BATANGAN|PACK|PACK_WRAP|SLOP|BAL|CARTON_SLOP|CARTON_BAL
    inputType: text("input_type").notNull(), // BATANGAN | TSG
    // OPEN → RECEIVING (bahan diterima) → PROCESSING → DONE (serah terima selesai)
    status: text("status").notNull().default("OPEN"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqCodePerPlant: uniqueIndex("uq_makloon_order_code").on(t.plantId, t.code),
    idxPlantStatus: index("idx_makloon_order_plant_status").on(t.plantId, t.status),
  })
);
