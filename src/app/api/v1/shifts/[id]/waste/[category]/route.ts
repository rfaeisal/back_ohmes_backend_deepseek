// PATCH /shifts/:id/waste/:category/settle — Tandai waste LUNAS
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { shiftWaste, shiftReport } from "@/db/schema";
import { ServiceError } from "@/lib/services/shift.service";
import { addRijekanEntry, deriveRijekanContextFromShift } from "@/lib/services/rijekan.service";

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
        .select({ status: shiftReport.status, plantId: shiftReport.plantId })
        .from(shiftReport)
        .where(eq(shiftReport.id, shiftId))
        .limit(1);

      if (!shift || shift.status === "RUNNING") {
        return NextResponse.json(
          { error: { code: "SHIFT_NOT_COMPLETED", message: "Shift harus COMPLETED dulu sebelum settle waste." }, requestId: ctx.requestId },
          { status: 409 }
        );
      }

      const [waste] = await db
        .select({ id: shiftWaste.id, kg: shiftWaste.kg, settlementStatus: shiftWaste.settlementStatus })
        .from(shiftWaste)
        .where(
          and(
            eq(shiftWaste.shiftReportId, shiftId),
            eq(shiftWaste.category, category as "MENIR" | "RIJEKAN" | "DEBU_KASAR" | "DEBU_HALUS")
          )
        )
        .limit(1);

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

      // Sink ledger rijekan (docs/26 §3.2): RIJEKAN & MENIR yang di-settle =
      // masuk pool (kg) dengan identitas lot (jenis + asal + order) di-derive
      // dari shift. Fire-and-forget — gagal tidak menggagalkan settle.
      if ((category === "RIJEKAN" || category === "MENIR") && waste && waste.settlementStatus !== "LUNAS") {
        void (async () => {
          const ctx = await deriveRijekanContextFromShift(shiftId);
          await addRijekanEntry({
            plantId: shift.plantId,
            entryType: category === "RIJEKAN" ? "IN_MAKER_WASTE" : "IN_MAKER_MENIR",
            quantity: Number(waste.kg),
            unit: "KG",
            refId: waste.id,
            note: `Settle waste shift ${shiftId.substring(0, 8)}...`,
            tsgType: ctx.tsgType,
            origin: ctx.origin,
            makloonOrderId: ctx.makloonOrderId,
          });
        })();
      }

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
  },
  { requiredPermission: "shift.waste.settle" }
);
