// PATCH /api/v1/makloon-orders/:id — ubah status order makloon (docs/26 §2.1)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { ServiceError } from "@/lib/services/shift.service";
import { updateMakloonOrderStatus } from "@/lib/services/makloon-order.service";

const patchSchema = z.object({
  status: z.enum(["OPEN", "RECEIVING", "PROCESSING", "DONE"]),
});

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const updated = await updateMakloonOrderStatus(id, parsed.data.status, ctx.user.userId);
      return NextResponse.json(updated, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 400 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "tsg.receiving.approve" }
);
