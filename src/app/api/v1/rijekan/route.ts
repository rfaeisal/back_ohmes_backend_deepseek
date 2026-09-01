// GET + POST /api/v1/rijekan — overview ledger rijekan (docs/23 §5.4)
// Masuk otomatis: waste RIJEKAN settle (KG) + reject HLP (BATANG).
// Keluar (OUT_REPROSES) dicatat manual saat receiving reproses dibuat.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getRijekanOverview, addRijekanEntry } from "@/lib/services/rijekan.service";

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const result = await getRijekanOverview(plantId, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  return NextResponse.json(result, { status: 200 });
}, { requiredPermission: "tsg.inventory.view" });

const outSchema = z.object({
  quantity: z.number().positive(),
  unit: z.enum(["KG", "BATANG"]),
  note: z.string().max(200).optional(),
  refId: z.string().uuid().optional(),
});

// POST /rijekan — catat KELUAR reproses (manual, saat receiving reproses dibuat)
export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  void url;
  try {
    const body = await request.json();
    const parsed = outSchema.safeParse(body);
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

    await addRijekanEntry({
      plantId,
      entryType: "OUT_REPROSES",
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      refId: parsed.data.refId ?? null,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid." }, requestId: ctx.requestId },
        { status: 400 }
      );
    }
    throw err;
  }
}, { requiredPermission: "tsg.receiving.create" });
