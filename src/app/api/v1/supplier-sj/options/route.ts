// GET /supplier-sj/options — Opsi pembuatan SJ: daftar supplier aktif + pabrik dalam scope
import { NextResponse } from "next/server";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import db from "@/db";
import { tsgSupplier } from "@/db/schema";
import { plant } from "@/db/schema/tenancy";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext) => {
    const suppliers = await db
      .select({ id: tsgSupplier.id, code: tsgSupplier.code, name: tsgSupplier.name })
      .from(tsgSupplier)
      .where(and(eq(tsgSupplier.isActive, true), isNull(tsgSupplier.deletedAt)))
      .orderBy(sql`${tsgSupplier.name} ASC`);

    // Pabrik hanya yang ada di scope user
    const plants = ctx.user.plantIds.length > 0
      ? await db
          .select({ id: plant.id, code: plant.code, name: plant.name })
          .from(plant)
          .where(inArray(plant.id, ctx.user.plantIds))
          .orderBy(sql`${plant.code} ASC`)
      : [];

    return NextResponse.json({ data: { suppliers, plants } }, { status: 200 });
  },
  { requiredPermission: "supplier.sj.create" }
);
