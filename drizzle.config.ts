import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrasi (DDL) wajib pakai role superuser — runtime app memakai role
    // non-superuser (mes_app) supaya RLS benar-benar aktif.
    url: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || "",
  },
  strict: true,
  verbose: process.env.DEBUG === "true",
});
