// POST /shifts/:id/boxes — Buka boks dari inventory FIFO
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { openBox } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({ inventoryBoxId: z.string().uuid().optional() });

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }
      const plantId = ctx.user.plantIds[0];
      if (!plantId) return NextResponse.json({ error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId }, { status: 403 });

      const box = await openBox({ shiftReportId, plantId, inventoryBoxId: parsed.data.inventoryBoxId });
      if (!box) throw new ServiceError("BOX_CREATE_FAILED", "Gagal membuat boks.");
      return NextResponse.json({ boxId: box.id, boxNumber: box.boxNumber, boxCode: box.boxCode, tsgWeightKg: box.tsgWeightKg, isPartial: box.isPartial, openedAt: box.openedAt }, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: err.code === "TSG_BOX_NOT_AVAILABLE" ? 400 : 409 });
      throw err;
    }
  },
  { requiredPermission: "shift.box.open" }
);
