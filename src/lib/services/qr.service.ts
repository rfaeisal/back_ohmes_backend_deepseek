// =============================================================================
// QR Service — Generate, Resolve, Anti-Forgery (HMAC)
// =============================================================================

import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import db from "@/db";
import { qrRegistry } from "@/db/schema";
import { plant } from "@/db/schema/tenancy";
import { machine } from "@/db/schema/master-product";
import { tsgReceivingBox } from "@/db/schema/wms-inbound";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Configuration
// =============================================================================

const HMAC_KEY = process.env.HMAC_KEY_ENCRYPTION || "CHANGE_ME_HMAC_ENCRYPTION_KEY";

// =============================================================================
// Types
// =============================================================================

export type QrType = "MACHINE" | "TSG_BOX" | "BATCH" | "PACK";

export interface QrGenerateInput {
  type: QrType;
  entityId: string;
  plantId: string;
  generatedBy: string;
}

export interface QrResolveResult {
  type: QrType;
  entity: Record<string, unknown>;
  plantId: string;
  canAccess: boolean;
  nextAction: string;
}

// =============================================================================
// HMAC Computation (anti-forgery untuk QR dinamis)
// =============================================================================

export function computeHmac(payload: string): string {
  return createHmac("sha256", HMAC_KEY)
    .update(payload)
    .digest("hex")
    .slice(0, 16); // 16 karakter cukup untuk verifikasi
}

export function verifyHmac(payload: string, hmac: string): boolean {
  const expected = computeHmac(payload);
  // Constant-time comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(hmac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// =============================================================================
// Build URI
// =============================================================================

export function buildQrUri(type: QrType, plantCode: string, entityCode: string): string {
  return `ohmes://${type.toLowerCase()}/${plantCode}/${entityCode}`;
}

function parseQrUri(uri: string): { type: string; plantCode: string; entityCode: string } | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "ohmes:") return null;
    // Protokol custom: segmen pertama (tipe) menjadi hostname, sisanya pathname.
    const parts = `${url.hostname}/${url.pathname}`.split("/").filter(Boolean);
    if (parts.length < 3) return null;
    return { type: parts[0]!, plantCode: parts[1]!, entityCode: parts[2]! };
  } catch {
    return null;
  }
}

// =============================================================================
// Generate QR
// =============================================================================

export async function generateQr(input: QrGenerateInput) {
  // Get plant code
  const [plt] = await db
    .select({ code: plant.code })
    .from(plant)
    .where(eq(plant.id, input.plantId))
    .limit(1);

  if (!plt) throw new ServiceError("PLANT_NOT_FOUND", "Pabrik tidak ditemukan.");

  // Get entity code based on type
  let entityCode = "";
  let uri = "";
  let hmac: string | null = null;

  switch (input.type) {
    case "MACHINE": {
      const [m] = await db
        .select({ code: machine.code })
        .from(machine)
        .where(eq(machine.id, input.entityId))
        .limit(1);
      if (!m) throw new ServiceError("MACHINE_NOT_FOUND", "Mesin tidak ditemukan.");
      entityCode = m.code;
      uri = buildQrUri("MACHINE", plt.code, entityCode);
      break;
    }
    case "TSG_BOX": {
      const [box] = await db
        .select({ boxCode: tsgReceivingBox.boxCode })
        .from(tsgReceivingBox)
        .where(eq(tsgReceivingBox.id, input.entityId))
        .limit(1);
      if (!box) throw new ServiceError("BOX_NOT_FOUND", "Boks tidak ditemukan.");
      entityCode = box.boxCode;
      uri = buildQrUri("TSG_BOX", plt.code, entityCode);
      // QR dinamis → HMAC
      hmac = computeHmac(`${input.entityId}:${Date.now()}`);
      break;
    }
    case "BATCH": {
      entityCode = input.entityId.slice(0, 12);
      uri = buildQrUri("BATCH", plt.code, entityCode);
      hmac = computeHmac(`${input.entityId}:${Date.now()}`);
      break;
    }
    case "PACK": {
      entityCode = input.entityId.slice(0, 12);
      uri = buildQrUri("PACK", plt.code, entityCode);
      hmac = computeHmac(`${input.entityId}:${Date.now()}`);
      break;
    }
  }

  // Store in QR registry
  const [qr] = await db
    .insert(qrRegistry)
    .values({
      plantId: input.plantId,
      type: input.type,
      entityId: input.entityId,
      uri,
      hmac,
      generatedBy: input.generatedBy,
    })
    .returning();

  return { qrId: qr!.id, uri, hmac, type: input.type };
}

