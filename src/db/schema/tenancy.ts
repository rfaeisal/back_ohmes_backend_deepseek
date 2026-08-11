import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// =============================================================================
// Tabel Tenancy — Hirarki Organisasi 3 Level
// =============================================================================

export const company = pgTable("company", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const region = pgTable(
  "region",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    code: text("code").notNull(), // 'AREA-JATIM'
    name: text("name").notNull(), // 'Area Jawa Timur'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueCodePerCompany: unique().on(t.companyId, t.code),
  })
);

export const plant = pgTable("plant", {
  id: uuid("id").primaryKey().defaultRandom(),
  regionId: uuid("region_id")
    .notNull()
    .references(() => region.id),
  code: text("code").notNull().unique(), // 'PLT-MLG-01'
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  address: text("address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});
