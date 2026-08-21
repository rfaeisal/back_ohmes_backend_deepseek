// =============================================================================
// RLS Session Context — Set PostgreSQL Session Variables
// =============================================================================

import { sql } from "drizzle-orm";
import db from "@/db";

// =============================================================================
// Types
// =============================================================================

export interface RlsSessionContext {
  plantIds: string[];
  userId: string;
  roleIds: string[];
  bypassRls: boolean; // hanya SUPERADMIN
}

// =============================================================================
// Set RLS Context
// =============================================================================

/**
 * Set PostgreSQL session variables untuk RLS sebelum menjalankan query.
 * Wajib dipanggil di setiap API endpoint setelah auth.
 *
 * Format:
 *   SET SESSION app.current_plant_ids = '{uuid-a, uuid-b}';
 *   SET SESSION app.current_user_id = 'uuid-user';
 *   SET SESSION app.current_role_ids = '{role-a, role-b}';
 *   SET SESSION app.bypass_rls = 'true'|'false';
 */
export async function setRlsContext(context: RlsSessionContext): Promise<void> {
  const plantIdsStr = `{${context.plantIds.join(",")}}`;
  const roleIdsStr = `{${context.roleIds.join(",")}}`;
  const bypassStr = context.bypassRls ? "true" : "false";

  await db.execute(
    sql.raw(`SET SESSION app.current_plant_ids = '${plantIdsStr}'`)
  );
  await db.execute(
    sql.raw(`SET SESSION app.current_user_id = '${context.userId}'`)
  );
  await db.execute(
    sql.raw(`SET SESSION app.current_role_ids = '${roleIdsStr}'`)
  );
  await db.execute(
    sql.raw(`SET SESSION app.bypass_rls = '${bypassStr}'`)
  );
}

/**
 * Reset RLS context — biasanya tidak perlu karena SET SESSION auto-reset
 * setelah transaksi berakhir. Untuk long-lived connections, panggil ini.
 */
export async function resetRlsContext(): Promise<void> {
  await db.execute(sql.raw(`RESET app.current_plant_ids`));
  await db.execute(sql.raw(`RESET app.current_user_id`));
  await db.execute(sql.raw(`RESET app.current_role_ids`));
  await db.execute(sql.raw(`RESET app.bypass_rls`));
}

// =============================================================================
// Server Component Context
// =============================================================================

/**
 * Set context bypass untuk server component (halaman admin/tablet) yang query
 * database langsung TANPA melewati withAuth.
 *
 * Konteks: halaman-halaman ini auth-nya masih client-side (localStorage JWT) —
 * server component tidak bisa membaca token, sehingga tidak bisa resolve scope
 * plant. Selama ini halaman "kebetulan" jalan karena memakai sisa GUC dari
 * request API sebelumnya di sticky connection yang sama (max: 1) — rapuh dan
 * bisa bocor scope user lain. Default eksplisit ini menggantinya secara
 * deterministik.
 *
 * ⚠️ TODO (tech-debt): pindahkan auth halaman ke cookie httpOnly + middleware
 * server-side, lalu set context dari scope asli user — BUKAN bypass.
 */
export async function setServerPageBypassContext(): Promise<void> {
  await setRlsContext({
    plantIds: [],
    userId: "server-page", // penanda di audit/query log: bukan user asli
    roleIds: [],
    bypassRls: true,
  });
}
