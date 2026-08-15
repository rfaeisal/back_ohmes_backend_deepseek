// GET   /supplier-sj/:id — Detail SJ + daftar label/boks
// PATCH /supplier-sj/:id — Ubah status (DRAFT → SHIPPED saat truk berangkat)
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import db from "@/db";
import { supplierSj, supplierSjBox, tsgSupplier, plant } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { markSupplierSjShipped } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const [sj] = await db
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
        .where(eq(supplierSj.id, id))
        .limit(1);

      if (!sj) {
        return NextResponse.json({ error: { code: "SJ_NOT_FOUND", message: "Surat jalan tidak ditemukan." } }, { status: 404 });
      }

      const boxes = await db
        .select({
          id: supplierSjBox.id,
          boxCode: supplierSjBox.boxCode,
          tsgType: supplierSjBox.tsgType,
          supplierWeightKg: supplierSjBox.supplierWeightKg,
          enteredAt: supplierSjBox.enteredAt,
        })
        .from(supplierSjBox)
        .where(eq(supplierSjBox.supplierSjId, id));

      return NextResponse.json({ ...sj, boxes }, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.view" }
);

const patchSchema = z.object({ status: z.enum(["SHIPPED"]) });

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const parsed = patchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      if (parsed.data.status === "SHIPPED") {
        const result = await markSupplierSjShipped(id, ctx.user.userId);
        return NextResponse.json(result, { status: 200 });
      }
      return NextResponse.json({ error: { code: "INVALID_STATUS", message: "Status tidak didukung." }, requestId: ctx.requestId }, { status: 400 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.create" }
);
