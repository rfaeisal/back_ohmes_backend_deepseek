// =============================================================================
// Test push FCM ke satu token — verifikasi data payload deep-link mobile
// tanpa harus memicu event bisnis.
//
// Pemakaian:
//   node scripts/fcm-test-push.mjs <token> --type SHIFT_COMPLETED --id <uuid>
//   node scripts/fcm-test-push.mjs <token> --type RECEIVING_PENDING --id <uuid>
//   node scripts/fcm-test-push.mjs <token> --type EXTERNAL_BATANGAN_PENDING --id <uuid>
//   node scripts/fcm-test-push.mjs <token> --type HLP_REJECT_HIGH --id <batchCode>
//
// Service account: default ~/keystores/back-ohmes-firebase-adminsdk-fbsvc-c59786d33d.json
// (override: --sa <path> atau env FIREBASE_SERVICE_ACCOUNT berisi JSON).
// Token device: dari prod DB —
//   SELECT push_token FROM user_session WHERE push_token IS NOT NULL AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 5;
// =============================================================================

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const args = process.argv.slice(2);
const token = args[0];
if (!token || !token.startsWith("c")) {
  console.error("Pemakaian: node scripts/fcm-test-push.mjs <token> --type <TYPE> --id <id> [--title T] [--body B] [--sa path]");
  process.exit(1);
}

const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const type = opt("type") ?? "SHIFT_COMPLETED";
const id = opt("id") ?? "00000000-0000-4000-8000-000000000000";
const title = opt("title") ?? "Test push (data payload)";
const body = opt("body") ?? `Tap untuk buka deep-link — ${type} ${id.substring(0, 8)}...`;

// Data payload — kunci rute sesuai kontrak mobile (camelCase/snake_case)
const dataByType = {
  SHIFT_COMPLETED: {
    type: "SHIFT_COMPLETED",
    shift_id: id,
    plant_id: "test-plant",
    machine_id: "MKR-01",
    report_date: new Date().toISOString().slice(0, 10),
  },
  RECEIVING_PENDING: {
    type: "RECEIVING_PENDING",
    receiving_id: id,
    plant_id: "test-plant",
    sj_id: "",
    box_count: "1",
  },
  EXTERNAL_BATANGAN_PENDING: {
    type: "EXTERNAL_BATANGAN_PENDING",
    external_receiving_id: id,
    plant_id: "test-plant",
    sender_name: "TEST",
    batangan_kg: "100",
  },
  HLP_REJECT_HIGH: {
    type: "HLP_REJECT_HIGH",
    batch_code: id,
    ratio_pct: "7.5",
    plant_id: "test-plant",
  },
};

const data = dataByType[type];
if (!data) {
  console.error(`Type tidak dikenal: ${type} (pilih: ${Object.keys(dataByType).join(", ")})`);
  process.exit(1);
}

const rawSa = opt("sa")
  ? readFileSync(opt("sa"), "utf8")
  : process.env.FIREBASE_SERVICE_ACCOUNT ?? readFileSync(join(homedir(), "keystores", "back-ohmes-firebase-adminsdk-fbsvc-c59786d33d.json"), "utf8");

const app = initializeApp({ credential: cert(JSON.parse(rawSa)) });

try {
  const res = await getMessaging(app).send({
    token,
    notification: { title, body },
    data,
    android: { priority: "high" },
  });
  console.log("Push terkirim:", res);
  console.log("data payload:", JSON.stringify(data, null, 2));
} catch (err) {
  console.error("Gagal kirim:", err.code ?? "", err.message ?? err);
  process.exit(1);
}
