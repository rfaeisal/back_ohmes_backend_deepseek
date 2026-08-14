// GET /dashboards/oee/:plantId — OEE calculation
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import { plant } from "@/db/schema/tenancy";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { calculateOeeAggregate } from "@/lib/services/oee.service";

export const GET = withAuth(
  async (request: Request, _ctx: AuthContext, { params }: { params: Promise<{ plantId: string }> }) => {
    const { plantId } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

    const result = await calculateOeeAggregate(plantId, from, to);

    const [plantInfo] = await db
      .select({ code: plant.code, name: plant.name })
      .from(plant)
      .where(eq(plant.id, plantId))
      .limit(1);

    return NextResponse.json(
      { ...result, plantCode: plantInfo?.code ?? plantId, plantName: plantInfo?.name ?? plantId },
      { status: 200 }
    );
  },
  { requiredPermission: "dashboard.plant.view" }
);
