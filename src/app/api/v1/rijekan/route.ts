// GET /api/v1/rijekan — overview ledger rijekan (docs/23 §5.4)
// Masuk otomatis: waste RIJEKAN settle (KG) + reject HLP (BATANG).
// Keluar (OUT_REPROSES) dicatat manual saat receiving reproses dibuat.
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getRijekanOverview } from "@/lib/services/rijekan.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const result = await getRijekanOverview(plantId, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });
