// POST /api/v1/rijekan/reproses — proses rijek terkumpul → TSG baru (docs/26 §4)
// Lot INTERNAL satu jenis → validasi sisa tersedia → receiving "Reproses
// Internal (Rijekan)" dengan berat timbang aktual → inventory AVAILABLE →
// alokasi + OUT_REPROSES. Berat rijekan asli (beratAcuan) ikut dikembalikan.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { ServiceError } from "@/lib/services/shift.service";
import { processRijekanReproses } from "@/lib/services/rijekan.service";

const schema = z.object({
  tsgType: z.enum(["REGULER", "MILD", "PUTIHAN"]),
  lots: z
    .array(
      z.object({
        ledgerEntryId: z.string().uuid(),
        qty: z.number().positive(),
      })
    )
    .min(1)
    .max(50),
  weightKg: z.number().positive().max(10000),
  note: z.string().max(200).optional(),
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

    const result = await processRijekanReproses({
      plantId,
      actorUserId: ctx.user.userId,
      tsgType: parsed.data.tsgType,
      lots: parsed.data.lots,
      weightKg: parsed.data.weightKg,
      note: parsed.data.note,
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
