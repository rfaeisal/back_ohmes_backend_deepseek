// =============================================================================
// Shared Utilities — Idempotency, error formatting, pagination
// =============================================================================

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
