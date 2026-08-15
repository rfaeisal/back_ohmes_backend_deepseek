// POST /shifts/:id/box-sessions — Buka sesi boks (1–6 boks pilihan operator)
// GET  /shifts/:id/box-sessions — Daftar sesi boks shift (untuk reload tablet)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { tsgBoxSession, tsgBoxProcess, batch } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { openBoxSession } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const openSchema = z.object({
  inventoryBoxIds: z.array(z.string().uuid()).min(1).max(6),
  // Berat aktual timbangan pabrik per inventoryBoxId (opsional — default berat supplier)
  realWeightKg: z.record(z.string().uuid(), z.number().positive().max(100)).optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const body = await request.json();
      const parsed = openSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }
      const plantId = ctx.user.plantIds[0];
      if (!plantId) return NextResponse.json({ error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId }, { status: 403 });

      const result = await openBoxSession({
        shiftReportId,
        plantId,
        inventoryBoxIds: parsed.data.inventoryBoxIds,
        realWeightKg: parsed.data.realWeightKg,
        actorUserId: ctx.user.userId,
      });
      if (!result.session) throw new ServiceError("SESSION_CREATE_FAILED", "Gagal membuat sesi boks.");
      return NextResponse.json(
        {
          sessionId: result.session.id,
          boxes: result.boxes.map((b) => ({
            boxId: b.id,
            boxNumber: b.boxNumber,
            boxCode: b.boxCode,
            tsgWeightKg: b.tsgWeightKg,
            isPartial: b.isPartial,
            openedAt: b.openedAt,
          })),
        },
        { status: 201 }
      );
    } catch (err) {
      if (err instanceof ServiceError) {
        const status = ["TSG_BOX_NOT_AVAILABLE", "INVALID_BOX_COUNT", "DUPLICATE_BOX"].includes(err.code) ? 400 : 409;
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status });
      }
      throw err;
    }
  },
  { requiredPermission: "shift.box.open" }
);

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const sessions = await db
        .select()
        .from(tsgBoxSession)
        .where(eq(tsgBoxSession.shiftReportId, shiftReportId));
      const boxes = await db
        .select()
        .from(tsgBoxProcess)
        .where(eq(tsgBoxProcess.shiftReportId, shiftReportId));

      const batchIds = sessions.map((s) => s.batchId).filter((id): id is string => !!id);
      const batches = batchIds.length > 0
        ? await db
            .select({ id: batch.id, code: batch.code })
            .from(batch)
            .where(inArray(batch.id, batchIds))
        : [];
      const batchCodeMap = new Map(batches.map((b) => [b.id, b.code]));

      const data = sessions.map((s) => ({
        id: s.id,
        status: s.status,
        totalBatanganKg: s.totalBatanganKg,
        openedAt: s.openedAt,
        weighedAt: s.weighedAt,
        batchCode: s.batchId ? (batchCodeMap.get(s.batchId) ?? null) : null,
        boxes: boxes
          .filter((b) => b.sessionId === s.id)
          .map((b) => ({
            boxId: b.id,
            boxNumber: b.boxNumber,
            boxCode: b.boxCode,
            tsgWeightKg: b.tsgWeightKg,
            outputWeightKg: b.outputWeightKg,
            yieldPct: b.yieldPct,
            isPartial: b.isPartial,
            openedAt: b.openedAt,
            completedAt: b.completedAt,
          })),
      }));

      return NextResponse.json({ data }, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 400 });
      }
      throw err;
    }
  },
  { requiredPermission: "shift.view" }
);
