// GET /api/v1/notifications — Notifikasi untuk supervisor
import { NextResponse } from "next/server";
import { eq, and, lt } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftReport } from "@/db/schema";

export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  // Cari shift COMPLETED > 2 jam di plant scope user
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const pendingShifts = await db
    .select({
      id: shiftReport.id,
      plantId: shiftReport.plantId,
      machineId: shiftReport.machineId,
      reportDate: shiftReport.reportDate,
      actualEnd: shiftReport.actualEnd,
      status: shiftReport.status,
    })
    .from(shiftReport)
    .where(
      and(
        eq(shiftReport.status, "COMPLETED"),
        lt(shiftReport.actualEnd, twoHoursAgo)
      )
    )
    .limit(20);

  const filtered = pendingShifts.filter((s) =>
    ctx.user.plantIds.includes(s.plantId)
  );

  return NextResponse.json({
    data: filtered.map((s) => ({
      shiftId: s.id,
      plantId: s.plantId,
      machineId: s.machineId,
      reportDate: s.reportDate,
      endedAt: s.actualEnd,
      pendingHours: Math.round(
        (Date.now() - new Date(s.actualEnd!).getTime()) / (1000 * 60 * 60)
      ),
    })),
    total: filtered.length,
  }, { status: 200 });
});
