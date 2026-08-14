// GET /api/v1/shifts/handoffs/unclaimed — Daftar handoff yang belum diklaim
import { NextResponse } from "next/server";
import { eq, isNull, sql } from "drizzle-orm";
import db from "@/db";
import { shiftHandoff } from "@/db/schema";
import { machine } from "@/db/schema/master-product";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  const plantId = ctx.user.plantIds[0];

  const handoffs = await db
    .select({
      id: shiftHandoff.id,
      machineId: shiftHandoff.machineId,
      machineCode: machine.code,
      machineName: machine.name,
      fromShiftId: shiftHandoff.fromShiftId,
      sisaTsgKg: shiftHandoff.sisaTsgKg,
      batanganSementaraKg: shiftHandoff.batanganSementaraKg,
      weighedAt: shiftHandoff.weighedAt,
      note: shiftHandoff.note,
    })
    .from(shiftHandoff)
    .leftJoin(machine, eq(shiftHandoff.machineId, machine.id))
    .where(
      plantId
        ? sql`${shiftHandoff.plantId} = ${plantId}::uuid AND ${shiftHandoff.claimedByShiftId} IS NULL`
        : isNull(shiftHandoff.claimedByShiftId)
    )
    .orderBy(shiftHandoff.weighedAt);

  return NextResponse.json({ data: handoffs }, { status: 200 });
}, { requiredPermission: "shift.view" });
