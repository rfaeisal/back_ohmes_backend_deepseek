// Unit test chain.service — catatan per-stage rantai produksi (docs/25)
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
  STAGE_UNIT,
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

describe("STAGE_UNIT", () => {
  it("satuan mengikuti stage", () => {
    expect(STAGE_UNIT.WR).toBe("PACK");
    expect(STAGE_UNIT.SLOP).toBe("SLOP");
    expect(STAGE_UNIT.BAL).toBe("BAL");
  });
});

describe("createBatchStageEvent", () => {
  it("batch tidak ditemukan → BATCH_NOT_FOUND", async () => {
    h.db._selectResults.push([]);
    await expect(createBatchStageEvent(baseInput)).rejects.toMatchObject({ code: "BATCH_NOT_FOUND" });
  });

  it("jumlah negatif ditolak", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", stage: "PACKED" }]);
    await expect(createBatchStageEvent({ ...baseInput, inputQty: -1 })).rejects.toMatchObject({ code: "INVALID_QTY" });
  });

  it("semua nol ditolak EMPTY_EVENT", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", stage: "PACKED" }]);
    await expect(
      createBatchStageEvent({ ...baseInput, inputQty: 0, outputQty: 0, rejectQty: 0 })
    ).rejects.toMatchObject({ code: "EMPTY_EVENT" });
  });

  it("mesin tidak ditemukan → MACHINE_NOT_FOUND", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", stage: "PACKED" }]);
    h.db._selectResults.push([]); // machine select
    await expect(createBatchStageEvent({ ...baseInput, machineId: "m-x" })).rejects.toMatchObject({ code: "MACHINE_NOT_FOUND" });
  });

  it("sukses → insert event + stage naik ke WRAPPED", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", stage: "PACKED" }]); // batch
    h.db._selectResults.push([{ id: "m1" }]); // machine
    h.db._returningResults.push({ id: "ev1", stage: "WR", inputQty: "40", outputQty: "38", rejectQty: "2", unit: "PACK" }); // insert returning
    const res = await createBatchStageEvent({ ...baseInput, machineId: "m1" });
    expect(res.inputQty).toBe(40);
    expect(res.outputQty).toBe(38);
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd).toBeTruthy();
    expect(upd.set.stage).toBe("WRAPPED");
  });

  it("stage tidak turun (event SLOP tidak menurunkan batch BALED)", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", stage: "BALED" }]);
    h.db._returningResults.push({ id: "ev1", stage: "SLOP", inputQty: "1", outputQty: "1", rejectQty: "0", unit: "SLOP" });
    await createBatchStageEvent({ ...baseInput, stage: "SLOP", inputQty: 1, outputQty: 1, rejectQty: 0 });
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd).toBeUndefined(); // tidak ada update karena rank tidak naik
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
