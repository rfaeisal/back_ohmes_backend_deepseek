// GET + POST /api/v1/products
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { product } from "@/db/schema";

const schema = z.object({ code: z.string().min(1), brand: z.string().min(1), variant: z.string().optional() });

export const GET = withAuth(async () => {
  const items = await db.select().from(product).limit(100);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });
    const [item] = await db.insert(product).values(parsed.data).returning();
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: { code: "CREATE_FAILED", message: e.message } }, { status: 400 }); }
});

