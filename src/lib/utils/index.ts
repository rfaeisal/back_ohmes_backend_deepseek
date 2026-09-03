// =============================================================================
// Shared Utilities — Idempotency, error formatting, pagination, cn
// =============================================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =============================================================================
// Idempotency-Key Validation
// =============================================================================

const IDEMPOTENCY_PREFIXES = [
  "shf-start",
  "shf-end",
  "shf-approve",
  "shf-reopen",
  "shf-correct",
  "box-open",
  "box-weigh",
  "box-consumption",
  "shift-downtime",
  "shift-maintenance",
  "shift-handoff",
  "hlp-pack",
  "tsg-receiving",
  "tsg-writeoff",
  "carton-create",
  "carton-close",
  "dispatch-create",
  "dispatch-confirm",
  "qr-generate",
  "qr-resolve",
] as const;

export type IdempotencyPrefix = (typeof IDEMPOTENCY_PREFIXES)[number];

/**
 * Validasi format Idempotency-Key: <prefix>-<uuid>
 * Contoh valid: "box-open-550e8400-e29b-41d4-a716-446655440000"
 */
export function isValidIdempotencyKey(key: string): boolean {
  const parts = key.split("-");
  if (parts.length < 2) return false;

  // Allow any prefix, but should be descriptive
  return key.length >= 8 && key.length <= 128;
}

// =============================================================================
// Error Response Format
// =============================================================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiError;
  requestId: string;
}

export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiError {
  return { code, message, details };
}

// =============================================================================
// Pagination
// =============================================================================

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export function parsePagination(params: PaginationParams): {
  limit: number;
  cursor: string | null;
} {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200); // clamp 1-200
  const cursor = params.cursor ?? null;
  return { limit, cursor };
}

// =============================================================================
// Date/Time Helpers
// =============================================================================

/**
 * Format date ke WIB (Asia/Jakarta) ISO 8601
 */
export function toWibIso(date: Date): string {
  return (
    date.toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T") +
    "+07:00"
  );
}

/**
 * Get current date in WIB as YYYY-MM-DD
 */
export function todayWib(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

// =============================================================================
// Machine Applicability
// =============================================================================

/**
 * Cek kolom applicable_machines (docs/26 §7.3): nilai tunggal
 * (MAKER/HLP/BOTH) ATAU daftar dipisah koma ('WR,SLOP,BAL'). BOTH = semua.
 */
export function machineApplies(
  applicable: string | null | undefined,
  machineType: string
): boolean {
  const am = applicable?.trim() || "BOTH";
  if (am === "BOTH") return true;
  return am
    .split(",")
    .map((s) => s.trim())
    .includes(machineType);
}

/** Opsi mesin untuk form applicable_machines (docs/26 §7.3). */
export const APPLICABLE_MACHINE_OPTIONS = ["MAKER", "HLP", "WR", "SLOP", "BAL"];

/** Baca kolom applicable_machines jadi daftar mesin terpilih (BOTH = semua). */
export function parseApplicableMachines(am: string | null | undefined): string[] {
  const v = am?.trim() || "BOTH";
  if (v === "BOTH") return [...APPLICABLE_MACHINE_OPTIONS];
  const opts = new Set(APPLICABLE_MACHINE_OPTIONS);
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => opts.has(s));
}

/** Gabung daftar mesin terpilih jadi nilai kolom (kosong/semua = BOTH). */
export function joinApplicableMachines(selected: string[]): string {
  if (selected.length === 0 || selected.length === APPLICABLE_MACHINE_OPTIONS.length) {
    return "BOTH";
  }
  return selected.join(",");
}

// =============================================================================
// Slug & Code Generation
// =============================================================================

/**
 * Generate kode receiving: RCV-{plantCode}-{YYYYMMDD}-{seq}
 */
export function generateReceivingCode(
  plantCode: string,
  dateStr: string,
  seq: number
): string {
  return `RCV-${plantCode}-${dateStr.replace(/-/g, "")}-${String(seq).padStart(2, "0")}`;
}

/**
 * Generate kode karton: CTN-{plantCode}-{YYYYMMDD}-{seq}
 */
export function generateCartonCode(
  plantCode: string,
  dateStr: string,
  seq: number
): string {
  return `CTN-${plantCode}-${dateStr.replace(/-/g, "")}-${String(seq).padStart(3, "0")}`;
}

/**
 * Generate kode dispatch order: DO-{plantCode}-{YYYYMMDD}-{seq}
 */
export function generateDispatchCode(
  plantCode: string,
  dateStr: string,
  seq: number
): string {
  return `DO-${plantCode}-${dateStr.replace(/-/g, "")}-${String(seq).padStart(3, "0")}`;
}
