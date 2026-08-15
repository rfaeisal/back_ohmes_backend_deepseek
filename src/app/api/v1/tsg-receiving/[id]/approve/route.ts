// POST /tsg-receiving/:id/approve — Approve receiving manual (tanpa SJ) → buat inventory
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { approveReceiving } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

export const POST = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: receivingId } = await params;
      const plantId = ctx.user.plantIds[0];
      if (!plantId) return NextResponse.json({ error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId }, { status: 403 });

      const result = await approveReceiving(receivingId, plantId, ctx.user.userId);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "tsg.receiving.approve" }
);
