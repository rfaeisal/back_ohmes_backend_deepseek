// GET /api/v1/external-pack-outs/:id/document — PDF Berita Acara Serah
// Terima Pack Makloon (docs/24 §3.3)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getExternalPackOutDetail } from "@/lib/services/makloon.service";
import { buildMakloonSerahTerimaPdf } from "@/lib/services/makloon-serah-terima-pdf.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getExternalPackOutDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Keluaran makloon tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }

    const pdf = await buildMakloonSerahTerimaPdf({
      nomor: d.docRef || `MPO-${d.id.substring(0, 8)}`,
      tanggal: new Date(d.outAt),
      batchCode: d.batchCode,
      batanganKg: Number(d.batanganKg ?? 0),
      customerName: d.destinationName,
      docRef: d.docRef,
      packQty: d.packQty,
      rejectPackQty: d.rejectPackQty,
      rejectBatangQty: d.rejectBatangQty,
      returnerName: d.outByName ?? "",
      plantLabel: `${d.plantName} (${d.plantCode})`,
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="serah-terima-${d.batchCode}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "cartoning.view" }
);
