// POST /shifts/:id/downtime — Log downtime event
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { logDowntime } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  category: z.enum(["GANTI_MATERIAL", "KENDALA_MESIN", "TUNGGU_BAHAN", "ISTIRAHAT_IZIN", "MAINTENANCE"]),
  durationMinutes: z.number().int().min(1).max(720),
  linkedBoxId: z.string().uuid().optional(),
  description: z.string().optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });

      const plantId = ctx.user.plantIds[0]!;
      const result = await logDowntime({ shiftReportId, plantId, ...parsed.data, loggedBy: ctx.user.userId });
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      throw err;
    }
  }
);
