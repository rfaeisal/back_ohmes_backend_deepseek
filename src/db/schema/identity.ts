import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// =============================================================================
// Enums
// =============================================================================

export const deviceTypeEnum = pgEnum("device_type", ["MOBILE", "WEB"]);

// =============================================================================
// Tabel Identity — User, Session, Role, Permission, Assignment
// =============================================================================

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const userSession = pgTable(
  "user_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    refreshTokenHash: text("refresh_token_hash").notNull(), // hash(sha256) refresh token
    activeScopeType: text("active_scope_type").notNull(), // 'GLOBAL' | 'COMPANY' | 'REGION' | 'PLANT'
    activeScopeId: uuid("active_scope_id"), // NULL kalau GLOBAL (SUPERADMIN)
    deviceType: deviceTypeEnum("device_type").notNull(), // MOBILE | WEB
    deviceId: text("device_id"), // stable device identifier
    deviceName: text("device_name"), // 'Samsung SM-A125'
    pushToken: text("push_token"), // FCM/APNs token
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    revokedBy: uuid("revoked_by").references(() => user.id),
    revokedReason: text("revoked_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Single-session mobile: hanya 1 session aktif per user untuk MOBILE
    uniqueActiveMobile: uniqueIndex("uq_session_active_mobile")
      .on(t.userId)
      .where(sql`device_type = 'MOBILE' AND revoked_at IS NULL`),
    idxUserActive: index("idx_session_user_active")
      .on(t.userId)
      .where(sql`revoked_at IS NULL`),
  })
);

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'SUPERADMIN', 'HQ_ADMIN', 'PLANT_MANAGER', dst
  name: text("name").notNull(),
  description: text("description"),
  scopeLevel: text("scope_level").notNull(), // 'GLOBAL' | 'COMPANY' | 'REGION' | 'PLANT'
  isPrivileged: boolean("is_privileged").notNull().default(false), // true untuk SUPERADMIN
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Auth policy per role — untuk SUPERADMIN (TTL pendek, 2FA wajib, max aktif)
export const authPolicy = pgTable("auth_policy", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => role.id)
    .unique(),
  accessTokenTtlMinutes: integer("access_token_ttl_minutes").notNull().default(15),
  refreshTokenTtlDays: integer("refresh_token_ttl_days").notNull().default(30),
  require2fa: boolean("require_2fa").notNull().default(false),
  ipAllowlist: text("ip_allowlist").array(), // NULL = allow all
  maxActiveAssignments: integer("max_active_assignments"), // NULL = unlimited; SUPERADMIN = 3
});

export const permission = pgTable("permission", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // 'shift.approve', 'masterdata.product.edit'
  description: text("description"),
});

export const rolePermission = pgTable(
  "role_permission",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  })
);

export const userAssignment = pgTable(
  "user_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    scopeType: text("scope_type").notNull(), // 'COMPANY' | 'REGION' | 'PLANT'
    scopeId: uuid("scope_id").notNull(), // FK ke company.id / region.id / plant.id
    roleId: uuid("role_id")
      .notNull()
      .references(() => role.id),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => user.id),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
  },
  (t) => ({
    uniqueActive: uniqueIndex("uq_ua_active")
      .on(t.userId, t.scopeType, t.scopeId, t.roleId)
      .where(sql`revoked_at IS NULL`),
    idxScope: index("idx_ua_scope").on(t.scopeType, t.scopeId),
  })
);
