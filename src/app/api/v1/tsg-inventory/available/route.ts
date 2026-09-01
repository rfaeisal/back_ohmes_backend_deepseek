// GET /api/v1/tsg-inventory/available — List inventory FIFO
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getAvailableInventory } from "@/lib/services/wms-inbound.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantParam = url.searchParams.get("plantId");

  let plantIds: string[];
  if (!plantParam) {
    // Default lama (konsumen tablet/API tanpa param): plant pertama scope user
    plantIds = ctx.user.plantIds[0] ? [ctx.user.plantIds[0]] : [];
  } else if (plantParam === "all") {
    // Laporan lintas pabrik (area/HQ): semua plant dalam scope user
    plantIds = ctx.user.plantIds;
  } else if (ctx.user.plantIds.includes(plantParam)) {
    plantIds = [plantParam];
  } else {
    return NextResponse.json(
      { error: { code: "PLANT_OUT_OF_SCOPE", message: "Plant di luar scope anda." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  if (plantIds.length === 0) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const limit = parseInt(url.searchParams.get("limit") ?? "20");
  const items = await getAvailableInventory(plantIds, limit);

  return NextResponse.json({ data: items }, { status: 200 });
},
  { requiredPermission: "tsg.inventory.view" });
