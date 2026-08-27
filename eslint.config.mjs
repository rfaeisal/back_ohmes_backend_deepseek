// ESLint 9 flat config — Next.js 15. `next lint` deprecated + interaktif
// tanpa config ini, jadi CI panggil eslint CLI langsung (script "lint").
// eslint-config-next 15 masih legacy export → bungkus via FlatCompat.
import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-e2e/**",
      "test-results/**",
      "playwright-report/**",
      ".e2e/**",
      "coverage/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  {
    // tests/e2e bukan kode React — fixture Playwright memakai `use(...)`
    // yang memicu react-hooks/rules-of-hooks false positive
    files: ["tests/e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default config;
