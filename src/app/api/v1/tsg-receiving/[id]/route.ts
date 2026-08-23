// GET /tsg-receiving/:id — Detail receiving + daftar boks
// Mobile handoff v2.2.3 §4: ganti workaround fetch list+filter-by-id yang
// inefisien saat data >100 rows.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import {
  tsgReceiving,
  tsgReceivingBox,
  tsgSupplier,
  plant,
} from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (
    _request: Request,
    ctx: AuthContext,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params;

    const [row] = await db
      .select({
        id: tsgReceiving.id,
        receivingCode: tsgReceiving.receivingCode,
        plantId: tsgReceiving.plantId,
        plantCode: plant.code,
        supplierId: tsgReceiving.supplierId,
        supplierName: tsgSupplier.name,
        // Link balik ke Surat Jalan (mobile handoff v2.2.3 §4 minta `sjId`;
        // nama kolom aktual supplierSjId — NULL untuk receiving manual).
        supplierSjId: tsgReceiving.supplierSjId,
        supplierCode: tsgSupplier.code,
        supplierDocRef: tsgReceiving.supplierDocRef,
        receivedAt: tsgReceiving.receivedAt,
        receivedBy: tsgReceiving.receivedBy,
        totalBoxCount: tsgReceiving.totalBoxCount,
        totalWeightKg: tsgReceiving.totalWeightKg,
        source: tsgReceiving.source,
        approvalStatus: tsgReceiving.approvalStatus,
        approvedBy: tsgReceiving.approvedBy,
        approvedAt: tsgReceiving.approvedAt,
        notes: tsgReceiving.notes,
        createdAt: tsgReceiving.createdAt,
      })
      .from(tsgReceiving)
      .leftJoin(tsgSupplier, eq(tsgReceiving.supplierId, tsgSupplier.id))
      .leftJoin(plant, eq(tsgReceiving.plantId, plant.id))
      .where(eq(tsgReceiving.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json(
        {
          error: { code: "NOT_FOUND", message: "Receiving tidak ditemukan." },
          requestId: ctx.requestId,
        },
        { status: 404 }
      );
    }

    const boxes = await db
      .select({
        id: tsgReceivingBox.id,
        boxCode: tsgReceivingBox.boxCode,
        boxSeq: tsgReceivingBox.boxSeq,
        weightKg: tsgReceivingBox.weightKg,
        tsgType: tsgReceivingBox.tsgType,
        receivedAt: tsgReceivingBox.receivedAt,
      })
      .from(tsgReceivingBox)
      .where(eq(tsgReceivingBox.receivingId, id))
      .orderBy(tsgReceivingBox.boxSeq);

    return NextResponse.json({ ...row, boxes }, { status: 200 });
  },
  { requiredPermission: "tsg.receiving.view" }
);
