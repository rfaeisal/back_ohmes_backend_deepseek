// GET /api/v1/material-out/:id/document — PDF Berita Acara Retur Material
// Berlaku untuk out_type RETUR (consumable & sparepart) — PDF asli via pdf-lib.
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getMaterialOutDetail } from "@/lib/services/material.service";
import { buildMaterialReturPdf } from "@/lib/services/material-retur-pdf.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getMaterialOutDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Material keluar tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }
    if (d.outType !== "RETUR") {
      return NextResponse.json(
        { error: { code: "NOT_RETUR", message: "Dokumen retur hanya untuk alur Retur Supplier." }, requestId: _ctx.requestId },
        { status: 400 }
      );
    }

    const pdf = await buildMaterialReturPdf({
      nomor: d.outCode,
      tanggal: new Date(d.outAt),
      returnerName: d.outByName ?? "",
      plantLabel: `${d.plantName} (${d.plantCode})`,
      supplierName: d.counterpartName,
      items: (d.items ?? []).map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
      })),
      reason: d.reason,
      notes: d.notes,
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${d.outCode}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "tsg.inventory.view" }
);
