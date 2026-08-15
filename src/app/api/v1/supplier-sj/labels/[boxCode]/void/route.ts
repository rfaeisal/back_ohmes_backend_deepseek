// POST /supplier-sj/labels/:boxCode/void — Tandai label pool hilang/rusak (hanya AVAILABLE)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { voidSupplierSjLabel } from "@/lib/services/supplier-sj.service";
import { ServiceError } from "@/lib/services/shift.service";

export const POST = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ boxCode: string }> }) => {
    try {
      const { boxCode } = await params;
      const result = await voidSupplierSjLabel({
        boxCode,
        actorUserId: ctx.user.userId,
        isPrivileged: ctx.user.isPrivileged,
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
