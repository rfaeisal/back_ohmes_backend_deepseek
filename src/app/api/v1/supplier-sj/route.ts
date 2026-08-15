// POST /supplier-sj — Buat Surat Jalan Supplier + generate label QR per jenis TSG
// GET  /supplier-sj — Daftar surat jalan (scope area/pabrik via RLS)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import db from "@/db";
import { supplierSj, tsgSupplier, plant } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createSupplierSj } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

// v1.1: SJ lahir tanpa label — boks masuk saat scan/assign di gudang supplier
const createSchema = z.object({
  sjNumber: z.string().min(1).max(50),
  supplierId: z.string().uuid(),
  plantId: z.string().uuid(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext) => {
    try {
      const body = await request.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      // Pabrik tujuan harus dalam scope user
      if (!ctx.user.plantIds.includes(parsed.data.plantId)) {
        return NextResponse.json(
          { error: { code: "PLANT_OUT_OF_SCOPE", message: "Pabrik tujuan di luar scope anda." }, requestId: ctx.requestId },
          { status: 403 }
        );
      }

      const result = await createSupplierSj({
        sjNumber: parsed.data.sjNumber,
        supplierId: parsed.data.supplierId,
        plantId: parsed.data.plantId,
        actorUserId: ctx.user.userId,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.create" }
);

export const GET = withAuth(
  async (request: Request) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;

    const items = await db
      .select({
        id: supplierSj.id,
        sjNumber: supplierSj.sjNumber,
        supplierId: supplierSj.supplierId,
        supplierName: tsgSupplier.name,
        plantId: supplierSj.plantId,
        plantCode: plant.code,
        status: supplierSj.status,
        shippedAt: supplierSj.shippedAt,
        receivedAt: supplierSj.receivedAt,
        note: supplierSj.note,
        createdAt: supplierSj.createdAt,
      })
      .from(supplierSj)
      .innerJoin(tsgSupplier, eq(supplierSj.supplierId, tsgSupplier.id))
      .innerJoin(plant, eq(supplierSj.plantId, plant.id))
      .where(status ? eq(supplierSj.status, status as "DRAFT" | "SHIPPED" | "RECEIVED") : undefined)
      .orderBy(sql`${supplierSj.createdAt} DESC`)
      .limit(100);

    return NextResponse.json({ data: items }, { status: 200 });
  },
  { requiredPermission: "supplier.sj.view" }
);
