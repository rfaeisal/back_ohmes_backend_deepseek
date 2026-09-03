// POST /api/v1/rijekan/return — serah terima waste makloon ke customer (docs/26 §5)
// Semua lot MAKLOON tersisa milik satu order ditandai returned + dicatat di
// rijekan_return (dasar dokumen berita acara serah terima).
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { ServiceError } from "@/lib/services/shift.service";
import { returnRijekanMakloon } from "@/lib/services/rijekan.service";

const schema = z.object({
  makloonOrderId: z.string().uuid(),
  docRef: z.string().max(50).optional(),
  notes: z.string().max(200).optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
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

    const result = await returnRijekanMakloon({
      plantId,
      actorUserId: ctx.user.userId,
      makloonOrderId: parsed.data.makloonOrderId,
      docRef: parsed.data.docRef,
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
