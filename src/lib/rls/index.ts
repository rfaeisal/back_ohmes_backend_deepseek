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
