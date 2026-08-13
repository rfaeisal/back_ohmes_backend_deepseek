// POST /cartons/:id/close — Tutup karton (OPEN → READY)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { closeCarton, ServiceError } from "@/lib/services/wms-outbound.service";

export const POST = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: cartonId } = await params;
      const result = await closeCarton(cartonId, ctx.user.userId);
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
  { requiredPermission: "cartoning.close" }
);
