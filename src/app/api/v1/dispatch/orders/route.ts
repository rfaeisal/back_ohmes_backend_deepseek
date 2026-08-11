// POST /dispatch/orders — Create dispatch order + GET list
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { dispatchOrder } from "@/db/schema/dispatch";
import { createDispatchOrder, ServiceError } from "@/lib/services/dispatch.service";

const schema = z.object({
  customerName: z.string().min(1),
  customerAddress: z.string().min(1),
  customerContact: z.string().optional(),
  driverName: z.string().optional(),
  vehicleNo: z.string().optional(),
  cartonIds: z.array(z.string().uuid()).min(1),
  notes: z.string().optional(),
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

    const result = await createDispatchOrder({ plantId, ...parsed.data, createdBy: ctx.user.userId });
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
});

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = url.searchParams.get("plantId") ?? ctx.user.plantIds[0];

  const orders = await db
    .select()
    .from(dispatchOrder)
    .where(eq(dispatchOrder.plantId, plantId!))
    .orderBy(desc(dispatchOrder.createdAt))
    .limit(50);

  return NextResponse.json({ data: orders }, { status: 200 });
});
