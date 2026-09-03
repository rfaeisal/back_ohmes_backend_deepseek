// GET + POST /api/v1/batch-stage-events — catatan per-stage rantai (docs/25)
// WR → SLOP → BAL; tanpa sesi formal, urutan bebas; satuan per stage
// (PACK/SLOP/BAL). Pemakaian & waste material tetap lewat /material-out.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import {
  createBatchStageEvent,
  listBatchStageEvents,
} from "@/lib/services/chain.service";
import { ServiceError } from "@/lib/services/shift.service";

const createSchema = z.object({
  batchId: z.string().uuid(),
  stage: z.enum(["WR", "SLOP", "BAL"]),
  machineId: z.string().uuid().optional(),
  inputQty: z.number().min(0).default(0),
  outputQty: z.number().min(0).default(0),
  rejectQty: z.number().min(0).default(0),
  // Rasio input per 1 output (0032) — hanya SLOP/BAL; service mengabaikan untuk WR
  isiPerUnit: z.number().int().min(1).optional(),
  // Sisa input tidak terpakai (0032) — angka resmi isi karton
  sisaQty: z.number().int().min(0).optional(),
  notes: z.string().max(200).optional(),
});

export const GET = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const batchId = url.searchParams.get("batchId");
  if (!batchId) {
    return NextResponse.json(
      { error: { code: "BATCH_ID_REQUIRED", message: "Query batchId wajib." } },
      { status: 400 }
    );
  }
  const data = await listBatchStageEvents(batchId);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "hlp.pack" });

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    const plantId = ctx.user.plantIds[0];
    if (!plantId) {
      return NextResponse.json(
        { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const result = await createBatchStageEvent({
      plantId,
      batchId: parsed.data.batchId,
      stage: parsed.data.stage,
      machineId: parsed.data.machineId,
      inputQty: parsed.data.inputQty,
      outputQty: parsed.data.outputQty,
      rejectQty: parsed.data.rejectQty,
      isiPerUnit: parsed.data.isiPerUnit,
      sisaQty: parsed.data.sisaQty,
      notes: parsed.data.notes,
      operatorBy: ctx.user.userId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
}, { requiredPermission: "hlp.pack" });
