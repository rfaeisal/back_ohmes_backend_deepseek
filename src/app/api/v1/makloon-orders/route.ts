// GET + POST /api/v1/makloon-orders — order makloon (docs/26 §2)
// GET: daftar order (filter ?status=). POST: buat order baru.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { ServiceError } from "@/lib/services/shift.service";
import {
  listMakloonOrders,
  createMakloonOrder,
} from "@/lib/services/makloon-order.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }
  const data = await listMakloonOrders(plantId, url.searchParams.get("status") ?? undefined);
  return NextResponse.json({ data }, { status: 200 });
}, { requiredPermission: "tsg.receiving.view" });

const createSchema = z.object({
  customer: z.string().min(1, "Nama pemesan wajib").max(120),
  productName: z.string().min(1, "Nama produk wajib").max(120),
  tsgType: z.enum(["REGULER", "MILD", "PUTIHAN"]),
  finalForm: z.enum(["BATANGAN", "PACK", "PACK_WRAP", "SLOP", "BAL", "CARTON_SLOP", "CARTON_BAL"]),
  inputType: z.enum(["BATANGAN", "TSG"]),
  notes: z.string().max(300).optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
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

    const order = await createMakloonOrder({
      plantId,
      customer: parsed.data.customer,
      productName: parsed.data.productName,
      tsgType: parsed.data.tsgType,
      finalForm: parsed.data.finalForm,
      inputType: parsed.data.inputType,
      notes: parsed.data.notes,
      actorUserId: ctx.user.userId,
    });
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
}, { requiredPermission: "tsg.receiving.create" });
