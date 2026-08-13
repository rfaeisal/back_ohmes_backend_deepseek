// GET /api/v1/reports/material-usage — Agregat pemakaian material/sparepart
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getMaterialUsage, type MaterialType } from "@/lib/services/material.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const materialType = (url.searchParams.get("materialType") ?? "CONSUMABLE") as MaterialType;

  const items = await getMaterialUsage({
    plantId: ctx.user.plantIds[0] ?? undefined,
    from,
    to,
    materialType,
  });

  const totalUsed = items.reduce((s, i) => s + i.totalUsed, 0);
  const totalEvents = items.reduce((s, i) => s + i.eventCount, 0);

  return NextResponse.json({
    summary: { totalItems: items.length, totalUsed: Math.round(totalUsed * 100) / 100, totalEvents },
    data: items,
  }, { status: 200 });
}, { requiredPermission: "shift.view" });