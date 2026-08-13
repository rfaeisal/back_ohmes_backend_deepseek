// GET /dashboards/hq/kpi — KPI rollup se-company (semua region)
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { getHqRollup } from "@/lib/services/area-dashboard.service";

export const GET = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;
  const kpi = await getHqRollup(date);
  return NextResponse.json(kpi, { status: 200 });
},
  { requiredPermission: "dashboard.hq.view" });
