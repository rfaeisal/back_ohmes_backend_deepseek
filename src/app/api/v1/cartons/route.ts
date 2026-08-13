// POST /cartons — Create carton baru
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createCarton, ServiceError } from "@/lib/services/wms-outbound.service";

const schema = z.object({
  productId: z.string().uuid(),
  capacityPack: z.number().int().min(1).max(200).default(50),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
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

    const result = await createCarton({ plantId, ...parsed.data, openedBy: ctx.user.userId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
},
  { requiredPermission: "cartoning.create" });
