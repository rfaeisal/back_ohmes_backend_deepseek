// GET /supplier-sj/labels/:boxCode — Resolve label hasil scan QR (untuk aplikasi petugas area)
// v1.1: label pool (AVAILABLE) belum terikat SJ — field SJ nullable.
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
        labelStatus: supplierSjBox.labelStatus,
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
      .leftJoin(supplierSj, eq(supplierSjBox.supplierSjId, supplierSj.id))
      .leftJoin(tsgSupplier, eq(supplierSj.supplierId, tsgSupplier.id))
      .leftJoin(plant, eq(supplierSj.plantId, plant.id))
      .where(eq(supplierSjBox.boxCode, boxCode))
      .limit(1);

    if (!label) {
      return NextResponse.json({ error: { code: "LABEL_NOT_FOUND", message: "Label tidak ditemukan." } }, { status: 404 });
    }

    // Pool = inventaris bersama area office (migrasi 0010, SOP §3.2): petugas
    // pemegang permission supplier.sj.pool boleh resolve & memakai label pool
    // cetakan petugas lain. Visibility di-enforce RLS p_sjb_select — tanpa
    // filter createdBy di level aplikasi (dulu sempat diblokir di sini dan
    // bikin scan label cetakan petugas lain 404 di produksi).
    return NextResponse.json(label, { status: 200 });
  },
  { requiredPermission: "supplier.sj.view" }
);
