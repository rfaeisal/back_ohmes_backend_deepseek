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
  IN_HLP_REJECT: "IN_HLP_REJECT",
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
    unit: text("unit").notNull(), // KG | BATANG
    refId: uuid("ref_id"), // id waste / hlp_pack / tsg_receiving
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxPlant: index("idx_rijekan_ledger_plant").on(t.plantId, t.entryType),
    idxRef: index("idx_rijekan_ledger_ref").on(t.refId),
  })
);
