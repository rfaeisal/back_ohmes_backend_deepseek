// GET /api/v1/tsg-returns/:id/document — PDF Berita Acara Retur
// PDF asli (bukan halaman HTML + print) supaya tampil murni di browser.
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getTsgReturnDetail } from "@/lib/services/wms-inbound.service";
import { buildBeritaAcaraPdf } from "@/lib/services/berita-acara-pdf.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getTsgReturnDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Retur tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }

    const pdf = await buildBeritaAcaraPdf({
      title: "BERITA ACARA RETUR BARANG",
      nomor: d.returnCode,
      tanggal: new Date(d.returnedAt),
      pihak1Label: "1. Yang Meretur",
      pihak1Rows: [
        ["Nama", d.returnerName ?? "..................."],
        ["Jabatan", "Staf Gudang"],
        ["Pabrik", `${d.plantName} (${d.plantCode})`],
      ],
      pihak2Label: "2. Supplier",
      pihak2Rows: [
        ["Nama", `${d.supplierName} (${d.supplierCode})`],
        ["Alamat", d.supplierAddress ?? "........................................"],
      ],
      items: (d.items ?? []).map((i: any) => ({ boxCode: i.boxCode, tsgType: i.tsgType, weightKg: Number(i.weightKg), supplierName: i.supplierName })),
      totalBoxCount: d.totalBoxCount,
      totalWeightKg: Number(d.totalWeightKg),
      catatan: d.reason ?? d.notes ?? undefined,
      withSupplierColumn: true,
      penutup: "Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.",
      sign1Label: "Yang Meretur,",
      sign1Name: d.returnerName ?? "...................",
      sign2Label: "Pihak Supplier,",
      sign2Name: "........................................",
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${d.returnCode}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "tsg.inventory.view" }
);
