// GET /dashboards/oee/:plantId — OEE calculation
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { calculateOeeAggregate } from "@/lib/services/oee.service";

export const GET = withAuth(
  async (request: Request, _ctx: AuthContext, { params }: { params: Promise<{ plantId: string }> }) => {
    const { plantId } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

    const result = await calculateOeeAggregate(plantId, from, to);
    return NextResponse.json(result, { status: 200 });
  }
);
