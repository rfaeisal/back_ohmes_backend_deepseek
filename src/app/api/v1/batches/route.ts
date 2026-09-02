// GET /batches — daftar batch batangan (kode penanda bahan masuk mesin HLP)
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import db from "@/db";
import { batch } from "@/db/schema";
import { machine } from "@/db/schema/master-product";
import { withAuth } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (_request: Request) => {
    const items = await db
      .select({
        id: batch.id,
        code: batch.code,
        batanganKg: batch.batanganKg,
        machineCode: machine.code,
        source: batch.source,
        stage: batch.stage,
        targetUnit: batch.targetUnit,
        isMakloonTsg: batch.isMakloonTsg,
        makloonCustomer: batch.makloonCustomer,
        makloonTarget: batch.makloonTarget,
        createdAt: batch.createdAt,
        // Ringkasan packing — supaya UI bisa tandai batch yang sudah dicatat
        packCount: sql<number>`(SELECT COUNT(*) FROM hlp_pack hp WHERE hp.batch_id = ${batch.id})`.mapWith(Number),
        packedBatang: sql<number>`(SELECT COALESCE(SUM(hp.total_batang), 0) FROM hlp_pack hp WHERE hp.batch_id = ${batch.id})`.mapWith(Number),
      })
      .from(batch)
      .leftJoin(machine, eq(batch.machineId, machine.id))
      .orderBy(sql`${batch.createdAt} DESC`)
      .limit(100);

    return NextResponse.json({ data: items }, { status: 200 });
  },
  { requiredPermission: "hlp.pack" }
);
