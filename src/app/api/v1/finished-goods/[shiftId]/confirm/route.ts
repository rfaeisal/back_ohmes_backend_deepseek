// POST /finished-goods/:shiftId/confirm — Confirm receiving pack dari HLP
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { confirmReceiving, ServiceError } from "@/lib/services/wms-outbound.service";

const schema = z.object({ packsActualCount: z.number().int().min(0) });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ shiftId: string }> }) => {
    try {
      const { shiftId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await confirmReceiving(shiftId, parsed.data.packsActualCount, ctx.user.userId);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  }
);
