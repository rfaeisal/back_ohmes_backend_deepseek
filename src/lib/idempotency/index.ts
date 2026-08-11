// =============================================================================
// Idempotency Middleware — Dedup POST/PATCH requests
// =============================================================================

import { eq, and, lt } from "drizzle-orm";
import db from "@/db";
import { idempotencyKey } from "@/db/schema";
import { isValidIdempotencyKey } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface IdempotencyResult {
  /** True jika ini replay request — sudah diproses sebelumnya */
  isReplay: boolean;
  /** Cached response body (hanya diisi kalau isReplay=true) */
  cachedResponse?: { status: number; body: unknown };
}

// =============================================================================
// Check Idempotency Key
// =============================================================================

/**
 * Cek apakah request dengan key ini sudah pernah diproses.
 * - Key baru → return isReplay=false, lanjutkan proses
 * - Key duplikat (24h) → return isReplay=true + cached response
 *
 * Dipanggil DI AWAL setiap POST/PATCH handler.
 */
export async function checkIdempotency(
  key: string,
  userId: string,
  _method: string,
  _path: string
): Promise<IdempotencyResult> {
  // Validasi format
  if (!isValidIdempotencyKey(key)) {
    return { isReplay: false }; // Invalid key = process normally
  }

  // Cari existing key
  const [existing] = await db
    .select({
      responseStatus: idempotencyKey.responseStatus,
      responseBody: idempotencyKey.responseBody,
      createdAt: idempotencyKey.createdAt,
    })
    .from(idempotencyKey)
    .where(and(eq(idempotencyKey.userId, userId), eq(idempotencyKey.key, key)))
    .limit(1);

  if (existing && new Date() < new Date(existing.createdAt.getTime() + 24 * 60 * 60 * 1000)) {
    // Replay request
    return {
      isReplay: true,
      cachedResponse: {
        status: existing.responseStatus,
        body: existing.responseBody,
      },
    };
  }

  return { isReplay: false };
}

/**
 * Simpan idempotency response setelah proses pertama.
 * Dipanggil SETELAH handler selesai (sebelum return response).
 */
export async function storeIdempotency(
  key: string,
  userId: string,
  method: string,
  path: string,
  responseStatus: number,
  responseBody: unknown
): Promise<void> {
  if (!isValidIdempotencyKey(key)) return;

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

  await db
    .insert(idempotencyKey)
    .values({
      key,
      userId,
      method,
      path,
      responseStatus,
      responseBody,
      expiresAt,
    })
    .onConflictDoNothing();
}

// =============================================================================
// Cleanup expired keys (cron job — panggil sekali sehari)
// =============================================================================

export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const result = await db
    .delete(idempotencyKey)
    .where(lt(idempotencyKey.expiresAt, new Date()))
    .returning({ id: idempotencyKey.id });

  return result.length;
}
