import { NextResponse } from "next/server";

// =============================================================================
// GET /api/v1/auth/me — return info user dari JWT
// =============================================================================

export async function GET() {
  // TODO: Extract user dari JWT (middleware auth)
  // Untuk sekarang, placeholder
  return NextResponse.json({
    user: {
      id: "placeholder",
      fullName: "Auth middleware not yet implemented",
      username: "placeholder",
    },
  });
}
