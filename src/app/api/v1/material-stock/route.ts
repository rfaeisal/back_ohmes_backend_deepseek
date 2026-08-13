// GET /api/v1/material-stock — Stok material computed (masuk − terpakai)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getMaterialStock, type MaterialType } from "@/lib/services/material.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const materialType = (url.searchParams.get("materialType") ?? "CONSUMABLE") as MaterialType;
  const plantId = url.searchParams.get("plantId") ?? ctx.user.plantIds[0];

  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const items = await getMaterialStock(plantId, materialType);
  return NextResponse.json({ data: items }, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });