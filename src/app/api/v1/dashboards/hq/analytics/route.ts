// GET /dashboards/hq/analytics — HQ analytics dashboard
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import {
  getYieldTrend,
  getWasteBenchmark,
  getTopDowntimeCauses,
  getInventoryAgePanel,
  getConsumptionRate,
} from "@/lib/services/analytics.service";

export const GET = withAuth(async (request: Request) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const plantId = url.searchParams.get("plantId") ?? undefined;
  const months = parseInt(url.searchParams.get("months") ?? "6");

  const [yieldTrend, wasteBenchmark, topDowntime, inventoryAge, consumption] =
    await Promise.all([
      getYieldTrend({ plantId, months }),
      getWasteBenchmark(from, to),
      getTopDowntimeCauses(from, to, 10),
      getInventoryAgePanel(),
      getConsumptionRate(30),
    ]);

  return NextResponse.json({
    period: { from, to },
    yieldTrend,
    wasteBenchmark,
    topDowntime,
    inventoryAge,
    consumption,
  }, { status: 200 });
});
