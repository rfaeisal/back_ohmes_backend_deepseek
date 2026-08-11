// POST /api/v1/qr/resolve — Resolve QR URI (deep-link handler)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { resolveQr, ServiceError } from "@/lib/services/qr.service";

const schema = z.object({ uri: z.string().min(1, "URI wajib") });

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "URI tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const result = await resolveQr(parsed.data.uri, ctx.user.userId, ctx.user.plantIds);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 404 }
      );
    }
    throw err;
  }
});
