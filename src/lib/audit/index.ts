// =============================================================================
// Audit Log Helper — Write audit trail untuk semua mutasi
// =============================================================================

import db from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  actorUserId: string;
  action: string;
  entityTable: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  isPrivileged?: boolean;
  scopeType?: string;
  scopeId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write single audit log entry.
 * Dipanggil dari service layer setiap kali ada mutasi.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityTable: entry.entityTable,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    isPrivileged: entry.isPrivileged ?? false,
    scopeType: entry.scopeType ?? null,
    scopeId: entry.scopeId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

/**
 * Batch write — untuk operasi bulk (mis. receiving 50 boks).
 */
export async function writeAuditBatch(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(auditLog).values(
    entries.map((e) => ({
      actorUserId: e.actorUserId,
      action: e.action,
      entityTable: e.entityTable,
      entityId: e.entityId,
      before: e.before ?? null,
      after: e.after ?? null,
      isPrivileged: e.isPrivileged ?? false,
      scopeType: e.scopeType ?? null,
      scopeId: e.scopeId ?? null,
      ipAddress: e.ipAddress ?? null,
      userAgent: e.userAgent ?? null,
    }))
  );
}
