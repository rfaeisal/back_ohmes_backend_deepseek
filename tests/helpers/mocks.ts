// =============================================================================
// Mock Setup — Prevent actual DB connection during unit tests
// =============================================================================
// Semua unit test yang tidak explicitly butuh koneksi DB pakai mock ini.
// Integration test dengan testcontainers akan override mock ini.

import { vi } from "vitest";

// Mock drizzle-orm/postgres-js untuk unit test
vi.mock("@/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    $with: vi.fn(),
    $count: vi.fn(),
  };

  return {
    default: mockDb,
    db: mockDb,
    client: { end: vi.fn() },
  };
});

// Mock drizzle-orm untuk query utilities
vi.mock("drizzle-orm", () => {
  const actual = vi.importActual("drizzle-orm");
  return actual;
});

// Mock drizzle-orm/pg-core untuk schema definitions
vi.mock("drizzle-orm/pg-core", () => {
  const actual = vi.importActual("drizzle-orm/pg-core");
  return actual;
});
