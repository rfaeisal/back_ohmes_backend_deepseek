// PATCH /api/v1/boxes/:id — Timbang hasil boks
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { weighBox, ServiceError as BoxServiceError } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const weighSchema = z.object({
  outputWeightKg: z.number().min(0.01, "Berat output harus > 0"),
});

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: boxId } = await params;
      const body = await request.json();
      const parsed = weighSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await weighBox({ boxId, ...parsed.data });

      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof BoxServiceError || err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "shift.box.weigh" }
);
