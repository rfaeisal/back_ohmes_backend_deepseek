// PATCH /api/v1/tsg-inventory/:id/writeoff — Write-off boks rusak
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { writeoffInventory } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const writeoffSchema = z.object({
  writeoffReason: z.string().min(1, "Alasan write-off wajib"),
});

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: inventoryId } = await params;
      const body = await request.json();
      const parsed = writeoffSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await writeoffInventory(inventoryId, parsed.data.writeoffReason, ctx.user.userId);
      return NextResponse.json(result, { status: 200 });
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
  { requiredPermission: "tsg.inventory.writeoff" }
);
