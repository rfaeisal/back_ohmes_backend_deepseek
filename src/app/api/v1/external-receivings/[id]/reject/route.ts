// POST /api/v1/external-receivings/:id/reject — tolak penerimaan + catatan
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { rejectExternalReceiving } from "@/lib/services/makloon.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  reason: z.string().min(3, "Catatan penolakan wajib (min 3 karakter)"),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
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
      const result = await rejectExternalReceiving(id, plantId, ctx.user.userId, parsed.data.reason);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "tsg.receiving.approve" }
);
