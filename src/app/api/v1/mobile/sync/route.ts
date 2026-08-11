// POST /api/v1/mobile/sync — Mobile sync (upload offline queue)
// Flutter local queue (SQLite/Drift) → batch upload ke server.
// Setiap item dalam queue punya Idempotency-Key → server dedup.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { checkIdempotency, storeIdempotency } from "@/lib/idempotency";

const syncItemSchema = z.object({
  idempotencyKey: z.string().min(1),
  method: z.enum(["POST", "PATCH"]),
  path: z.string().min(1),
  body: z.record(z.unknown()),
  queuedAt: z.string().datetime().optional(),
});

const syncSchema = z.object({
  items: z.array(syncItemSchema).min(1).max(50),
  deviceId: z.string().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Format sync tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const results: Array<{
      idempotencyKey: string;
      status: number;
      isReplay: boolean;
    }> = [];

    for (const item of parsed.data.items) {
      // Check idempotency
      const idempotency = await checkIdempotency(
        item.idempotencyKey,
        ctx.user.userId,
        item.method,
        item.path
      );

      if (idempotency.isReplay && idempotency.cachedResponse) {
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: idempotency.cachedResponse.status,
          isReplay: true,
        });
        continue;
      }

      // Proses item (simplified — forward ke internal handler)
      // Untuk production: dispatch ke route handler sesuai path
      const status = 200; // placeholder

      // Store response untuk dedup
      await storeIdempotency(
        item.idempotencyKey,
        ctx.user.userId,
        item.method,
        item.path,
        status,
        { success: true }
      );

      results.push({
        idempotencyKey: item.idempotencyKey,
        status,
        isReplay: false,
      });
    }

    return NextResponse.json({
      processed: results.length,
      replays: results.filter((r) => r.isReplay).length,
      results,
    }, { status: 200 });
  } catch (err) {
    console.error("Mobile sync error:", err);
    return NextResponse.json(
      { error: { code: "SYNC_FAILED", message: "Gagal memproses sync." }, requestId: ctx.requestId },
      { status: 500 }
    );
  }
});
