// GET /api/v1/rijekan-returns/:id/document — PDF Berita Acara Serah Terima
// Waste Makloon (docs/26 §5)
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import { plant } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getRijekanReturnDetail } from "@/lib/services/rijekan.service";
import { buildRijekanReturnPdf } from "@/lib/services/rijekan-return-pdf.service";

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getRijekanReturnDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Serah terima waste tidak ditemukan." }, requestId: ctx.requestId },
        { status: 404 }
      );
    }

    const [plantRow] = await db
      .select({ name: plant.name, code: plant.code })
      .from(plant)
      .where(eq(plant.id, d.plantId))
      .limit(1);

    const pdf = await buildRijekanReturnPdf({
      nomor: d.docRef || `RTR-${d.id.substring(0, 8)}`,
      tanggal: new Date(d.returnedAt),
      customerName: d.customer,
      orderCode: d.orderCode,
      productName: d.productName,
      items: d.items.map((i) => ({ unit: i.unit, qty: i.qty })),
      returnerName: d.returnerName ?? "",
      plantLabel: plantRow ? `${plantRow.name} (${plantRow.code})` : "-",
    });

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="serah-terima-waste-${d.customer}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "tsg.inventory.view" }
);
