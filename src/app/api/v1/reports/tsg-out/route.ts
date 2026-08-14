// GET /api/v1/reports/tsg-out — Laporan TSG Keluar (transfer + retur)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { listTsgOutReport } from "@/lib/services/wms-inbound.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined; // TRANSFER | RETUR

  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const result = await listTsgOutReport(plantId, { from, to, type });
  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
