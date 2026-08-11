// GET /api/v1/shifts — List shift dengan filter
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { listShifts } from "@/lib/services/shift.service";

export const GET = withAuth(async (request: Request, _ctx: AuthContext) => {
  const url = new URL(request.url);
  const result = await listShifts({
    plantId: url.searchParams.get("plantId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: parseInt(url.searchParams.get("limit") ?? "50"),
  });

  return NextResponse.json(result, { status: 200 });
});
