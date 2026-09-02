// PATCH /batches/:id/target — tentukan produk jadi target batch (0030)
// PACK | PACK_WRAP | SLOP | BAL — diputuskan operator HLP sebelum stage dimulai
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { setBatchTarget, ServiceError } from "@/lib/services/chain.service";

const schema = z.object({
  targetUnit: z.enum(["PACK", "PACK_WRAP", "SLOP", "BAL"]),
  reason: z.string().max(200).optional(),
});

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: batchId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await setBatchTarget({
        batchId,
        targetUnit: parsed.data.targetUnit,
        reason: parsed.data.reason,
        actorUserId: ctx.user.userId,
      });
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "hlp.pack" }
);
