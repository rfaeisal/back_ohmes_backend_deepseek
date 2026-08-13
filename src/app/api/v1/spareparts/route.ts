// GET + POST /api/v1/spareparts — List & create spareparts
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { sparepart } from "@/db/schema/master-product";

const createSchema = z.object({
  code: z.string().min(1, "Kode wajib"),
  name: z.string().min(1, "Nama wajib"),
  unit: z.string().min(1, "Unit wajib").default("unit"),
});

// GET — reference data untuk dialog maintenance (auth-only)
export const GET = withAuth(async (_req: Request, _ctx: AuthContext) => {
  const items = await db
    .select({
      id: sparepart.id,
      code: sparepart.code,
      name: sparepart.name,
      unit: sparepart.unit,
    })
    .from(sparepart)
    .orderBy(sparepart.code);

  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  const [item] = await db
    .insert(sparepart)
    .values({
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
    })
    .returning();

  return NextResponse.json(item, { status: 201 });
}, { requiredPermission: "masterdata.sparepart.edit" });
