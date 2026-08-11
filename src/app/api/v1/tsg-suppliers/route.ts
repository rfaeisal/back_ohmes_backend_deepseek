// GET + POST /api/v1/tsg-suppliers
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { tsgSupplier } from "@/db/schema";

const schema = z.object({ code: z.string().min(1), name: z.string().min(1), contactPerson: z.string().optional(), contactPhone: z.string().optional(), address: z.string().optional() });

export const GET = withAuth(async () => {
  const items = await db.select().from(tsgSupplier).orderBy(tsgSupplier.name).limit(100);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });
    const [item] = await db.insert(tsgSupplier).values(parsed.data).returning();
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: { code: "CREATE_FAILED", message: e.message } }, { status: 400 }); }
});

