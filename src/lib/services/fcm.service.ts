// =============================================================================
// FCM Push Service — kirim push notification ke perangkat mobile
// =============================================================================
// Handoff mobile BACKEND_HANDOFF.md §1: backend sudah terima + simpan token
// via POST /mobile/push-register (kolom user_session.push_token), tapi belum
// pernah kirim push. Mobile fallback polling GET /notifications tiap 60 detik.
//
// Service ini dipanggil fire-and-forget dari titik event bisnis (shift
// COMPLETED, receiving PENDING, dst) — gagal kirim TIDAK menggagalkan operasi
// utama. Credential: env FIREBASE_SERVICE_ACCOUNT (JSON service account utuh,
// satu baris). Kalau belum diset, push di-skip dengan warning sekali.
// =============================================================================

import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import db from "@/db";
import { userSession, userAssignment, role } from "@/db/schema";

let fcmApp: App | null = null;
let initTried = false;

function getFcmApp(): App | null {
  if (fcmApp) return fcmApp;
  if (initTried) return null;
  initTried = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn("[fcm] FIREBASE_SERVICE_ACCOUNT belum diset — push di-skip.");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    fcmApp = initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("[fcm] Firebase Admin siap.");
  } catch (err) {
    console.error("[fcm] Gagal init Firebase Admin:", err);
  }
  return fcmApp;
}

interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

// Token FCM aktif milik user (session MOBILE aktif + belum revoked)
async function getActivePushTokens(userId: string): Promise<string[]> {
  const rows = await db
    .select({ pushToken: userSession.pushToken })
    .from(userSession)
    .where(
      and(
        eq(userSession.userId, userId),
        eq(userSession.deviceType, "MOBILE"),
        isNull(userSession.revokedAt),
        isNotNull(userSession.pushToken)
      )
    );

  return rows.map((r) => r.pushToken!).filter((t) => t.length > 0);
}

// Token mati (app di-uninstall / device di-reset) → hapus dari session
async function clearPushToken(token: string): Promise<void> {
  await db
    .update(userSession)
    .set({ pushToken: null })
    .where(eq(userSession.pushToken, token));
}

// =============================================================================
// Targeting
// =============================================================================

// Plant Manager yang punya assignment PLANT aktif di plant tsb
export async function getPlantManagerUserIds(plantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: userAssignment.userId })
    .from(userAssignment)
    .innerJoin(role, eq(userAssignment.roleId, role.id))
    .where(
      and(
        eq(userAssignment.scopeType, "PLANT"),
        eq(userAssignment.scopeId, plantId),
        eq(role.code, "PLANT_MANAGER"),
        isNull(userAssignment.revokedAt)
      )
    );

  return [...new Set(rows.map((r) => r.userId))];
}

// Shift Supervisor yang punya assignment PLANT aktif di plant tsb
export async function getSupervisorUserIds(plantId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: userAssignment.userId })
    .from(userAssignment)
    .innerJoin(role, eq(userAssignment.roleId, role.id))
    .where(
      and(
        eq(userAssignment.scopeType, "PLANT"),
        eq(userAssignment.scopeId, plantId),
        eq(role.code, "SHIFT_SUPERVISOR"),
        isNull(userAssignment.revokedAt)
      )
    );

  return [...new Set(rows.map((r) => r.userId))];
}

