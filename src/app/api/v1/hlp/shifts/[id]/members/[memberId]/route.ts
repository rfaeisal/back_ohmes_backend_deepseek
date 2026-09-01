// PATCH /api/v1/hlp/shifts/:id/members/:memberId — lepas anggota dari sesi
// (leftAt) — sesi tetap terbuka, hitungan pack tidak terpengaruh.
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { leaveHlpShiftMember } from "@/lib/services/hlp-session.service";
import { ServiceError } from "@/lib/services/shift.service";

export const PATCH = withAuth(
  async (_request: Request, ctx: AuthContext, { params }: { params: Promise<{ id: string; memberId: string }> }) => {
    try {
      const { memberId } = await params;
      const member = await leaveHlpShiftMember(memberId, ctx.user.userId);
      return NextResponse.json(member, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: ctx.requestId },
          { status: 409 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "hlp.pack" }
);
