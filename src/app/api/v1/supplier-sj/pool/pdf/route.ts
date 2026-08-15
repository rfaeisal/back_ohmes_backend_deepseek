// POST /supplier-sj/pool/pdf — Download PDF multi-halaman label pool (1 label = 1 halaman 100×75mm)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { buildPoolLabelPdf } from "@/lib/services/pool-label-pdf.service";

const schema = z.object({
  boxCodes: z.array(z.string().min(1).max(50)).min(1).max(500),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext) => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const pdf = await buildPoolLabelPdf(parsed.data.boxCodes);
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    // TS strict: Uint8Array<ArrayBufferLike> tidak cocok dengan BodyInit (ArrayBuffer)
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pool-label-${datePart}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "supplier.sj.pool" }
);
