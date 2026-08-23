// =============================================================================
// TSG Types — enum & master data supplier yang dipakai lintas modul
// =============================================================================
// Dipisah dari wms-inbound.ts supaya wms-inbound bisa import supplierSj
// tanpa circular import (wms-inbound ↔ supplier-sj). wms-inbound tetap
// re-export nama-nama ini, jadi import lama tidak berubah.
// =============================================================================

import { pgTable, pgEnum, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

// =============================================================================
// Enums
// =============================================================================

export const tsgTypeEnum = pgEnum("tsg_type", ["REGULER", "MILD", "PUTIHAN"]);

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
