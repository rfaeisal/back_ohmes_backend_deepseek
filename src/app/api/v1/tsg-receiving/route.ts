// POST /api/v1/tsg-receiving — Terima TSG dari supplier
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { createReceiving } from "@/lib/services/wms-inbound.service";
import { ServiceError } from "@/lib/services/shift.service";

const receivingSchema = z.object({
  supplierId: z.string().uuid(),
  supplierDocRef: z.string().optional(),
  receivedAt: z.string().datetime().optional(), // default now
  boxes: z
    .array(
      z.object({
        boxCode: z.string().min(1, "Kode boks wajib"),
        weightKg: z.number().min(0.01).max(100),
      })
    )
    .min(1, "Minimal 1 boks"),
  notes: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = receivingSchema.safeParse(body);

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

    const result = await createReceiving({
      plantId,
      ...parsed.data,
      receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
      receivedBy: ctx.user.userId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
});
