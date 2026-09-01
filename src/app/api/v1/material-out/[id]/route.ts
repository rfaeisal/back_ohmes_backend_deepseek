// GET /api/v1/material-out/:id — Detail material keluar (header + item)
import { NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { getMaterialOutDetail } from "@/lib/services/material.service";

export const GET = withAuth(
  async (_request: Request, _ctx: AuthContext, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const d = await getMaterialOutDetail(id);
    if (!d) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Material keluar tidak ditemukan." }, requestId: _ctx.requestId },
        { status: 404 }
      );
    }

    return NextResponse.json(d, { status: 200 });
  },
  { requiredPermission: "tsg.inventory.view" }
);
