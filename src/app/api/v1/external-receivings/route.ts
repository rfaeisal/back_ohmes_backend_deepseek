// GET + POST /api/v1/external-receivings — penerimaan batangan external (makloon)
// docs/24: gudang inbound catat (PENDING) → PM/supervisor approve → jadi
// batch EXTERNAL (btx_) untuk diproses HLP.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import {
  createExternalReceiving,
  listExternalReceivings,
} from "@/lib/services/makloon.service";
import { ServiceError } from "@/lib/services/shift.service";

const createSchema = z.object({
  senderName: z.string().min(1, "Nama pengirim wajib"),
  docRef: z.string().max(50).optional(),
  batanganKg: z.number().positive().max(10000),
  notes: z.string().max(300).optional(),
});

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }
  const data = await listExternalReceivings(plantId, url.searchParams.get("status") ?? undefined);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "tsg.receiving.view" });

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
    const result = await createExternalReceiving({
      plantId,
      senderName: parsed.data.senderName,
      docRef: parsed.data.docRef,
      batanganKg: parsed.data.batanganKg,
      receivedBy: ctx.user.userId,
      notes: parsed.data.notes,
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
}, { requiredPermission: "tsg.receiving.create" });
