import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    // Spec Playwright (.e2e.spec.ts) bukan milik Vitest
    exclude: ["tests/e2e/**"],
    // Set env vars for tests
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      JWT_SECRET: "test_secret_32_bytes_minimum_64_chars_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      JWT_ISSUER: "mes.hummer",
      JWT_AUDIENCE: "mes.hummer.api",
      JWT_ACCESS_TOKEN_TTL_MINUTES: "15",
      JWT_REFRESH_TOKEN_TTL_DAYS: "30",
      NEXT_PUBLIC_APP_ENV: "development",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/db/migrations/**",
        "src/db/seed*.ts",
        "src/app/**/layout.tsx",
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
