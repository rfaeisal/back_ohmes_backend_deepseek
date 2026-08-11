import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
        ],
      },
    ];
  },
};

export default nextConfig;
