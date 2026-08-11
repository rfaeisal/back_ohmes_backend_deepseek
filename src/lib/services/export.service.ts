// =============================================================================
// Export Service — Report cukai & operational export
// =============================================================================

import { eq, and, gte, lte } from "drizzle-orm";
import db from "@/db";
import { shiftReport, shiftWaste, tsgBoxProcess } from "@/db/schema";

// =============================================================================
// Types
// =============================================================================

export interface ExportJob {
  jobId: string;
  status: "pending" | "processing" | "ready" | "failed";
  progress: number;
  downloadUrl?: string;
  error?: string;
}

// In-memory job store (production: Redis/DB)
const jobs = new Map<string, ExportJob>();

// =============================================================================
// Generate Export Cukai
// =============================================================================

export async function generateCukaiExport(
  plantId: string,
  from: string,
  to: string,
  format: "csv" | "xlsx" = "csv"
): Promise<ExportJob> {
  const jobId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const job: ExportJob = {
    jobId,
    status: "pending",
    progress: 0,
  };
  jobs.set(jobId, job);

  // Async generation (simulated — production pakai job queue)
  setTimeout(async () => {
    try {
      job.status = "processing";
      job.progress = 50;

      // Fetch data
      const shifts = await db
        .select({
          id: shiftReport.id,
          reportDate: shiftReport.reportDate,
          status: shiftReport.status,
        })
        .from(shiftReport)
        .where(
          and(
            eq(shiftReport.plantId, plantId),
            gte(shiftReport.reportDate, from),
            lte(shiftReport.reportDate, to)
          )
        );

      const boxes = await db
        .select({
          shiftId: tsgBoxProcess.shiftReportId,
          boxNumber: tsgBoxProcess.boxNumber,
          boxCode: tsgBoxProcess.boxCode,
          tsgWeightKg: tsgBoxProcess.tsgWeightKg,
          outputWeightKg: tsgBoxProcess.outputWeightKg,
          yieldPct: tsgBoxProcess.yieldPct,
        })
        .from(tsgBoxProcess)
        .innerJoin(shiftReport, eq(tsgBoxProcess.shiftReportId, shiftReport.id))
        .where(
          and(
            eq(shiftReport.plantId, plantId),
            gte(shiftReport.reportDate, from),
            lte(shiftReport.reportDate, to)
          )
        );

      const wastes = await db
        .select({
          shiftId: shiftWaste.shiftReportId,
          category: shiftWaste.category,
          kg: shiftWaste.kg,
        })
        .from(shiftWaste)
        .innerJoin(shiftReport, eq(shiftWaste.shiftReportId, shiftReport.id))
        .where(
          and(
            eq(shiftReport.plantId, plantId),
            gte(shiftReport.reportDate, from),
            lte(shiftReport.reportDate, to)
          )
        );

      job.progress = 100;
      job.status = "ready";
      job.downloadUrl = `/api/v1/reports/${jobId}/download?format=${format}`;

      // Store data untuk download
      jobs.set(jobId, {
        ...job,
        // Attach data to job (production: store in Blob/S3)
        data: { shifts: shifts.length, boxes: boxes.length, wastes: wastes.length },
      } as ExportJob & { data: unknown });
    } catch (err) {
      job.status = "failed";
      job.error = (err as Error).message;
    }
  }, 100);

  return job;
}

// =============================================================================
// Get Job Status
// =============================================================================

export function getExportJob(jobId: string): ExportJob | null {
  return jobs.get(jobId) ?? null;
}

// =============================================================================
// Generate CSV Content (in-memory)
// =============================================================================

export function generateCsvContent(
  headers: string[],
  rows: Array<Record<string, unknown>>
): string {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // Escape commas and quotes
      return str.includes(",") || str.includes('"')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
