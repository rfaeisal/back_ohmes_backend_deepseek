import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { plant } from "./tenancy";
import { user } from "./identity";
import { shiftReport } from "./shift";

// =============================================================================
// Enums
// =============================================================================

export const qrTypeEnum = pgEnum("qr_type", [
  "MACHINE",
  "TSG_BOX",
  "BATCH",
  "PACK",
]);

// NOTE: deviceTypeEnum didefinisikan di identity.ts untuk menghindari duplikasi

// =============================================================================
// Audit Log — immutable trail untuk semua mutasi
// =============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    action: text("action").notNull(), // 'shift.approve', 'product.create'
    entityTable: text("entity_table").notNull(), // 'shift_report'
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"), // snapshot JSON sebelum
    after: jsonb("after"), // snapshot JSON sesudah
    isPrivileged: boolean("is_privileged").notNull().default(false), // true untuk SUPERADMIN
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idxEntity: index("idx_audit_entity").on(t.entityTable, t.entityId),
    idxActor: index("idx_audit_actor").on(t.actorUserId, t.createdAt),
  })
);

// =============================================================================
// QR Registry — tracking QR code generation & scan
// =============================================================================

export const qrRegistry = pgTable("qr_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  type: qrTypeEnum("type").notNull(),
  entityId: uuid("entity_id").notNull(), // FK ke tabel sesuai type
  uri: text("uri").notNull().unique(), // 'ohmes://machine/PLT-MLG-01/MKR-01'
  hmac: text("hmac"), // untuk QR dinamis (anti-forgery)
  generatedBy: uuid("generated_by")
    .notNull()
    .references(() => user.id),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  printedAt: timestamp("printed_at"),
  isActive: boolean("is_active").notNull().default(true),
});

// =============================================================================
// Shift Correction — untuk CORRECTION flow pasca-LOCKED
// =============================================================================

export const shiftCorrection = pgTable("shift_correction", {
  id: uuid("id").primaryKey().defaultRandom(),
  originalShiftId: uuid("original_shift_id")
    .notNull()
    .references(() => shiftReport.id),
  correctedBy: uuid("corrected_by")
    .notNull()
    .references(() => user.id),
  correctionFields: jsonb("correction_fields").notNull(), // [{ path, oldValue, newValue, reason }]
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// =============================================================================
// Idempotency Key Store — dedup POST/PATCH 24 jam
// =============================================================================

export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(), // client-provided key
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    method: text("method").notNull(),
    path: text("path").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(), // now() + 24h
  },
  (t) => ({
    uniqueUserKey: unique().on(t.userId, t.key),
    idxExpires: index("idx_idem_expires").on(t.expiresAt),
  })
);
