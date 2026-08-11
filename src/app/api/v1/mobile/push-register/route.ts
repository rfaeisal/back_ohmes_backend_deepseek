// POST /api/v1/mobile/push-register — Register/unregister push token
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import db from "@/db";
import { userSession } from "@/db/schema";

const schema = z.object({
  pushToken: z.string().min(1, "Push token wajib"),
  action: z.enum(["register", "unregister"]),
  sessionId: z.string().uuid().optional(),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    if (parsed.data.action === "register") {
      // Update session dengan push token
      await db
        .update(userSession)
        .set({ pushToken: parsed.data.pushToken })
        .where(
          and(
            eq(userSession.userId, ctx.user.userId),
            eq(userSession.deviceType, "MOBILE")
          )
        );
    } else {
      // Unregister: hapus push token
      await db
        .update(userSession)
        .set({ pushToken: null })
        .where(
          and(
            eq(userSession.userId, ctx.user.userId),
            eq(userSession.deviceType, "MOBILE")
          )
        );
    }

    return NextResponse.json({ success: true, action: parsed.data.action }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "PUSH_REGISTER_FAILED", message: "Gagal register push token." }, requestId: ctx.requestId },
      { status: 500 }
    );
  }
});
