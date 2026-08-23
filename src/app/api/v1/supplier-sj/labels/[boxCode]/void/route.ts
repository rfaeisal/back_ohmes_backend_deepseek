// POST /supplier-sj/labels/:boxCode/void — Tandai label pool hilang/rusak (hanya AVAILABLE)
// Body opsional: { reason?: string } — dicatat ke supplier_sj_box.void_reason
// untuk audit (mobile handoff v2.2.3 §5).
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { voidSupplierSjLabel } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

const schema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const POST = withAuth(
  async (request: Request, ctx: AuthContext, { params }: { params: Promise<{ boxCode: string }> }) => {
    try {
      const { boxCode } = await params;

      // Body opsional — kalau kosong (mobile lama / retry), tetap terima.
      let reason: string | undefined;
      try {
        const raw = await request.text();
        if (raw) {
          const parsed = schema.safeParse(JSON.parse(raw));
          if (!parsed.success) {
            return NextResponse.json(
              {
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Input tidak valid.",
                  details: parsed.error.flatten(),
                },
                requestId: ctx.requestId,
              },
              { status: 400 }
            );
          }
          reason = parsed.data.reason;
        }
      } catch {
        // Body bukan JSON valid — perlakukan sebagai kosong.
      }

      const result = await voidSupplierSjLabel({
        boxCode,
        actorUserId: ctx.user.userId,
        isPrivileged: ctx.user.isPrivileged,
        reason,
      });
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: { code: err.code, message: err.message }, requestId: ctx.requestId }, { status: 409 });
      }
      throw err;
    }
  },
  { requiredPermission: "supplier.sj.label" }
);
