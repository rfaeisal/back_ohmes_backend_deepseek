// POST /dispatch/orders/:id/document — Generate surat jalan PDF
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateSuratJalanDocument, ServiceError } from "@/lib/services/dispatch.service";

export const POST = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: orderId } = await params;
      const result = await generateSuratJalanDocument(orderId, ctx.user.userId);
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "dispatch.document.generate" }
);
