// GET /hlp/packs — riwayat packing HLP (batch batangan yang sudah diproses)
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import db from "@/db";
import { hlpPack, batch } from "@/db/schema";
import { machine } from "@/db/schema/master-product";
import { withAuth } from "@/lib/auth/middleware";

export const GET = withAuth(async () => {
  const items = await db
    .select({
      id: hlpPack.id,
      batchCode: batch.code,
      batanganKg: batch.batanganKg,
      hlpMachineCode: machine.code,
      packsLolos: hlpPack.packsLolos,
      isiPerPack: hlpPack.isiPerPack,
      rejectBatangan: hlpPack.rejectBatangan,
      rejectPacks: hlpPack.rejectPacks,
      rejectReason: hlpPack.rejectReason,
      hlpShiftId: hlpPack.hlpShiftId,
      totalBatang: hlpPack.totalBatang,
      beratPerBatangGram: hlpPack.beratPerBatangGram,
      packedAt: hlpPack.packedAt,
      // Pack yang sudah dialokasikan ke karton (migrasi 0019).
      // Outer column harus literal "hlp_pack"."id" — ${hlpPack.id} render
      // bare "id" yang resolve ke cc.id → selalu 0.
      usedPackQty: sql<number>`(SELECT COALESCE(SUM(cc.pack_qty), 0) FROM carton_content cc WHERE cc.hlp_pack_id = "hlp_pack"."id")`.mapWith(Number),
    })
    .from(hlpPack)
    .innerJoin(batch, eq(hlpPack.batchId, batch.id))
    .leftJoin(machine, eq(hlpPack.hlpMachineId, machine.id))
    .orderBy(sql`${hlpPack.packedAt} DESC`)
    .limit(50);

  return NextResponse.json({ data: items }, { status: 200 });
},
  { requiredPermission: "hlp.pack" });
