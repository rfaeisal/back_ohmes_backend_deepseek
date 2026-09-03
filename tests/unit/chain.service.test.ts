// Unit test chain.service — catatan per-stage rantai produksi (docs/25)
// + validasi target produk jadi (0030)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  createBatchStageEvent,
  listBatchStageEvents,
  setBatchTarget,
  STAGE_UNIT,
  TARGET_STAGES,
} from "@/lib/services/chain.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

const baseInput = {
  plantId: "p1",
  batchId: "b1",
  stage: "WR" as const,
  inputQty: 40,
  outputQty: 38,
  rejectQty: 2,
  operatorBy: "u1",
};

// Batch bertarget BAL: semua stage (WR/SLOP/BAL) diizinkan
const balBatch = { id: "b1", code: "btx_01", stage: "PACKED", targetUnit: "BAL" };

describe("STAGE_UNIT", () => {
  it("satuan mengikuti stage", () => {
    expect(STAGE_UNIT.WR).toBe("PACK");
    expect(STAGE_UNIT.SLOP).toBe("SLOP");
    expect(STAGE_UNIT.BAL).toBe("BAL");
  });
});

describe("TARGET_STAGES", () => {
  it("rantai wajib per target", () => {
    expect(TARGET_STAGES.PACK).toEqual([]);
    expect(TARGET_STAGES.PACK_WRAP).toEqual(["WR"]);
    expect(TARGET_STAGES.SLOP).toEqual(["WR", "SLOP"]);
    expect(TARGET_STAGES.BAL).toEqual(["WR", "SLOP", "BAL"]);
  });
});

