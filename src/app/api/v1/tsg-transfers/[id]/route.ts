// GET /api/v1/tsg-transfers/:id — Detail transfer (untuk cetak dokumen)
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgTransferOut, tsgTransferOutItem, tsgReceivingBox, plant } from "@/db/schema";

export const GET = withAuth(async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;

  const [transfer] = await db
    .select({
      id: tsgTransferOut.id,
      transferCode: tsgTransferOut.transferCode,
      destinationName: tsgTransferOut.destinationName,
      totalBoxCount: tsgTransferOut.totalBoxCount,
      totalWeightKg: tsgTransferOut.totalWeightKg,
      notes: tsgTransferOut.notes,
      sentAt: tsgTransferOut.sentAt,
      senderName: sql<string>`u.full_name`.mapWith(String),
      plantCode: plant.code,
      plantName: plant.name,
    })
    .from(tsgTransferOut)
    .leftJoin(sql`"user" u`, eq(tsgTransferOut.sentBy, sql`u.id`))
    .leftJoin(plant, eq(tsgTransferOut.plantId, plant.id))
    .where(eq(tsgTransferOut.id, id))
    .limit(1);

  if (!transfer) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Transfer tidak ditemukan." }, requestId: ctx.requestId }, { status: 404 });
  }

  const items = await db
    .select({
      id: tsgTransferOutItem.id,
      boxCode: tsgTransferOutItem.boxCode,
      weightKg: tsgTransferOutItem.weightKg,
      tsgType: tsgReceivingBox.tsgType,
    })
    .from(tsgTransferOutItem)
    .leftJoin(tsgReceivingBox, sql`${tsgReceivingBox.boxCode} = ${tsgTransferOutItem.boxCode}`)
    .where(eq(tsgTransferOutItem.transferId, id))
    .orderBy(tsgTransferOutItem.seq);

  return NextResponse.json({ ...transfer, items }, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
