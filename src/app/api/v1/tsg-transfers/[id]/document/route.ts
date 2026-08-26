// GET /api/v1/tsg-transfers/:id/document — PDF Berita Acara Serah Terima
// PDF asli (bukan halaman HTML + print) supaya tampil murni di browser.
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgTransferOut, tsgTransferOutItem, tsgReceivingBox, plant } from "@/db/schema";
import { buildBeritaAcaraPdf } from "@/lib/services/berita-acara-pdf.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const [t] = await db
      .select({
        transferCode: tsgTransferOut.transferCode,
        destinationName: tsgTransferOut.destinationName,
        sentAt: tsgTransferOut.sentAt,
        senderName: sql<string>`u.full_name`.mapWith(String),
        plantName: plant.name,
        plantCode: plant.code,
        notes: tsgTransferOut.notes,
        totalBoxCount: tsgTransferOut.totalBoxCount,
        totalWeightKg: tsgTransferOut.totalWeightKg,
      })
      .from(tsgTransferOut)
      .leftJoin(sql`"user" u`, eq(tsgTransferOut.sentBy, sql`u.id`))
      .leftJoin(plant, eq(tsgTransferOut.plantId, plant.id))
      .where(eq(tsgTransferOut.id, id))
      .limit(1);

    if (!t) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Transfer tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }

    const items = await db
      .select({
        boxCode: tsgTransferOutItem.boxCode,
        weightKg: tsgTransferOutItem.weightKg,
        tsgType: tsgReceivingBox.tsgType,
      })
      .from(tsgTransferOutItem)
      .leftJoin(tsgReceivingBox, sql`${tsgReceivingBox.boxCode} = ${tsgTransferOutItem.boxCode}`)
      .where(eq(tsgTransferOutItem.transferId, id))
      .orderBy(tsgTransferOutItem.seq);

    const pdf = await buildBeritaAcaraPdf({
      title: "BERITA ACARA SERAH TERIMA BARANG",
      nomor: t.transferCode,
      tanggal: new Date(t.sentAt),
      pihak1Label: "1. Yang Menyerahkan",
      pihak1Rows: [
        ["Nama", t.senderName ?? "..................."],
        ["Jabatan", "Staf Gudang"],
        ["Pabrik", `${t.plantName} (${t.plantCode})`],
      ],
      pihak2Label: "2. Yang Menerima",
      pihak2Rows: [
        ["Nama", "........................................"],
        ["Jabatan", "........................................"],
        ["Pabrik", t.destinationName],
      ],
      items: items.map((i) => ({ boxCode: i.boxCode, tsgType: i.tsgType, weightKg: Number(i.weightKg) })),
      totalBoxCount: t.totalBoxCount,
      totalWeightKg: Number(t.totalWeightKg),
      catatan: t.notes ?? undefined,
      penutup: "Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
      sign1Label: "Yang Menyerahkan,",
      sign1Name: t.senderName ?? "...................",
      sign2Label: "Yang Menerima,",
      sign2Name: "........................................",
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${t.transferCode}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "tsg.inventory.view" }
);
