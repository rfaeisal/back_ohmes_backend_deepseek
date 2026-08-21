// GET /reports/:jobId/download — Unduh hasil export (CSV in-memory)
// Production: ganti dengan Blob/S3 URL — lihat komentar di export.service.
import { NextResponse } from "next/server";
import { getExportJob, generateCsvContent } from "@/lib/services/export.service";
import { withAuth } from "@/lib/auth/middleware";

type CukaiJobData = {
  shifts: Array<Record<string, unknown>>;
  boxes: Array<Record<string, unknown>>;
  wastes: Array<Record<string, unknown>>;
};

export const GET = withAuth(
  async (_request: Request, _ctx: unknown, { params }: { params: Promise<{ jobId: string }> }) => {
    const { jobId } = await params;
    const job = getExportJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: { code: "JOB_NOT_FOUND", message: "Job tidak ditemukan." } },
        { status: 404 }
      );
    }
    if (job.status !== "ready" || !job.data) {
      return NextResponse.json(
        {
          error: {
            code: "JOB_NOT_READY",
            message: `Job belum siap (status: ${job.status}).`,
          },
        },
        { status: 409 }
      );
    }

    const data = job.data as CukaiJobData;
    const lines: string[] = [];

    lines.push("=== SHIFTS ===");
    lines.push(generateCsvContent(
      ["reportDate", "status", "id"],
      data.shifts.map((s) => ({ reportDate: s.reportDate, status: s.status, id: s.id }))
    ));

    lines.push("=== BOXES ===");
    lines.push(generateCsvContent(
      ["boxNumber", "boxCode", "tsgWeightKg", "outputWeightKg", "yieldPct"],
      data.boxes
    ));

    lines.push("=== WASTES ===");
    lines.push(generateCsvContent(["category", "kg", "shiftId"], data.wastes));

    const csv = lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cukai-${jobId}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { requiredPermission: "report.export_cukai" }
);
