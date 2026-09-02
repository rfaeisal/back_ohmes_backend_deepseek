// State lintas spec — file JSON di .e2e/ (gitignored).
// TIDAK di test-results/ karena Playwright menghapus folder itu tiap run;
// state harus bertahan untuk mode iterasi (E2E_SKIP_RESET=1).
// Dihapus oleh scripts/e2e-reset-db.mjs saat run penuh.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";

const DIR = join(process.cwd(), ".e2e");
const FILE = join(DIR, "e2e-state.json");

export type E2eState = {
  shiftId?: string;
  /** btc_... dari spec 02, dipakai 04 (HLP) & 05 (outbound) */
  batchCode?: string;
  boxCode?: string;
  /** berat boks yang dibuka di spec 02 — dasar hitung timbang (×1.12) */
  boxWeightKg?: number;
  /** Pack Lolos dari spec 04, dipakai 05 (FG confirm deterministik) */
  packsLolos?: number;
  /** dari spec 05, dipakai 06 (dispatch) */
  cartonCode?: string;
  /** dari spec 05b (karton unit SLOP/BAL) — cadangan dispatch multi-unit */
  slopCartonCode?: string;
};

export function readState(): E2eState {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as E2eState;
  } catch {
    return {};
  }
}

export function writeState(patch: Partial<E2eState>): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

/**
 * Skip test kalau state yang dibutuhkan tidak ada (chain putus).
 * WAJIB dipanggil DI DALAM body test, bukan top-level module —
 * collection semua file terjadi sebelum file sebelumnya sempat menulis state.
 */
export function skipIfMissing(
  state: E2eState,
  keys: (keyof E2eState)[],
  requiredFrom: string
): void {
  const missing = keys.filter((k) => state[k] === undefined);
  if (missing.length > 0) {
    test.skip(
      true,
      `Butuh state '${missing.join(", ")}' dari ${requiredFrom} — jalankan pnpm test:e2e (full chain)`
    );
  }
}