describe("createBatchStageEvent", () => {
  it("batch tidak ditemukan → BATCH_NOT_FOUND", async () => {
    h.db._selectResults.push([]);
    await expect(createBatchStageEvent(baseInput)).rejects.toMatchObject({ code: "BATCH_NOT_FOUND" });
  });

  it("jumlah negatif ditolak", async () => {
    h.db._selectResults.push([balBatch]);
    await expect(createBatchStageEvent({ ...baseInput, inputQty: -1 })).rejects.toMatchObject({ code: "INVALID_QTY" });
  });

  it("semua nol ditolak EMPTY_EVENT", async () => {
    h.db._selectResults.push([balBatch]);
    await expect(
      createBatchStageEvent({ ...baseInput, inputQty: 0, outputQty: 0, rejectQty: 0 })
    ).rejects.toMatchObject({ code: "EMPTY_EVENT" });
  });

  it("PACKING_REQUIRED: WR ditolak kalau packing HLP belum dicatat", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([]); // belum ada hlp_pack
    await expect(createBatchStageEvent(baseInput)).rejects.toMatchObject({
      code: "PACKING_REQUIRED",
      details: { stage: "WR" },
    });
  });

  it("mesin tidak ditemukan → MACHINE_NOT_FOUND", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([{ id: "pk1" }]); // packing HLP ada (prasyarat WR)
    h.db._selectResults.push([]); // machine select
    await expect(createBatchStageEvent({ ...baseInput, machineId: "m-x" })).rejects.toMatchObject({ code: "MACHINE_NOT_FOUND" });
  });

  it("HLP_SESSION_REQUIRED: tanpa sesi OPEN ditolak", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([{ id: "prev" }]); // prev WR ada (stage SLOP lolos sequence)
    h.db._selectResults.push([]); // tidak ada sesi HLP OPEN di plant
    await expect(
      createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 })
    ).rejects.toMatchObject({ code: "HLP_SESSION_REQUIRED" });
  });

  it("0032: isi per unit & sisa ikut tersimpan dan dikembalikan", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([{ id: "prev" }]); // prev WR ada → SLOP lolos sequence
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN
    h.db._returningResults.push({ id: "ev1", stage: "SLOP", inputQty: "9", outputQty: "0", rejectQty: "0", unit: "SLOP", isiPerUnit: 10, sisaQty: 9 });
    const res = await createBatchStageEvent({
      ...baseInput, stage: "SLOP", inputQty: 9, outputQty: 0, rejectQty: 0,
      isiPerUnit: 10, sisaQty: 9,
    });
    expect(res.isiPerUnit).toBe(10);
    expect(res.sisaQty).toBe(9);
  });

  // --- Konservasi lunak (docs/26 §7) ---

  it("konservasi pas (WR 1:1) → tanpa warning", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([{ id: "pk1" }]); // packing HLP ada (prasyarat WR)
    h.db._selectResults.push([{ id: "m1" }]); // machine
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN
    h.db._returningResults.push({ id: "ev1", stage: "WR", inputQty: "40", outputQty: "38", rejectQty: "2", unit: "PACK" });
    const res = await createBatchStageEvent({ ...baseInput, machineId: "m1" }); // 40 = 38 + 2
    expect(res.conservationWarning).toBeNull();
  });

  it("konservasi mismatch → warning, tetap diterima", async () => {
    h.db._selectResults.push([balBatch]);
    h.db._selectResults.push([{ id: "pk1" }]);
    h.db._selectResults.push([{ id: "m1" }]);
    h.db._selectResults.push([{ id: "s1" }]);
    h.db._returningResults.push({ id: "ev1", stage: "WR", inputQty: "40", outputQty: "30", rejectQty: "2", unit: "PACK" });
    const res = await createBatchStageEvent({ ...baseInput, machineId: "m1", outputQty: 30 }); // 40 ≠ 30 + 2
    expect(res.conservationWarning).toContain("tidak sesuai");
  });

  it("konservasi SLOP pakai isiPerUnit (10) → pas", async () => {
    h.db._selectResults.push([balBatch]);
    h.db._selectResults.push([{ id: "prev" }]); // prev WR ada → lolos sequence
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN
    h.db._returningResults.push({ id: "ev1", stage: "SLOP", inputQty: "47", outputQty: "4", rejectQty: "0", unit: "SLOP", isiPerUnit: 10, sisaQty: 7 });
    const res = await createBatchStageEvent({
      ...baseInput, stage: "SLOP", inputQty: 47, outputQty: 4, rejectQty: 0,
      isiPerUnit: 10, sisaQty: 7,
    }); // 4 × 10 + 0 + 7 = 47
    expect(res.conservationWarning).toBeNull();
  });

  // --- Sink pool rijekan (docs/26 §3.2) ---

  it("reject stage → entry IN_STAGE_REJECT masuk ledger", async () => {
    h.db._selectResults.push([balBatch]); // batch (alur create)
    h.db._selectResults.push([{ id: "pk1" }]);
    h.db._selectResults.push([{ id: "m1" }]);
    h.db._selectResults.push([{ id: "s1" }]);
    h.db._returningResults.push({ id: "ev1", stage: "WR", inputQty: "40", outputQty: "38", rejectQty: "2", unit: "PACK" });
    // derive sink: batch tanpa shiftReportId → langsung INTERNAL
    h.db._selectResults.push([
      { source: "INTERNAL", isMakloonTsg: false, makloonOrderId: null, shiftReportId: null },
    ]);
    await createBatchStageEvent({ ...baseInput, machineId: "m1" });
    // tunggu fire-and-forget selesai (mikrotask + timer flush)
    await new Promise((r) => setTimeout(r, 0));
    const ins = h.db.calls.filter(
      (c: any) => c.kind === "insert" && c.values?.entryType === "IN_STAGE_REJECT"
    );
    expect(ins).toHaveLength(1);
    expect(ins[0].values.unit).toBe("PACK");
    expect(ins[0].values.quantity).toBe("2");
    expect(ins[0].values.origin).toBe("INTERNAL");
  });

  it("sukses → insert event + stage naik ke WRAPPED", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([{ id: "pk1" }]); // packing HLP ada (prasyarat WR)
    h.db._selectResults.push([{ id: "m1" }]); // machine
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN mesin
    h.db._returningResults.push({ id: "ev1", stage: "WR", inputQty: "40", outputQty: "38", rejectQty: "2", unit: "PACK" }); // insert returning
    const res = await createBatchStageEvent({ ...baseInput, machineId: "m1" });
    expect(res.inputQty).toBe(40);
    expect(res.outputQty).toBe(38);
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd).toBeTruthy();
    expect(upd.set.stage).toBe("WRAPPED");
  });

  it("stage tidak turun (event SLOP tidak menurunkan batch BALED)", async () => {
    h.db._selectResults.push([{ ...balBatch, stage: "BALED" }]);
    h.db._selectResults.push([{ id: "prev" }]); // prev stage WR ada → lolos sequence
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN
    h.db._returningResults.push({ id: "ev1", stage: "SLOP", inputQty: "1", outputQty: "1", rejectQty: "0", unit: "SLOP" });
    await createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 });
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd).toBeUndefined(); // tidak ada update karena rank tidak naik
  });

  // --- Validasi target (0030) ---

  it("STAGE_NOT_IN_TARGET: target PACK menolak WR", async () => {
    h.db._selectResults.push([{ ...balBatch, targetUnit: "PACK" }]);
    await expect(createBatchStageEvent(baseInput)).rejects.toMatchObject({
      code: "STAGE_NOT_IN_TARGET",
      details: { targetUnit: "PACK", stage: "WR" },
    });
  });

  it("STAGE_NOT_IN_TARGET: target PACK_WRAP menolak SLOP", async () => {
    h.db._selectResults.push([{ ...balBatch, targetUnit: "PACK_WRAP" }]);
    await expect(
      createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 })
    ).rejects.toMatchObject({ code: "STAGE_NOT_IN_TARGET" });
  });

  it("STAGE_SEQUENCE_REQUIRED: target BAL menolak SLOP sebelum WR", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([]); // prev WR tidak ada
    await expect(
      createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 })
    ).rejects.toMatchObject({
      code: "STAGE_SEQUENCE_REQUIRED",
      details: { missingStage: "WR", stage: "SLOP" },
    });
  });

  it("STAGE_SEQUENCE_REQUIRED: target BAL menolak BAL tanpa WR & SLOP (cek prev SLOP)", async () => {
    h.db._selectResults.push([balBatch]); // batch
    h.db._selectResults.push([]); // prev SLOP tidak ada
    await expect(
      createBatchStageEvent({ ...baseInput, stage: "BAL", inputQty: 1, outputQty: 1, rejectQty: 0 })
    ).rejects.toMatchObject({ code: "STAGE_SEQUENCE_REQUIRED" });
  });

  it("batch EXTERNAL (makloon) bebas dari validasi target — model entry/exit stage", async () => {
    h.db._selectResults.push([{ ...balBatch, source: "EXTERNAL" }]); // batch
    h.db._selectResults.push([{ id: "s1" }]); // sesi HLP OPEN (tetap wajib, semua batch)
    h.db._returningResults.push({ id: "ev1", stage: "SLOP", inputQty: "1", outputQty: "1", rejectQty: "0", unit: "SLOP" });
    const res = await createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 });
    expect(res.stage).toBe("SLOP"); // tidak ada cek prev WR
  });
});

