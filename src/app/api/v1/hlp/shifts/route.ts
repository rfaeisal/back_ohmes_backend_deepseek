// GET + POST /api/v1/hlp/shifts — daftar & buka sesi HLP (docs/23)
// Sesi HLP open-ended: tidak terbatas 8 jam, ganti anggota tanpa tutup,
// tanpa approval. Roster hanya default value — bebas pilih.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { openHlpShift, listHlpShifts } from "@/lib/services/hlp-session.service";
import { ServiceError } from "@/lib/services/shift.service";

const openSchema = z.object({
  hlpMachineId: z.string().uuid(),
  members: z
    .array(z.object({ userId: z.string().uuid(), shiftRoleId: z.string().uuid().optional() }))
    .optional(),
});

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const result = await listHlpShifts({
    plantId: ctx.user.plantIds[0] ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    machineId: url.searchParams.get("machineId") ?? undefined,
  });
  return NextResponse.json({ data: result }, { status: 200 });
}, { requiredPermission: "hlp.pack" });

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = openSchema.safeParse(body);
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

    const result = await openHlpShift({
      plantId,
      hlpMachineId: parsed.data.hlpMachineId,
      startedBy: ctx.user.userId,
      members: parsed.data.members,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
}, { requiredPermission: "hlp.pack" });
