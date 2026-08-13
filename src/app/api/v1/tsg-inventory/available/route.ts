// GET /api/v1/tsg-inventory/available — List inventory FIFO
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getAvailableInventory } from "@/lib/services/wms-inbound.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = url.searchParams.get("plantId") ?? ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const items = await getAvailableInventory(plantId, limit);

  return NextResponse.json({ data: items }, { status: 200 });
},
  { requiredPermission: "tsg.inventory.view" });
