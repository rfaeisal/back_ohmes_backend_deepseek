// =============================================================================
// Unit Tests — Utility Functions
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  isValidIdempotencyKey,
  createApiError,
  parsePagination,
  toWibIso,
  todayWib,
  generateReceivingCode,
  generateCartonCode,
  generateDispatchCode,
} from "@/lib/utils";

// =============================================================================
// isValidIdempotencyKey
// =============================================================================

describe("isValidIdempotencyKey", () => {
  it("should accept valid key format with prefix-uuid pattern", () => {
    expect(isValidIdempotencyKey("box-open-550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidIdempotencyKey("shf-start-abc123")).toBe(true);
  });

  it("should reject keys without dash separator", () => {
    // Format valid: <prefix>-<uuid-like>
    expect(isValidIdempotencyKey("12345678")).toBe(false);
  });

  it("should reject too-short keys", () => {
    expect(isValidIdempotencyKey("a")).toBe(false);
    expect(isValidIdempotencyKey("ab")).toBe(false);
    expect(isValidIdempotencyKey("")).toBe(false);
  });
});

// =============================================================================
// createApiError
// =============================================================================

describe("createApiError", () => {
  it("should create error with code and message", () => {
    const err = createApiError("TEST_ERROR", "Test message");
    expect(err.code).toBe("TEST_ERROR");
    expect(err.message).toBe("Test message");
    expect(err.details).toBeUndefined();
  });

  it("should create error with details", () => {
    const err = createApiError("SHIFT_HAS_ACTIVE_BOX", "Masih ada boks aktif", {
      activeBoxIds: ["box_1", "box_2"],
    });
    expect(err.code).toBe("SHIFT_HAS_ACTIVE_BOX");
    expect(err.details).toEqual({ activeBoxIds: ["box_1", "box_2"] });
  });
});

// =============================================================================
// parsePagination
// =============================================================================

describe("parsePagination", () => {
  it("should return default values when no params", () => {
    const result = parsePagination({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeNull();
  });

  it("should clamp limit to 1-200 range", () => {
    expect(parsePagination({ limit: 0 }).limit).toBe(1);
    expect(parsePagination({ limit: 500 }).limit).toBe(200);
    expect(parsePagination({ limit: 100 }).limit).toBe(100);
  });

  it("should pass through cursor", () => {
    const result = parsePagination({ cursor: "abc123" });
    expect(result.cursor).toBe("abc123");
  });
});

// =============================================================================
// Code Generators
// =============================================================================

describe("generateReceivingCode", () => {
  it("should generate correct receiving code format", () => {
    const code = generateReceivingCode("MLG", "2026-08-10", 1);
    expect(code).toBe("RCV-MLG-20260810-01");
  });

  it("should pad sequence number", () => {
    const code = generateReceivingCode("MLG", "2026-08-10", 5);
    expect(code).toBe("RCV-MLG-20260810-05");
  });
});

describe("generateCartonCode", () => {
  it("should generate correct carton code format", () => {
    const code = generateCartonCode("MLG", "2026-08-10", 1);
    expect(code).toBe("CTN-MLG-20260810-001");
  });

  it("should pad sequence to 3 digits", () => {
    const code = generateCartonCode("MLG", "2026-08-10", 42);
    expect(code).toBe("CTN-MLG-20260810-042");
  });
});

describe("generateDispatchCode", () => {
  it("should generate correct dispatch code format", () => {
    const code = generateDispatchCode("MLG", "2026-08-10", 1);
    expect(code).toBe("DO-MLG-20260810-001");
  });
});

// =============================================================================
// todayWib
// =============================================================================

describe("todayWib", () => {
  it("should return a date string in YYYY-MM-DD format", () => {
    const result = todayWib();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// =============================================================================
// toWibIso
// =============================================================================

describe("toWibIso", () => {
  it("should return ISO string with +07:00 offset", () => {
    const date = new Date("2026-08-10T16:30:12Z");
    const result = toWibIso(date);
    // Should end with +07:00
    expect(result).toContain("+07:00");
    // Should contain the date part
    expect(result).toContain("2026-08-10");
  });
});
