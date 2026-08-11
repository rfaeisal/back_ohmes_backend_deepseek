// =============================================================================
// CORRECTION Service — Koreksi shift LOCKED oleh HQ_AUDITOR
// =============================================================================

import { eq } from "drizzle-orm";
import db from "@/db";
import { shiftReport, shiftCorrection, auditLog } from "@/db/schema";
import { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface CorrectionField {
  path: string;    // mis. "waste.MENIR.kg"
  newValue: unknown;
  reason: string;
}

export interface CorrectionInput {
  shiftId: string;
  correctionFields: CorrectionField[];
  notes?: string;
  correctedBy: string;
}

// =============================================================================
// Create Correction — tidak mengubah shift asli
// =============================================================================

export async function createCorrection(input: CorrectionInput) {
  // 1. Validasi shift status APPROVED
  const [shift] = await db
    .select({
      id: shiftReport.id,
      status: shiftReport.status,
      plantId: shiftReport.plantId,
    })
    .from(shiftReport)
    .where(eq(shiftReport.id, input.shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "APPROVED") {
    throw new ServiceError(
      "SHIFT_NOT_APPROVED",
      "Hanya shift APPROVED (LOCKED) yang bisa dikoreksi."
    );
  }

  // 2. Validasi correction fields
  if (input.correctionFields.length === 0) {
    throw new ServiceError(
      "NO_CORRECTION_FIELDS",
      "Minimal 1 field yang dikoreksi."
    );
  }

  // 3. Create correction record (TIDAK update shift asli)
  const [correction] = await db
    .insert(shiftCorrection)
    .values({
      originalShiftId: input.shiftId,
      correctedBy: input.correctedBy,
      correctionFields: input.correctionFields,
      notes: input.notes ?? null,
    })
    .returning();

  if (!correction) throw new Error("CORRECTION_CREATE_FAILED");

  // 4. Audit log
  await db.insert(auditLog).values({
    actorUserId: input.correctedBy,
    action: "shift.correct",
    entityTable: "shift_report",
    entityId: input.shiftId,
    before: { status: "APPROVED" },
    after: {
      correctionId: correction.id,
      fields: input.correctionFields,
    },
    isPrivileged: false,
  });

  return {
    correctionId: correction.id,
    shiftId: input.shiftId,
    fieldsCorrected: input.correctionFields.length,
    createdAt: correction.createdAt,
  };
}

// =============================================================================
// Get Corrections for a Shift
// =============================================================================

export async function getShiftCorrections(shiftId: string) {
  const corrections = await db
    .select()
    .from(shiftCorrection)
    .where(eq(shiftCorrection.originalShiftId, shiftId))
    .orderBy(shiftCorrection.createdAt);

  return { shiftId, corrections };
}
