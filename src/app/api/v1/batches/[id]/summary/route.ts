// GET /api/v1/batches/:id/summary — sisa batch (docs/23 §2.4)
// Konteks pekerjaan saat ganti kru / tutup sesi HLP: batangan awal,
// terpakai, sisa estimasi (kalkulasi server-side).
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getBatchSisaSummary } from "@/lib/services/box.service";
import { ServiceError } from "@/lib/services/shift.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: batchId } = await params;
      const summary = await getBatchSisaSummary(batchId);
      return NextResponse.json(summary, { status: 200 });
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message }, requestId: _ctx.requestId },
          { status: 404 }
        );
      }
      throw err;
    }
  },
  { requiredPermission: "hlp.pack" }
);
