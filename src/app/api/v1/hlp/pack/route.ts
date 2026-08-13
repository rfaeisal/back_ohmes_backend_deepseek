// POST /api/v1/hlp/pack — Catat hasil packing HLP
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { hlpPackInput } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const hlpPackSchema = z.object({
  batchId: z.string().uuid(),
  hlpMachineId: z.string().uuid(),
  packsLolos: z.number().int().min(0),
  isiPerPack: z.number().int().min(1).default(20),
  rejectBatangan: z.number().int().min(0).default(0),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = hlpPackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const plantId = ctx.user.plantIds[0]!;
    const result = await hlpPackInput({ plantId, ...parsed.data });

    return NextResponse.json(result, { status: 201 });
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
  { requiredPermission: "hlp.pack" });
