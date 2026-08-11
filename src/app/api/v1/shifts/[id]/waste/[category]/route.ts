// PATCH /shifts/:id/waste/:category/settle — Tandai waste LUNAS
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftWaste, shiftReport } from "@/db/schema";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({ settledAt: z.string().datetime().optional() });

export const PATCH = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string; category: string }> }) => {
    try {
      const { id: shiftId, category } = await params;
      const validCategories = ["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"];
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: { code: "INVALID_CATEGORY", message: `Kategori harus salah satu: ${validCategories.join(", ")}` }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const parsed = schema.safeParse(body);

      const [shift] = await db
        .select({ status: shiftReport.status })
        .from(shiftReport)
        .where(eq(shiftReport.id, shiftId))
        .limit(1);

      if (!shift || shift.status === "RUNNING") {
        return NextResponse.json(
          { error: { code: "SHIFT_NOT_COMPLETED", message: "Shift harus COMPLETED dulu sebelum settle waste." }, requestId: ctx.requestId },
          { status: 409 }
        );
      }

      await db
        .update(shiftWaste)
        .set({
          settlementStatus: "LUNAS",
          settledAt: parsed.data?.settledAt ? new Date(parsed.data.settledAt) : new Date(),
          settledBy: ctx.user.userId,
        })
        .where(
          and(
            eq(shiftWaste.shiftReportId, shiftId),
            eq(shiftWaste.category, category as "MENIR" | "RIJEKAN" | "DEBU_KASAR" | "DEBU_HALUS")
          )
        );

      return NextResponse.json({ shiftId, category, settlementStatus: "LUNAS" }, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  }
);
