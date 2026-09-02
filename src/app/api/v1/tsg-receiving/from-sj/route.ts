// POST /tsg-receiving/from-sj — Pabrik verifikasi Surat Jalan Supplier →
// buat receiving + inventory otomatis (berat dari timbangan supplier)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { receiveFromSupplierSj } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  supplierSjId: z.string().uuid(),
  // Label yang discan saat validasi jumlah di pabrik (opsional — default semua boks SJ)
  verifiedBoxCodes: z.array(z.string().min(1).max(50)).min(1).max(500).optional(),
  // Penanda makloon (0031) — diteruskan ke inventory & batch
  isMakloon: z.boolean().optional().default(false),
  makloonCustomer: z.string().max(120).optional(),
  makloonTarget: z.enum(["PACK", "PACK_WRAP", "SLOP", "BAL", "KARTON"]).optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext) => {
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
      if (!plantId) return NextResponse.json({ error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId }, { status: 403 });

      const result = await receiveFromSupplierSj({
        supplierSjId: parsed.data.supplierSjId,
        plantId,
        actorUserId: ctx.user.userId,
        verifiedBoxCodes: parsed.data.verifiedBoxCodes,
        isMakloon: parsed.data.isMakloon,
        makloonCustomer: parsed.data.makloonCustomer,
        makloonTarget: parsed.data.makloonTarget,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "tsg.receiving.create" }
);
