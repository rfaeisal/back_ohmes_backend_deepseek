// =============================================================================
// Makloon — penerimaan batangan external & keluaran pack ke customer
// =============================================================================
// docs/24-external-batangan.md: pabrik terima order packing dari luar.
// Batch external diproses HLP seperti batch internal; pack + rijekan
// dikembalikan ke customer dengan dokumen serah terima.
// =============================================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { plant } from "./tenancy";
import { user } from "./identity";
import { batch } from "./box";

export const externalBatanganReceiving = pgTable(
  "external_batangan_receiving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    senderName: text("sender_name").notNull(), // pengirim FREE TEXT
    docRef: text("doc_ref"), // nomor PO/DO
    batanganKg: numeric("batangan_kg").notNull(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => user.id),
    approvalStatus: text("approval_status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
    approvedBy: uuid("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    rejectedBy: uuid("rejected_by").references(() => user.id),
    rejectedAt: timestamp("rejected_at"),
    batchId: uuid("batch_id").references(() => batch.id), // diisi saat approve
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxPlantStatus: index("idx_ext_recv_plant_status").on(t.plantId, t.approvalStatus),
  })
);

export const externalPackOut = pgTable(
  "external_pack_out",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batch.id),
    destinationName: text("destination_name").notNull(), // customer FREE TEXT
    docRef: text("doc_ref"),
    packQty: integer("pack_qty").notNull(),
    rejectPackQty: integer("reject_pack_qty").notNull().default(0),
    rejectBatangQty: integer("reject_batang_qty").notNull().default(0),
    outAt: timestamp("out_at").notNull().defaultNow(),
    outBy: uuid("out_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    idxPlant: index("idx_ext_pack_out_plant").on(t.plantId, t.outAt),
    idxBatch: index("idx_ext_pack_out_batch").on(t.batchId),
  })
);
