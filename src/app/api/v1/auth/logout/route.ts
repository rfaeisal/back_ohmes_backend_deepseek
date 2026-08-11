// =============================================================================
// POST /api/v1/auth/logout
// =============================================================================
// Revoke refresh token → session dihapus.
// =============================================================================

import { NextResponse } from "next/server";
import { extractToken, revokeAllUserSessions } from "@/lib/auth";

// =============================================================================
// POST /api/v1/auth/logout
// =============================================================================

export async function POST(request: Request) {
  try {
    // Extract JWT untuk dapatkan userId
    const payload = await extractToken(request);

    if (payload) {
      await revokeAllUserSessions(
        payload.userId,
        payload.userId,
        "User logout"
      );
    }

    return NextResponse.json(
      {
        message: "Logout berhasil.",
      },
      {
        status: 200,
        headers: {
          "Clear-Site-Data": '"cookies", "storage"',
        },
      }
    );
  } catch (err) {
    console.error("Logout error:", err);
    // Logout should never fail — always return success
    return NextResponse.json(
      { message: "Logout berhasil." },
      { status: 200 }
    );
  }
}
