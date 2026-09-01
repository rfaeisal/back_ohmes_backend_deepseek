// POST + GET /api/v1/tsg-receiving — Terima & lihat TSG dari supplier
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgReceiving, tsgSupplier } from "@/db/schema";
import { createReceiving } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const receivingSchema = z.object({
  supplierId: z.string().uuid(),
  supplierDocRef: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
  locationCode: z.string().optional(),
  boxes: z
    .array(
      z.object({
        boxCode: z.string().min(1, "Kode boks wajib"),
        weightKg: z.number().min(0.01).max(100),
        tsgType: z.enum(["REGULER", "MILD", "PUTIHAN"]).optional().default("REGULER"),
      })
    )
    .min(1, "Minimal 1 boks"),
  notes: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = receivingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const plantId = ctx.user.plantIds[0];
    if (!plantId) {
      return NextResponse.json(
        { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const result = await createReceiving({
      plantId,
      ...parsed.data,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
      receivedBy: ctx.user.userId,
      locationCode: parsed.data.locationCode,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
},
  { requiredPermission: "tsg.receiving.create" });

// GET /api/v1/tsg-receiving — List receiving dengan filter
export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const includeBoxes = url.searchParams.get("includeBoxes") === "true";
  const plantId = ctx.user.plantIds[0];
  const conditions: any[] = [];
  if (plantId) conditions.push(eq(tsgReceiving.plantId, plantId));
  if (from) conditions.push(gte(tsgReceiving.receivedAt, new Date(from)));
  if (to) conditions.push(lte(tsgReceiving.receivedAt, new Date(to + "T23:59:59.999Z")));

  let query = db.select({
      id: tsgReceiving.id,
      receivingCode: tsgReceiving.receivingCode,
      supplierId: tsgReceiving.supplierId,
      receivedAt: tsgReceiving.receivedAt,
      receivedBy: tsgReceiving.receivedBy,
      totalBoxCount: tsgReceiving.totalBoxCount,
      totalWeightKg: tsgReceiving.totalWeightKg,
      supplierDocRef: tsgReceiving.supplierDocRef,
      source: tsgReceiving.source,
      approvalStatus: tsgReceiving.approvalStatus,
      rejectionReason: tsgReceiving.rejectionReason,
      rejectedAt: tsgReceiving.rejectedAt,
      notes: tsgReceiving.notes,
      supplierName: tsgSupplier.name,
      supplierCode: tsgSupplier.code,
    })
    .from(tsgReceiving)
    .leftJoin(tsgSupplier, eq(tsgReceiving.supplierId, tsgSupplier.id))
    .orderBy(desc(tsgReceiving.receivedAt))
    .limit(200);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const items = await query;

  // Optionally include box details with tsgType
  if (includeBoxes) {
    const { tsgReceivingBox: tsgRb } = await import("@/db/schema/wms-inbound");
    for (const item of items) {
      const boxes = await db
        .select({ id: tsgRb.id, boxCode: tsgRb.boxCode, weightKg: tsgRb.weightKg, tsgType: tsgRb.tsgType, boxSeq: tsgRb.boxSeq })
        .from(tsgRb)
        .where(eq(tsgRb.receivingId, item.id))
        .orderBy(tsgRb.boxSeq);
      (item as any).boxes = boxes;
    }
  }

  return NextResponse.json({ data: items }, { status: 200 });
},
  { requiredPermission: "tsg.receiving.view" });
