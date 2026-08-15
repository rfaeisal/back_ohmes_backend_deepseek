// POST /supplier-sj/:id/boxes/weigh — Scan label = assign ke SJ + pilih jenis + input berat (satu langkah)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { weighSupplierSjBox } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  boxCode: z.string().min(1).max(50),
  tsgType: z.enum(["REGULER", "MILD", "PUTIHAN"]).optional(), // wajib saat assign label pool
  supplierWeightKg: z.number().positive().max(100),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: supplierSjId } = await params;
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await weighSupplierSjBox({
        supplierSjId,
        boxCode: parsed.data.boxCode,
        tsgType: parsed.data.tsgType,
        supplierWeightKg: parsed.data.supplierWeightKg,
        actorUserId: ctx.user.userId,
      });

      return NextResponse.json(
        {
          boxId: result!.id,
          boxCode: result!.boxCode,
          tsgType: result!.tsgType,
          labelStatus: result!.labelStatus,
          supplierWeightKg: result!.supplierWeightKg,
          enteredAt: result!.enteredAt,
        },
        { status: 200 }
      );
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.label" }
);
