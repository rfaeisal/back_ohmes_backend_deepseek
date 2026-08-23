// POST /api/v1/mobile/sync — Mobile sync (upload offline queue)
// Mobile app (Flutter/drift) enqueue mutasi offline (SJ weigh/ship/void,
// receiving from-sj/approve) → flush ke server via batch POST. Server
// dedup per item via body `idempotencyKey`, execute handler internal,
// return per-item status + body.
//
// Kontrak: docs mobile BACKEND_HANDOFF.md §2 + docs/13-offline-queue.md.
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { checkIdempotency, storeIdempotency } from "@/lib/idempotency";
import { dispatchSyncItem } from "@/lib/services/mobile-sync-dispatch";

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

interface SyncResult {
  idempotencyKey: string;
  status: number;
  body: unknown;
  alreadyApplied: boolean;
}

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Format sync tidak valid.",
            details: parsed.error.flatten(),
          },
          requestId: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const results: SyncResult[] = [];

    // Sequential — offline queue mobile sudah urut kausal (weigh sebelum ship
    // sebelum receive). Parallel akan memicu race condition di service layer.
    for (const item of parsed.data.items) {
      // 1) Dedup by idempotencyKey (body field, bukan header)
      const dedup = await checkIdempotency(
        item.idempotencyKey,
        ctx.user.userId,
        item.method,
        item.path
      );

      if (dedup.isReplay && dedup.cachedResponse) {
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: dedup.cachedResponse.status,
          body: dedup.cachedResponse.body,
          alreadyApplied: true,
        });
        continue;
      }

      // 2) Dispatch ke handler internal
      let dispatched;
      try {
        dispatched = await dispatchSyncItem({
          method: item.method,
          path: item.path,
          body: item.body,
          parentRequest: request,
        });
      } catch (err) {
        console.error(
          `Mobile sync dispatch error [${item.method} ${item.path}]:`,
          err
        );
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: 500,
          body: {
            error: {
              code: "DISPATCH_FAILED",
              message: "Gagal eksekusi item sync.",
            },
          },
          alreadyApplied: false,
        });
        continue;
      }

      // 3) Cache response HANYA untuk hasil sukses/definitive (2xx/4xx).
      // 5xx = transient, biarkan mobile retry dgn key sama tanpa "alreadyApplied".
      if (dispatched.status < 500) {
        await storeIdempotency(
          item.idempotencyKey,
          ctx.user.userId,
          item.method,
          item.path,
          dispatched.status,
          dispatched.body
        );
      }

      results.push({
        idempotencyKey: item.idempotencyKey,
        status: dispatched.status,
        body: dispatched.body,
        alreadyApplied: false,
      });
    }

    return NextResponse.json(
      {
        processed: results.length,
        replays: results.filter((r) => r.alreadyApplied).length,
        results,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Mobile sync error:", err);
    return NextResponse.json(
      {
        error: {
          code: "SYNC_FAILED",
          message: "Gagal memproses sync.",
        },
        requestId: ctx.requestId,
      },
      { status: 500 }
    );
  }
});
