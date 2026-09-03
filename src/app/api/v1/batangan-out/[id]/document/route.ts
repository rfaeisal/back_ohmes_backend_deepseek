// GET /api/v1/batangan-out/:id/document — PDF Berita Acara Serah Terima
// Batangan (docs/26 §6)
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import { plant } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getBatanganOutDetail } from "@/lib/services/batangan-out.service";
import { buildBatanganOutPdf } from "@/lib/services/batangan-out-pdf.service";

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getBatanganOutDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Catatan batangan keluar tidak ditemukan." }, requestId: ctx.requestId },
        { status: 404 }
      );
    }

    const [plantRow] = await db
      .select({ name: plant.name, code: plant.code })
      .from(plant)
      .where(eq(plant.id, d.plantId))
      .limit(1);

    const pdf = await buildBatanganOutPdf({
      nomor: d.docRef || `BTO-${d.id.substring(0, 8)}`,
      tanggal: new Date(d.outAt),
      batchCode: d.batchCode,
      qtyKg: d.qtyKg,
      batangEst: d.batangEst,
      destinationType: d.destinationType,
      destinationName: d.destinationName,
      orderCode: d.orderCode,
      productName: d.productName,
      outByName: d.outByName ?? "",
      plantLabel: plantRow ? `${plantRow.name} (${plantRow.code})` : "-",
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="serah-terima-batangan-${d.batchCode ?? d.id.substring(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "tsg.inventory.view" }
);
