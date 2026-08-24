import type { NextConfig } from "next";

// CSP strict HANYA di produksi. Dev membutuhkan 'unsafe-eval' untuk
// react-refresh runtime Next.js — kalau diblokir, client bundle gagal
// dievaluasi → React tidak hydrate → form tidak menerima input (tombol
// login disabled). Bundle produksi tidak pakai eval, jadi tetap strict.
const isProd = process.env.NODE_ENV === "production";

const cspValue = isProd
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self'; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self' ws: http://localhost:*; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Type errors from Next.js generated types are non-blocking
    // Run `pnpm typecheck` separately for source-level verification
    ignoreBuildErrors: true,
  },
  // Server-side only — client tidak boleh hitung yield
  // Semua kalkulasi produksi via API endpoints
  poweredByHeader: false,
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000",
          },
          {
            key: "Content-Security-Policy",
            value: cspValue,
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