describe("setBatchTarget", () => {
  it("happy path: set target + audit", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", targetUnit: "PACK" }]); // batch
    h.db._selectResults.push([]); // recordedStages kosong
    const res = await setBatchTarget({ batchId: "b1", targetUnit: "BAL", actorUserId: "u1" });
    expect(res.targetUnit).toBe("BAL");
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd.set).toEqual({ targetUnit: "BAL" });
  });

  it("target sama → no-op tanpa update", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", targetUnit: "BAL" }]);
    const res = await setBatchTarget({ batchId: "b1", targetUnit: "BAL", actorUserId: "u1" });
    expect(res.targetUnit).toBe("BAL");
    expect(h.db.calls.find((c: any) => c.kind === "update")).toBeUndefined();
  });

  it("TARGET_CHANGE_REASON_REQUIRED saat sudah ada event tanpa alasan", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", targetUnit: "PACK" }]);
    h.db._selectResults.push([{ stage: "WR" }]);
    await expect(
      setBatchTarget({ batchId: "b1", targetUnit: "BAL", actorUserId: "u1" })
    ).rejects.toMatchObject({ code: "TARGET_CHANGE_REASON_REQUIRED" });
  });

  it("dengan alasan → update + audit before/after", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", targetUnit: "PACK" }]);
    h.db._selectResults.push([{ stage: "WR" }]);
    const res = await setBatchTarget({ batchId: "b1", targetUnit: "BAL", reason: "kualitas bagus", actorUserId: "u1" });
    expect(res.targetUnit).toBe("BAL");
  });

  it("TARGET_CONFLICTS_EVENTS: event SLOP sudah ada, target PACK_WRAP tidak mencakupnya", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", targetUnit: "BAL" }]);
    h.db._selectResults.push([{ stage: "WR" }, { stage: "SLOP" }]);
    await expect(
      setBatchTarget({ batchId: "b1", targetUnit: "PACK_WRAP", reason: "ubah", actorUserId: "u1" })
    ).rejects.toMatchObject({
      code: "TARGET_CONFLICTS_EVENTS",
      details: { targetUnit: "PACK_WRAP", conflictingStage: "SLOP" },
    });
  });
});

describe("listBatchStageEvents", () => {
  it("mengembalikan daftar event", async () => {
    h.db._selectResults.push([{ id: "ev1", stage: "WR", inputQty: "40", outputQty: "38", rejectQty: "2", unit: "PACK" }]);
    const res = await listBatchStageEvents("b1");
    expect(res).toHaveLength(1);
    expect(res[0].stage).toBe("WR");
  });
});
