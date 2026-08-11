// GET + POST /api/v1/machines
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { machine } from "@/db/schema";

const schema = z.object({ plantId: z.string().uuid(), code: z.string().min(1), name: z.string().min(1), type: z.enum(["MAKER", "HLP"]) });

export const GET = withAuth(async () => {
  const items = await db.select().from(machine).where(eq(machine.isActive, true)).limit(50);
  return NextResponse.json({ data: items }, { status: 200 });
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId }, { status: 400 });
    const [item] = await db.insert(machine).values(parsed.data).returning();
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: { code: "CREATE_FAILED", message: e.message } }, { status: 400 }); }
});
