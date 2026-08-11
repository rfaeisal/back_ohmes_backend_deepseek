// POST /api/v1/admin/onboard-plant — Onboarding pabrik baru (HQ_ADMIN)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { onboardPlant, ServiceError } from "@/lib/services/plant-onboarding.service";

const onboardSchema = z.object({
  regionId: z.string().uuid(),
  code: z.string().min(3).max(20),
  name: z.string().min(1),
  address: z.string().optional(),
  machines: z.array(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(["MAKER", "HLP"]),
    })
  ).min(1),
  shiftTemplates: z.array(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      durationMinutes: z.number().int().min(60).max(1440),
    })
  ).min(1),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  try {
    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
        { status: 400 }
      );
    }

    const result = await onboardPlant(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: (err as ServiceError).code, message: (err as ServiceError).message }, requestId: ctx.requestId },
        { status: 409 }
      );
    }
    throw err;
  }
});
