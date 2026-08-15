// GET /supplier-sj/labels/:boxCode — Resolve label hasil scan QR (untuk aplikasi petugas area)
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import { supplierSjBox, supplierSj, tsgSupplier, plant } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ boxCode: string }> }) => {
    const { boxCode } = await params;

    const [label] = await db
      .select({
        boxCode: supplierSjBox.boxCode,
        tsgType: supplierSjBox.tsgType,
        supplierWeightKg: supplierSjBox.supplierWeightKg,
        enteredAt: supplierSjBox.enteredAt,
        sjId: supplierSj.id,
        sjNumber: supplierSj.sjNumber,
        sjStatus: supplierSj.status,
        supplierName: tsgSupplier.name,
        plantCode: plant.code,
      })
      .from(supplierSjBox)
      .innerJoin(supplierSj, eq(supplierSjBox.supplierSjId, supplierSj.id))
      .innerJoin(tsgSupplier, eq(supplierSj.supplierId, tsgSupplier.id))
      .innerJoin(plant, eq(supplierSj.plantId, plant.id))
      .where(eq(supplierSjBox.boxCode, boxCode))
      .limit(1);

    if (!label) {
      return NextResponse.json({ error: { code: "LABEL_NOT_FOUND", message: "Label tidak ditemukan." } }, { status: 404 });
    }

    return NextResponse.json(label, { status: 200 });
  },
  { requiredPermission: "supplier.sj.view" }
);
