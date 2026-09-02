// POST /cartons/:id/add-pack — Isi karton (pack HLP atau hasil stage WR/SLOP/BAL)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { addContentToCarton, ServiceError } from "@/lib/services/wms-outbound.service";

const schema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("HLP_PACK"),
    hlpPackId: z.string().uuid(),
    packQty: z.number().int().min(1).default(1),
  }),
  z.object({
    sourceType: z.literal("STAGE"),
    batchId: z.string().uuid(),
    stage: z.enum(["WR", "SLOP", "BAL"]),
    packQty: z.number().int().min(1),
  }),
]);

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: cartonId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const plantId = ctx.user.plantIds[0]!;
      const result = await addContentToCarton({
        cartonId,
        plantId,
        packQty: parsed.data.packQty,
        ...(parsed.data.sourceType === "HLP_PACK"
          ? { sourceType: "HLP_PACK" as const, hlpPackId: parsed.data.hlpPackId }
          : { sourceType: "STAGE" as const, batchId: parsed.data.batchId, stage: parsed.data.stage }),
        addedBy: ctx.user.userId,
      });
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: (err as ServiceError).code, message: (err as ServiceError).message, details: (err as ServiceError).details }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "cartoning.add_pack" }
);