// =============================================================================
// Resolve QR (deep-link handler)
// =============================================================================

export async function resolveQr(
  uri: string,
  _userId: string,
  userPlantIds: string[]
): Promise<QrResolveResult> {
  // Parse URI — URL parser mengabaikan query string, jadi lookup memakai
  // base URI; QR tercetak membawa ?w=...&h=... (lihat 07-qr-strategy).
  const parsed = parseQrUri(uri);
  if (!parsed) throw new ServiceError("QR_INVALID_URI", "Format URI tidak valid: " + uri);

  const baseUri = `ohmes://${parsed.type}/${parsed.plantCode}/${parsed.entityCode}`;

  // Find in registry (base URI tanpa query)
  const [qr] = await db
    .select()
    .from(qrRegistry)
    .where(eq(qrRegistry.uri, baseUri))
    .limit(1);

  if (!qr) throw new ServiceError("QR_NOT_FOUND", "QR tidak terdaftar di sistem.");

  // Anti-forgery: QR dinamis (TSG_BOX/BATCH/PACK) punya hmac di registry —
  // scan wajib menyertakan ?h=... yang cocok, kalau tidak = QR palsu/expired.
  if (qr.hmac) {
    const h = new URL(uri).searchParams.get("h");
    if (!h) {
      throw new ServiceError("QR_HMAC_REQUIRED", "QR dinamis memerlukan parameter h (anti-forgery).");
    }
    const a = Buffer.from(qr.hmac);
    const b = Buffer.from(h);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ServiceError("QR_INVALID", "QR tidak valid (HMAC tidak cocok).");
    }
  }

  // Scope check
  const canAccess = userPlantIds.includes(qr.plantId);

  // Enrich entity untuk TSG_BOX — berat & kode dari receiving (purpose: auto-fill)
  const entity: Record<string, unknown> = {
    id: qr.entityId,
    uri: qr.uri,
    plantId: qr.plantId,
  };
  if (qr.type === "TSG_BOX") {
    const [box] = await db
      .select({ boxCode: tsgReceivingBox.boxCode, weightKg: tsgReceivingBox.weightKg })
      .from(tsgReceivingBox)
      .where(eq(tsgReceivingBox.id, qr.entityId))
      .limit(1);
    if (box) {
      entity.code = box.boxCode;
      entity.weightKg = box.weightKg;
    }
  }

  // Determine next action based on type
  const nextActions: Record<string, string> = {
    MACHINE: "START_SHIFT",
    TSG_BOX: "OPEN_BOX",
    BATCH: "HLP_PACK",
    PACK: "VIEW_PACK",
  };

  return {
    type: qr.type as QrType,
    entity,
    plantId: qr.plantId,
    canAccess,
    nextAction: nextActions[qr.type] ?? "UNKNOWN",
  };
}

// =============================================================================
// Log Scan
// =============================================================================

export async function logScan(uri: string, _scannedBy: string, _deviceInfo?: string) {
  // Lookup pakai base URI (QR tercetak membawa query ?w=..&h=..)
  const parsed = parseQrUri(uri);
  const baseUri = parsed
    ? `ohmes://${parsed.type}/${parsed.plantCode}/${parsed.entityCode}`
    : uri;

  const [qr] = await db
    .select({ id: qrRegistry.id })
    .from(qrRegistry)
    .where(eq(qrRegistry.uri, baseUri))
    .limit(1);

  if (!qr) throw new ServiceError("QR_NOT_FOUND", "QR tidak terdaftar.");

  // Update QR registry — log scan
  // (scan count atau scan log table bisa ditambahkan nanti)

  return { uri, scanned: true, at: new Date().toISOString() };
}
