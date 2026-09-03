// =============================================================================
// Sesi HLP & Ledger Rijekan — docs/23-hlp-session-design.md
// =============================================================================
// Sesi HLP = entitas kehadiran kontinu (open-ended, ganti anggota tanpa
// tutup, tanpa approval). Ledger rijekan = pembukuan rijekan MAKER (kg) +
// reject HLP (batang) → reproses jadi TSG (tingkat 2: angka terlihat,
// peristiwa tetap manual).
// =============================================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plant } from "./tenancy";
import { user } from "./identity";
import { machine, shiftRole } from "./master-product";
import { makloonOrder } from "./makloon-order";
import { tsgReceiving } from "./wms-inbound";

export const hlpShiftStatusEnum = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;
export type HlpShiftStatus = (typeof hlpShiftStatusEnum)[keyof typeof hlpShiftStatusEnum];

export const hlpShift = pgTable(
  "hlp_shift",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    hlpMachineId: uuid("hlp_machine_id")
      .notNull()
      .references(() => machine.id),
    startedBy: uuid("started_by")
      .notNull()
      .references(() => user.id),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedBy: uuid("ended_by").references(() => user.id),
    endedAt: timestamp("ended_at"),
    status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqOpenPerMachine: uniqueIndex("uniq_hlp_shift_open_per_machine")
      .on(t.hlpMachineId)
      .where(sql`${t.status} = 'OPEN'`),
    idxPlantStatus: index("idx_hlp_shift_plant_status").on(t.plantId, t.status),
  })
);

export const hlpShiftMember = pgTable(
  "hlp_shift_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hlpShiftId: uuid("hlp_shift_id")
      .notNull()
      .references(() => hlpShift.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    // Roster hanya default value — bebas pilih (docs/23 §2.1)
    shiftRoleId: uuid("shift_role_id").references(() => shiftRole.id),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
    leftAt: timestamp("left_at"),
  },
  (t) => ({
    idxShift: index("idx_hlp_shift_member_shift").on(t.hlpShiftId),
    idxUser: index("idx_hlp_shift_member_user").on(t.userId),
  })
);

export const rijekanEntryTypeEnum = {
  IN_MAKER_WASTE: "IN_MAKER_WASTE",
  IN_MAKER_MENIR: "IN_MAKER_MENIR",
  IN_HLP_REJECT: "IN_HLP_REJECT",
  IN_STAGE_REJECT: "IN_STAGE_REJECT",
  OUT_REPROSES: "OUT_REPROSES",
} as const;
export type RijekanEntryType = (typeof rijekanEntryTypeEnum)[keyof typeof rijekanEntryTypeEnum];

export const rijekanLedger = pgTable(
  "rijekan_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    entryType: text("entry_type").notNull(), // IN_MAKER_WASTE | IN_HLP_REJECT | OUT_REPROSES
    quantity: numeric("quantity").notNull(),
    unit: text("unit").notNull(), // KG | BATANG | PACK | SLOP | BAL
    refId: uuid("ref_id"), // id waste / hlp_pack / tsg_receiving
    note: text("note"),
    // Pool terstruktur (docs/26 §3): identitas lot — jenis & asal TSG
    tsgType: text("tsg_type"), // REGULER | MILD | PUTIHAN (NULL = data lama)
    origin: text("origin").notNull().default("INTERNAL"), // INTERNAL | MAKLOON
    makloonOrderId: uuid("makloon_order_id").references(() => makloonOrder.id),
    returnedAt: timestamp("returned_at"), // terisi saat serah terima ke customer
    returnedRef: text("returned_ref"), // referensi dokumen serah terima
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxPlant: index("idx_rijekan_ledger_plant").on(t.plantId, t.entryType),
    idxRef: index("idx_rijekan_ledger_ref").on(t.refId),
    idxPool: index("idx_rijekan_pool").on(t.plantId, t.origin, t.tsgType, t.entryType),
    idxOrder: index("idx_rijekan_order").on(t.makloonOrderId),
  })
);

// =============================================================================
// Rijekan Allocation — porsi lot rijek yang dikonsumsi reproses (docs/26 §4)
// =============================================================================

export const rijekanAllocation = pgTable(
  "rijekan_allocation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .references(() => rijekanLedger.id),
    reprosesReceivingId: uuid("reproses_receiving_id").references(
      () => tsgReceiving.id
    ), // tsg_receiving hasil reproses ("Reproses Internal (Rijekan)")
    qty: numeric("qty").notNull(), // porsi lot yang terpakai
    note: text("note"),
    allocatedBy: uuid("allocated_by").references(() => user.id),
    allocatedAt: timestamp("allocated_at").notNull().defaultNow(),
  },
  (t) => ({
    idxLedger: index("idx_rijekan_alloc_ledger").on(t.ledgerEntryId),
    idxPlant: index("idx_rijekan_alloc_plant").on(t.plantId, t.allocatedAt),
  })
);

// =============================================================================
// Rijekan Return — serah terima waste makloon ke customer (docs/26 §5)
// =============================================================================

export const rijekanReturn = pgTable(
  "rijekan_return",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    makloonOrderId: uuid("makloon_order_id").references(() => makloonOrder.id),
    customer: text("customer").notNull(), // pemesan (denormalized)
    docRef: text("doc_ref"), // referensi dokumen
    notes: text("notes"),
    returnedBy: uuid("returned_by")
      .notNull()
      .references(() => user.id),
    returnedAt: timestamp("returned_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxPlant: index("idx_rijekan_return_plant").on(t.plantId, t.returnedAt),
    idxOrder: index("idx_rijekan_return_order").on(t.makloonOrderId),
  })
);

export const rijekanReturnItem = pgTable(
  "rijekan_return_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => rijekanReturn.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id), // ← RLS
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .references(() => rijekanLedger.id),
    qty: numeric("qty").notNull(), // porsi lot diserahkan
    unit: text("unit").notNull(), // KG | BATANG | PACK | SLOP | BAL
  },
  (t) => ({
    idxReturn: index("idx_rijekan_return_item_return").on(t.returnId),
    idxLedger: index("idx_rijekan_return_item_ledger").on(t.ledgerEntryId),
  })
);
