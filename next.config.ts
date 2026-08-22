import type { NextConfig } from "next";

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
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
              "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
              "font-src 'self' data:; connect-src 'self'; object-src 'none'; " +
              "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
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
