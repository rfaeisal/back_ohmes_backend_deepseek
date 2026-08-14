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
        createdAt: batch.createdAt,
      })
      .from(batch)
      .leftJoin(machine, eq(batch.machineId, machine.id))
      .orderBy(sql`${batch.createdAt} DESC`)
      .limit(100);

    return NextResponse.json({ data: items }, { status: 200 });
  },
  { requiredPermission: "hlp.pack" }
);