// =============================================================================
// Send
// =============================================================================

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; skipped: number }> {
  const app = getFcmApp();
  if (!app) return { sent: 0, skipped: userIds.length };

  const messaging = getMessaging(app);
  let sent = 0;
  let skipped = 0;

  for (const userId of userIds) {
    const tokens = await getActivePushTokens(userId);
    if (tokens.length === 0) {
      skipped++;
      continue;
    }

    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
          android: { priority: "high" },
        });
        sent++;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          // User uninstall app / reset device — token tidak valid lagi
          await clearPushToken(token);
        } else {
          console.error(
            `[fcm] Send gagal (${code ?? "unknown"}):`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  return { sent, skipped };
}

// =============================================================================
// Notifier per event bisnis — fire-and-forget, aman dipanggil tanpa await
// =============================================================================

// Shift status → COMPLETED: Plant Manager + Shift Supervisor plant tsb
// (keduanya pemegang shift.approve — permintaan tim mobile 3d)
export async function notifyShiftCompleted(shift: {
  shiftId: string;
  plantId: string;
  machineId: string;
  reportDate: string;
}): Promise<void> {
  try {
    const [pmIds, supervisorIds] = await Promise.all([
      getPlantManagerUserIds(shift.plantId),
      getSupervisorUserIds(shift.plantId),
    ]);
    const userIds = [...new Set([...pmIds, ...supervisorIds])];
    if (userIds.length === 0) return;

    await sendPushToUsers(userIds, {
      title: "Shift selesai",
      body: `Shift ${shift.shiftId.substring(0, 8)}... siap disetujui.`,
      data: {
        shift_id: shift.shiftId,
        plant_id: shift.plantId,
        machine_id: shift.machineId,
        report_date: shift.reportDate,
      },
    });
  } catch (err) {
    console.error("[fcm] notifyShiftCompleted gagal:", err);
  }
}

// Reject HLP di atas ambang (docs/23 §4.4) → PM + supervisor plant tsb
export async function notifyHlpRejectHigh(input: {
  plantId: string;
  batchCode: string;
  ratioPct: number;
}): Promise<void> {
  try {
    const [pmIds, supervisorIds] = await Promise.all([
      getPlantManagerUserIds(input.plantId),
      getSupervisorUserIds(input.plantId),
    ]);
    const userIds = [...new Set([...pmIds, ...supervisorIds])];
    if (userIds.length === 0) return;

    await sendPushToUsers(userIds, {
      title: "Reject HLP di atas ambang",
      body: `Batch ${input.batchCode} reject ${input.ratioPct}% (> 5%).`,
      data: {
        batch_code: input.batchCode,
        ratio_pct: String(input.ratioPct),
        plant_id: input.plantId,
      },
    });
  } catch (err) {
    console.error("[fcm] notifyHlpRejectHigh gagal:", err);
  }
}

// Penerimaan batangan external (makloon) → PENDING: PM + supervisor
export async function notifyExternalBatanganPending(input: {
  receivingId: string;
  plantId: string;
  senderName: string;
  batanganKg: number;
}): Promise<void> {
  try {
    const [pmIds, supervisorIds] = await Promise.all([
      getPlantManagerUserIds(input.plantId),
      getSupervisorUserIds(input.plantId),
    ]);
    const userIds = [...new Set([...pmIds, ...supervisorIds])];
    if (userIds.length === 0) return;

    await sendPushToUsers(userIds, {
      title: "Batangan external menunggu approval",
      body: `${input.senderName} — ${input.batanganKg} kg siap diverifikasi.`,
      data: {
        external_receiving_id: input.receivingId,
        plant_id: input.plantId,
        sender_name: input.senderName,
        batangan_kg: String(input.batanganKg),
      },
    });
  } catch (err) {
    console.error("[fcm] notifyExternalBatanganPending gagal:", err);
  }
}

// Receiving status → PENDING (manual tanpa SJ): Plant Manager + Shift
// Supervisor plant tsb (keduanya pemegang tsg.receiving.approve)
export async function notifyReceivingPending(receiving: {
  receivingId: string;
  plantId: string;
  supplierSjId: string | null;
  boxCount: number;
}): Promise<void> {
  try {
    const [pmIds, supervisorIds] = await Promise.all([
      getPlantManagerUserIds(receiving.plantId),
      getSupervisorUserIds(receiving.plantId),
    ]);
    const userIds = [...new Set([...pmIds, ...supervisorIds])];
    if (userIds.length === 0) return;

    await sendPushToUsers(userIds, {
      title: "Receiving menunggu approval",
      body: `Receiving ${receiving.receivingId.substring(0, 8)}... (${receiving.boxCount} boks) siap diverifikasi.`,
      data: {
        receiving_id: receiving.receivingId,
        plant_id: receiving.plantId,
        sj_id: receiving.supplierSjId ?? "",
        box_count: String(receiving.boxCount),
      },
    });
  } catch (err) {
    console.error("[fcm] notifyReceivingPending gagal:", err);
  }
}
