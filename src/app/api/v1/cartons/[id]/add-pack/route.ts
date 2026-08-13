// POST /cartons/:id/add-pack — Tambah pack ke karton
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { addPackToCarton, ServiceError } from "@/lib/services/wms-outbound.service";

const schema = z.object({ hlpPackId: z.string().uuid() });

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
      const result = await addPackToCarton({ cartonId, plantId, ...parsed.data, addedBy: ctx.user.userId });
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
  },
  { requiredPermission: "cartoning.add_pack" }
);
