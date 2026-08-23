// POST /api/v1/tsg-inventory/:id/override-fifo — Otorisasi pakai boks di luar
// urutan FIFO (mobile handoff BACKEND_HANDOFF.md §6 + docs mobile
// 08-flow-monitoring.md §3.3). Permission: tsg.inventory.allocate.override
// (PLANT_MANAGER + SUPERADMIN). Alasan wajib — tercatat di kolom + audit log.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { overrideFifoInventory } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  reason: z.string().trim().min(1, "Alasan override wajib").max(500),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: inventoryId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await overrideFifoInventory(
        inventoryId,
        parsed.data.reason,
        ctx.user.userId,
        ctx.user.isPrivileged
      );
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
  { requiredPermission: "tsg.inventory.allocate.override" }
);
