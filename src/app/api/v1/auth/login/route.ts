// =============================================================================
// POST /api/v1/auth/login
// =============================================================================
// Login dengan JWT + refresh token + single-session mobile enforcement.
// SUPERADMIN wajib 2FA (OTP via Twilio/TOTP).
// =============================================================================

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import db from "@/db";
import { user, role, userAssignment } from "@/db/schema/identity";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyPassword,
  hashRefreshToken,
  getAccessTokenTtl,
  getRefreshTokenTtlDays,
  createSession,
  resolveScope,
  SessionExistsError,
  type JwtPayload,
  type ResolvedScope,
} from "@/lib/auth";
import { isNull } from "drizzle-orm";

// =============================================================================
// Validation Schema
// =============================================================================

const loginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
  otp: z.string().optional(), // wajib untuk SUPERADMIN di production
  deviceType: z.enum(["MOBILE", "WEB"]),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

// =============================================================================
// POST /api/v1/auth/login
// =============================================================================

export async function POST(request: Request) {
  const requestId =
    request.headers.get("X-Request-Id") ||
    `req_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Input tidak valid.",
            details: parsed.error.flatten(),
          },
          requestId,
        },
        { status: 400 }
      );
    }

    const {
      username,
      password,
      otp: _otp,
      deviceType,
      deviceId,
      deviceName,
    } = parsed.data;

    // -----------------------------------------------------------------------
    // 1. Cari user aktif
    // -----------------------------------------------------------------------
    const [foundUser] = await db
      .select()
      .from(user)
      .where(and(eq(user.username, username), eq(user.isActive, true)))
      .limit(1);

    if (!foundUser) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Username atau password salah.",
          },
          requestId,
        },
        { status: 401 }
      );
    }

    // -----------------------------------------------------------------------
    // 2. Verifikasi password (bcrypt)
    // -----------------------------------------------------------------------
    const passwordValid = await verifyPassword(
      password,
      foundUser.passwordHash
    );
    if (!passwordValid) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Username atau password salah.",
          },
          requestId,
        },
        { status: 401 }
      );
    }

    // -----------------------------------------------------------------------
    // 3. 2FA check (SUPERADMIN)
    // -----------------------------------------------------------------------
    // Cek role user — kalau isPrivileged, wajib OTP
    const userRoles = await db
      .select({
        roleCode: role.code,
        isPrivileged: role.isPrivileged,
      })
      .from(userAssignment)
      .innerJoin(role, eq(userAssignment.roleId, role.id))
      .where(
        and(
          eq(userAssignment.userId, foundUser.id),
          isNull(userAssignment.revokedAt)
        )
      );

    const isSuperadmin = userRoles.some((r) => r.isPrivileged);

    if (isSuperadmin) {
      const otp = _otp;
      if (!otp) {
        return NextResponse.json(
          {
            error: {
              code: "OTP_REQUIRED",
              message:
                "Verifikasi 2FA diperlukan untuk akun Super Admin.",
            },
            requestId,
          },
          { status: 401 }
        );
      }

      // Dev: OTP "000000" valid untuk development
      if (process.env.NEXT_PUBLIC_APP_ENV === "development" && otp === "000000") {
        // Allow dummy OTP
      } else {
        // TODO: Verifikasi OTP via Twilio / TOTP
        return NextResponse.json(
          {
            error: {
              code: "OTP_INVALID",
              message: "Kode OTP tidak valid.",
            },
            requestId,
          },
          { status: 401 }
        );
      }
    }

    // -----------------------------------------------------------------------
    // 4. Resolve scope dari user_assignment
    // -----------------------------------------------------------------------
    let resolvedScope: ResolvedScope;
    try {
      resolvedScope = await resolveScope(foundUser.id);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "NO_ASSIGNMENT",
            message:
              "Akun Anda belum memiliki role. Hubungi administrator.",
          },
          requestId,
        },
        { status: 403 }
      );
    }

    // -----------------------------------------------------------------------
    // 5. Build JWT payload
    // -----------------------------------------------------------------------
    const jwtPayload: JwtPayload = {
      userId: foundUser.id,
      activeScopeType: resolvedScope.activeScopeType,
      activeScopeId: resolvedScope.activeScopeId,
      roleIds: resolvedScope.roleIds,
      plantIds: resolvedScope.plantIds,
      isPrivileged: resolvedScope.isPrivileged,
    };

    // -----------------------------------------------------------------------
    // 6. Generate tokens
    // -----------------------------------------------------------------------
    const accessTokenTtl = getAccessTokenTtl(isSuperadmin);
    const refreshTokenTtlDays = getRefreshTokenTtlDays(isSuperadmin);

    const accessToken = await generateAccessToken(jwtPayload, accessTokenTtl);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await hashRefreshToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshTokenTtlDays);

    // -----------------------------------------------------------------------
    // 7. Create session (dengan single-session mobile enforcement)
    // -----------------------------------------------------------------------
    try {
      await createSession({
        userId: foundUser.id,
        refreshTokenHash,
        activeScopeType: resolvedScope.activeScopeType,
        activeScopeId: resolvedScope.activeScopeId,
        deviceType,
        deviceId,
        deviceName,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "127.0.0.1",
        userAgent: request.headers.get("user-agent") || undefined,
        expiresAt,
      });
    } catch (err) {
      if (err instanceof SessionExistsError) {
        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              details: { activeSession: err.activeSession },
            },
            requestId,
          },
          { status: 409 }
        );
      }
      throw err;
    }

    // -----------------------------------------------------------------------
    // 8. Response
    // -----------------------------------------------------------------------
    return NextResponse.json(
      {
        accessToken,
        refreshToken,
        expiresIn: accessTokenTtl * 60,
        user: {
          id: foundUser.id,
          fullName: foundUser.fullName,
          username: foundUser.username,
          isPrivileged: isSuperadmin,
        },
        roles: userRoles.map((r) => ({ code: r.roleCode, isPrivileged: r.isPrivileged })),
        assignments: resolvedScope.assignments,
        activeScope: {
          scopeType: resolvedScope.activeScopeType,
          scopeId: resolvedScope.activeScopeId,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Terjadi kesalahan internal.",
        },
        requestId,
      },
      { status: 500 }
    );
  }
}
