// =============================================================================
// Mobile Sync Dispatch — route offline queue items ke internal handler
// =============================================================================
// Dipakai oleh POST /api/v1/mobile/sync. Mobile app enqueue mutasi offline
// (SJ weigh/ship/void, receiving from-sj/approve) ke drift local, flush ke
// server via batch POST. Kita dispatch per item ke handler internal (bukan
// re-HTTP loop) supaya auth/RLS/validation tetap konsisten.
// =============================================================================

import type { NextResponse } from "next/server";

import { POST as sjWeighPost } from "@/app/api/v1/supplier-sj/[id]/boxes/weigh/route";
import { PATCH as sjShipPatch } from "@/app/api/v1/supplier-sj/[id]/route";
import { POST as sjVoidPost } from "@/app/api/v1/supplier-sj/labels/[boxCode]/void/route";
import { POST as receivingFromSjPost } from "@/app/api/v1/tsg-receiving/from-sj/route";
import { POST as receivingApprovePost } from "@/app/api/v1/tsg-receiving/[id]/approve/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (...args: any[]) => Promise<NextResponse>;

interface RouteEntry {
  method: "POST" | "PATCH";
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

// Path yang di-support harus persis sesuai file route App Router.
// Kalau mobile kirim path yang tidak match → return UNKNOWN_ROUTE untuk item tsb.
const routes: RouteEntry[] = [
  {
    method: "POST",
    pattern: /^\/api\/v1\/supplier-sj\/([^/]+)\/boxes\/weigh$/,
    paramNames: ["id"],
    handler: sjWeighPost,
  },
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/supplier-sj\/([^/]+)$/,
    paramNames: ["id"],
    handler: sjShipPatch,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/supplier-sj\/labels\/([^/]+)\/void$/,
    paramNames: ["boxCode"],
    handler: sjVoidPost,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/tsg-receiving\/from-sj$/,
    paramNames: [],
    handler: receivingFromSjPost,
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/tsg-receiving\/([^/]+)\/approve$/,
    paramNames: ["id"],
    handler: receivingApprovePost,
  },
];

export interface DispatchInput {
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
  parentRequest: Request;
}

export interface DispatchOutput {
  status: number;
  body: unknown;
}

export async function dispatchSyncItem(
  input: DispatchInput
): Promise<DispatchOutput> {
  const match = routes.find(
    (r) => r.method === input.method && r.pattern.test(input.path)
  );

  if (!match) {
    return {
      status: 404,
      body: {
        error: {
          code: "UNKNOWN_ROUTE",
          message: `Route ${input.method} ${input.path} tidak dikenal.`,
        },
      },
    };
  }

  // Extract path params (grup regex → nama)
  const rawParams = match.pattern.exec(input.path);
  const paramsObj: Record<string, string> = {};
  if (rawParams) {
    match.paramNames.forEach((name, i) => {
      paramsObj[name] = decodeURIComponent(rawParams[i + 1] ?? "");
    });
  }

  // Build synthetic Request. Preserve auth header dari parent supaya
  // withAuth di handler bisa re-verify JWT + set RLS context ulang.
  const parentUrl = new URL(input.parentRequest.url);
  const syntheticUrl = new URL(input.path, parentUrl.origin).toString();

  const headers = new Headers();
  const auth = input.parentRequest.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);
  const reqId = input.parentRequest.headers.get("X-Request-Id");
  if (reqId) headers.set("X-Request-Id", `${reqId}:sync`);
  headers.set("Content-Type", "application/json");

  const synthetic = new Request(syntheticUrl, {
    method: input.method,
    headers,
    body: JSON.stringify(input.body ?? {}),
  });

  // Panggil handler. Kalau route punya dynamic segment, Next expects
  // second arg {params: Promise<...>}. Kalau tidak, jangan lempar arg.
  const response =
    match.paramNames.length > 0
      ? await match.handler(synthetic, { params: Promise.resolve(paramsObj) })
      : await match.handler(synthetic);

  // Ambil body untuk dedup + kirim balik ke mobile
  let responseBody: unknown = null;
  try {
    responseBody = await response.clone().json();
  } catch {
    responseBody = null;
  }

  return { status: response.status, body: responseBody };
}
