// GET /api/v1/super/security-log — Security events (SUPERADMIN only)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getSecurityLog } from "@/lib/services/superadmin.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  if (!ctx.user.isPrivileged) {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Hanya SUPERADMIN." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const result = await getSecurityLog({
    limit: parseInt(url.searchParams.get("limit") ?? "50"),
  });

  return NextResponse.json(result, { status: 200 });
},
  { allowBypassRls: true,
  requiredPermission: "super.audit.security" });
