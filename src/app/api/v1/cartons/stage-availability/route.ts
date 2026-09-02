// GET /cartons/stage-availability?stage=WR|SLOP|BAL — sisa output stage per
// batch yang bisa dikartonkan (Σout(stage) − Σin(stage berikutnya) − dialokasikan)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getStageAvailability, type ChainStage } from "@/lib/services/wms-outbound.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("stage");
  if (raw != null) {
    const parsed = z.enum(["WR", "SLOP", "BAL"]).safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "stage harus WR|SLOP|BAL." }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
  }

  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const data = await getStageAvailability(plantId, (raw as ChainStage | null) ?? undefined);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "cartoning.view" });
