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

  const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [yieldTrend, wasteBenchmark, topDowntime, inventoryAge, consumption] =
    await Promise.all([
      safeQuery(() => getYieldTrend({ plantId, months }), []),
      safeQuery(() => getWasteBenchmark(from, to), {}),
      safeQuery(() => getTopDowntimeCauses(from, to, 10), []),
      safeQuery(() => getInventoryAgePanel(), { aging: [], alertThreshold: 30 }),
      safeQuery(() => getConsumptionRate(30), []),
    ]);

  return NextResponse.json({
    period: { from, to },
    yieldTrend,
    wasteBenchmark,
    topDowntime,
    inventoryAge,
    consumption,
  }, { status: 200 });
},
  { requiredPermission: "dashboard.hq.view" });
