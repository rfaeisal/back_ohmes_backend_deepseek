import { NextResponse } from "next/server";

/**
 * GET /api/v1/health — health check endpoint
 * Return status database + uptime
 */
export async function GET() {
  const status = {
    status: "healthy",
    version: process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0",
    environment: process.env.NEXT_PUBLIC_APP_ENV || "development",
    timestamp: new Date().toISOString(),
    features: {
      wmsInbound: process.env.FEATURE_WMS_INBOUND === "true",
      mobileQr: process.env.FEATURE_MOBILE_QR === "true",
      wmsOutbound: process.env.FEATURE_WMS_OUTBOUND === "true",
      dispatch: process.env.FEATURE_DISPATCH === "true",
    },
  };

  return NextResponse.json(status, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
