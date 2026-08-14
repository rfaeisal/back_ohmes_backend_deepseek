// POST /box-sessions/:id/weigh — Timbang batangan kolektif sesi boks
// Membuat batch dengan kode btc_<machine>_<date>_<seq> (penanda bahan masuk HLP).
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { weighBoxSession } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({ totalBatanganKg: z.number().positive() });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: sessionId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await weighBoxSession({
        sessionId,
        totalBatanganKg: parsed.data.totalBatanganKg,
        actorUserId: ctx.user.userId,
      });

      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "shift.box.weigh" }
);
