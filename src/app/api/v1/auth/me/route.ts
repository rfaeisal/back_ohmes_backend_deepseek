// GET /api/v1/auth/me — Return user info dari JWT
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { extractToken } from "@/lib/auth/middleware";
import db from "@/db";
import { user } from "@/db/schema/identity";

export async function GET(request: Request) {
  const requestId = request.headers.get("X-Request-Id") ?? `req_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const payload = await extractToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Token tidak ditemukan." }, requestId },
        { status: 401 }
      );
    }

    // Fetch user dari DB
    const [foundUser] = await db
      .select({
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, payload.userId))
      .limit(1);

    if (!foundUser) {
      return NextResponse.json(
        { error: { code: "USER_NOT_FOUND", message: "User tidak ditemukan." }, requestId },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        id: foundUser.id,
        fullName: foundUser.fullName,
        username: foundUser.username,
        email: foundUser.email,
      },
      activeScope: {
        scopeType: payload.activeScopeType,
        scopeId: payload.activeScopeId,
      },
      isPrivileged: payload.isPrivileged,
      plantIds: payload.plantIds,
    }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal." }, requestId },
      { status: 500 }
    );
  }
}
