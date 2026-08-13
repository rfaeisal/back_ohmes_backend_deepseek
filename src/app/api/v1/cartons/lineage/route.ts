// GET /cartons/lineage?code=... — Traceability karton→pack→batch→shift
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getCartonLineage, ServiceError } from "@/lib/services/wms-outbound.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { error: { code: "MISSING_CODE", message: "Parameter code wajib." }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  try {
    const result = await getCartonLineage(code);
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
},
  { requiredPermission: "cartoning.view" });
