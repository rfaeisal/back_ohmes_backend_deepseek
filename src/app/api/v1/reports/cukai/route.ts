// POST /reports/cukai — Generate export cukai (async)
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/middleware";
import { generateCukaiExport, getExportJob } from "@/lib/services/export.service";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["csv", "xlsx"]).default("csv"),
});

export const POST = withAuth(async (request: Request, ctx: AuthContext) => {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: parsed.error.flatten() }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  const plantId = ctx.user.plantIds[0];
  if (!plantId) {
    return NextResponse.json(
      { error: { code: "NO_PLANT_SCOPE", message: "Tidak ada plant dalam scope." }, requestId: ctx.requestId },
      { status: 403 }
    );
  }

  const job = await generateCukaiExport(plantId, parsed.data.from, parsed.data.to, parsed.data.format);

  return NextResponse.json(
    { jobId: job.jobId, status: job.status },
    { status: 202 }
  );
});

export const GET = withAuth(async (request: Request, ctx: AuthContext) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: { code: "MISSING_JOB_ID", message: "jobId wajib." }, requestId: ctx.requestId },
      { status: 400 }
    );
  }

  const job = getExportJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: { code: "JOB_NOT_FOUND", message: "Job tidak ditemukan." }, requestId: ctx.requestId },
      { status: 404 }
    );
  }

  return NextResponse.json(job, { status: 200 });
});
