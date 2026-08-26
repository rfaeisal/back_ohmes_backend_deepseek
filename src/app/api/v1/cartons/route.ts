// POST /cartons — Create carton baru
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createCarton, ServiceError } from "@/lib/services/wms-outbound.service";
import { eq, desc, sql } from "drizzle-orm";
import db from "@/db";
import { carton } from "@/db/schema/wms-outbound";

const schema = z.object({
  productId: z.string().uuid(),
  capacityPack: z.number().int().min(1).max(200).default(50),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const plantId = ctx.user.plantIds[0];
    if (!plantId) {
      return NextResponse.json(
        { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
        { status: 403 }
      );
    }

    const result = await createCarton({ plantId, ...parsed.data, openedBy: ctx.user.userId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
},
  { requiredPermission: "cartoning.create" });


// GET /cartons — List karton pabrik
export const GET = withAuth(async (_request: Request, ctx: AuthContext) => {
  const plantId = ctx.user.plantIds[0];
  const items = await db
    .select({
      id: carton.id,
      plantId: carton.plantId,
      productId: carton.productId,
      code: carton.code,
      status: carton.status,
      capacityPack: carton.capacityPack,
      openedAt: carton.openedAt,
      closedAt: carton.closedAt,
      openedBy: carton.openedBy,
      // Isi karton saat ini (jumlah pack fisik) — SUM pack_qty, bukan
      // COUNT baris (1 baris = 1 batch dengan qty-nya, migrasi 0019).
      // Perhatian: kolom outer harus ditulis literal "carton"."id" — kalau
      // pakai ${carton.id}, drizzle render bare `"id"` yang resolve ke
      // cc.id (inner) → hasil selalu 0.
      packCount: sql<number>`(SELECT COALESCE(SUM(cc.pack_qty), 0) FROM carton_content cc WHERE cc.carton_id = "carton"."id")`.mapWith(Number),
    })
    .from(carton)
    .where(plantId ? eq(carton.plantId, plantId) : undefined)
    .orderBy(desc(carton.openedAt))
    .limit(100);

  return NextResponse.json({ data: items }, { status: 200 });
}, { requiredPermission: "cartoning.view" });
