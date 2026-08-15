// POST /supplier-sj/pool — Generate pool label generik (WEB area office)
// GET  /supplier-sj/pool — Overview sisa pool (available/assigned/voided)
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import db from "@/db";
import { supplierSjBox } from "@/db/schema";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generatePoolLabels } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

const createSchema = z.object({
  count: z.number().int().min(1).max(500),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext) => {
    try {
      const body = await request.json();
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
          { status: 400 }
        );
      }

      const result = await generatePoolLabels({
        count: parsed.data.count,
        actorUserId: ctx.user.userId,
      });

      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.pool" }
);

export const GET = withAuth(
  async (_request: Request, ctx: AuthContext) => {
    // SUPERADMIN (isPrivileged) melihat pool semua petugas; lainnya cuma miliknya
    const rows = await db
      .select({
        labelStatus: supplierSjBox.labelStatus,
        createdAt: supplierSjBox.createdAt,
      })
      .from(supplierSjBox)
      .where(
        and(
          ...(ctx.user.isPrivileged ? [] : [eq(supplierSjBox.createdBy, ctx.user.userId)]),
          isNull(supplierSjBox.deletedAt)
        )
      );

    let available = 0;
    let assigned = 0;
    let voided = 0;
    const byPrintDate = new Map<string, number>();
    for (const r of rows) {
      if (r.labelStatus === "AVAILABLE") {
        available += 1;
        const date = r.createdAt.toISOString().slice(0, 10);
        byPrintDate.set(date, (byPrintDate.get(date) ?? 0) + 1);
      } else if (r.labelStatus === "ASSIGNED") assigned += 1;
      else if (r.labelStatus === "VOID") voided += 1;
    }

    return NextResponse.json(
      {
        data: {
          available,
          assigned,
          voided,
          byPrintDate: Array.from(byPrintDate.entries())
            .map(([date, count]) => ({ date, available: count }))
            .sort((a, b) => b.date.localeCompare(a.date)),
        },
      },
      { status: 200 }
    );
  },
  { requiredPermission: "supplier.sj.pool" }
);
