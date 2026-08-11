// POST /api/v1/shifts/:id/maintenance — Log maintenance/sparepart
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { logMaintenance } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

const maintenanceSchema = z.object({
  sparepartId: z.string().uuid(),
  quantity: z.number().int().min(1),
  linkedBoxId: z.string().uuid().optional(),
  note: z.string().optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: shiftReportId } = await params;
      const body = await request.json();
      const parsed = maintenanceSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const plantId = ctx.user.plantIds[0]!;
      const result = await logMaintenance({
        shiftReportId,
        plantId,
        ...parsed.data,
        loggedBy: ctx.user.userId,
      });

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
  }
);
