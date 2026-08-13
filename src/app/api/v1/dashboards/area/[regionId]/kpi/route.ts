// GET /dashboards/area/:regionId/kpi — KPI rollup per area
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getAreaKpi } from "@/lib/services/area-dashboard.service";

export const GET = withAuth(
  async (request: Request, _ctx: AuthContext, { params }: { params: Promise<{ regionId: string }> }) => {
    const { regionId } = await params;
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? undefined;
    const kpi = await getAreaKpi(regionId, date);
    return NextResponse.json(kpi, { status: 200 });
  },
  { requiredPermission: "dashboard.area.view" }
);
