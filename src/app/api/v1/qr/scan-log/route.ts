// POST /api/v1/qr/scan-log — Log scan event
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { logScan, ServiceError } from "@/lib/services/qr.service";

const schema = z.object({
  uri: z.string().min(1),
  deviceInfo: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid." }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const result = await logScan(parsed.data.uri, ctx.user.userId, parsed.data.deviceInfo);
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
