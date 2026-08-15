import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// =============================================================================
// Database Connection — Lazy initialization
// =============================================================================
// Tidak throw di module level supaya Next.js build bisa jalan tanpa DATABASE_URL.
// Koneksi hanya dibuat saat query pertama kali dijalankan.
// =============================================================================

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
  db: ReturnType<typeof drizzle> | undefined;
};

function createConnection(): {
  client: ReturnType<typeof postgres>;
  db: ReturnType<typeof drizzle>;
} {
  if (globalForDb.client && globalForDb.db) {
    return { client: globalForDb.client, db: globalForDb.db };
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Saat build: return dummy connection yang hanya throw saat digunakan
    // Ini mencegah module-level throw tapi tetap gagal saat runtime.
    const dummyClient = postgres("postgres://placeholder:placeholder@localhost:5432/placeholder", {
      max: 0,
      idle_timeout: 0,
      connect_timeout: 1,
    });
    const dummyDb = drizzle(dummyClient, { schema });
    return { client: dummyClient, db: dummyDb };
  }

  const client = postgres(connectionString, {
    // max 1 (sticky connection) — RLS memakai SET SESSION (app.current_plant_ids /
    // current_user_id). Dengan pool > 1, query bisa jalan di koneksi yang menyimpan
    // setting user LAIN. Catatan 2026-08-15: saat ini role DB (mes_user) masih
    // SUPERUSER (rolbypassrls) sehingga RLS belum efektif — isolasi sementara
    // dilakukan di level kode. TODO: role DB non-superuser + FORCE RLS.
    max: 1,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // Disable prepared statements untuk kompatibilitas Neon/Supabase
  });

  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.client = client;
    globalForDb.db = db;
  }

  return { client, db };
}

const { client, db } = createConnection();

export { client, db };
export default db;
