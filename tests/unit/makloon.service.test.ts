// Unit test makloon.service — makloon multi-stage (docs/24 + 25 §4)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/services/fcm.service", () => ({
  notifyExternalBatanganPending: vi.fn().mockResolvedValue(undefined),
}));

import {
  createExternalPackOut,
  approveExternalReceiving,
} from "@/lib/services/makloon.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

describe("createExternalPackOut — validasi entry BATANGAN", () => {
  const base = {
    plantId: "p1",
    batchId: "b1",
    destinationName: "PT X",
    packQty: 10,
    rejectPackQty: 0,
    rejectBatangQty: 0,
    outBy: "u1",
  };

  it("batch bukan external ditolak", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btc_01", source: "INTERNAL", externalReceivingId: null }]);
    await expect(createExternalPackOut(base)).rejects.toMatchObject({ code: "NOT_EXTERNAL_BATCH" });
  });

  it("semua jumlah nol → EMPTY_OUT", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", source: "EXTERNAL", externalReceivingId: "r1" }]);
    await expect(createExternalPackOut({ ...base, packQty: 0 })).rejects.toMatchObject({ code: "EMPTY_OUT" });
  });

  it("entry BATANGAN belum packing → NOT_PACKED_YET", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", source: "EXTERNAL", externalReceivingId: "r1" }]);
    h.db._selectResults.push([{ entryStage: "BATANGAN", batanganKg: "50" }]); // receiving
    h.db._selectResults.push([]); // aggregate keluar
    h.db._selectResults.push([]); // hlpPack
    await expect(createExternalPackOut(base)).rejects.toMatchObject({ code: "NOT_PACKED_YET" });
  });

  it("pack melebihi packsLolos → PACK_EXCEEDS", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", source: "EXTERNAL", externalReceivingId: "r1" }]);
    h.db._selectResults.push([{ entryStage: "BATANGAN", batanganKg: "50" }]);
    h.db._selectResults.push([]); // aggregate
    h.db._selectResults.push([{ packsLolos: 5, rejectPacks: 0, rejectBatangan: 0 }]);
    await expect(createExternalPackOut(base)).rejects.toMatchObject({ code: "PACK_EXCEEDS" });
  });

  it("sukses insert dengan exitStage default PACK", async () => {
    h.db._selectResults.push([{ id: "b1", code: "btx_01", source: "EXTERNAL", externalReceivingId: "r1" }]);
    h.db._selectResults.push([{ entryStage: "BATANGAN", batanganKg: "50" }]);
    h.db._selectResults.push([]); // aggregate
    h.db._selectResults.push([{ packsLolos: 40, rejectPacks: 1, rejectBatangan: 5 }]);
    h.db._returningResults.push({ id: "o1", packQty: 10, batchCode: "btx_01" });
    const res = await createExternalPackOut(base);
    expect(res.id).toBe("o1");
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values.exitStage).toBe("PACK");
  });
});

describe("createExternalPackOut — validasi entry non-batangan", () => {
  it("reject batangan tidak berlaku → REJECT_BATANG_NOT_APPLICABLE", async () => {
    h.db._selectResults.push([{ id: "b2", code: "btx_02", source: "EXTERNAL", externalReceivingId: "r2" }]);
    h.db._selectResults.push([{ entryStage: "PACK_WRAPPED", batanganKg: "200" }]);
    h.db._selectResults.push([]); // aggregate
    await expect(
      createExternalPackOut({
        plantId: "p1", batchId: "b2", destinationName: "PT Y",
        packQty: 10, rejectPackQty: 0, rejectBatangQty: 5, outBy: "u1",
      })
    ).rejects.toMatchObject({ code: "REJECT_BATANG_NOT_APPLICABLE" });
  });

  it("melebihi entry → OUT_EXCEEDS_ENTRY", async () => {
    h.db._selectResults.push([{ id: "b2", code: "btx_02", source: "EXTERNAL", externalReceivingId: "r2" }]);
    h.db._selectResults.push([{ entryStage: "PACK_WRAPPED", batanganKg: "200" }]);
    h.db._selectResults.push([]); // aggregate
    await expect(
      createExternalPackOut({
        plantId: "p1", batchId: "b2", destinationName: "PT Y",
        packQty: 250, rejectPackQty: 0, rejectBatangQty: 0, outBy: "u1",
      })
    ).rejects.toMatchObject({ code: "OUT_EXCEEDS_ENTRY" });
  });

  it("sukses tanpa packing HLP (entry non-batangan)", async () => {
    h.db._selectResults.push([{ id: "b2", code: "btx_02", source: "EXTERNAL", externalReceivingId: "r2" }]);
    h.db._selectResults.push([{ entryStage: "PACK_WRAPPED", batanganKg: "200" }]);
    h.db._selectResults.push([]); // aggregate
    h.db._returningResults.push({ id: "o2", packQty: 150, batchCode: "btx_02" });
    const res = await createExternalPackOut({
      plantId: "p1", batchId: "b2", destinationName: "PT Y",
      packQty: 150, rejectPackQty: 0, rejectBatangQty: 0, exitStage: "SLOP", outBy: "u1",
    });
    expect(res.id).toBe("o2");
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values.exitStage).toBe("SLOP");
  });
});

describe("approveExternalReceiving", () => {
  it("status non-PENDING ditolak", async () => {
    h.db._selectResults.push([{ id: "r1", plantId: "p1", approvalStatus: "REJECTED" }]);
    await expect(approveExternalReceiving("r1", "p1", "u1")).rejects.toMatchObject({ code: "ALREADY_REJECTED" });
  });

  it("entry PACK_WRAPPED → batch lahir stage WRAPPED + kode btx_", async () => {
    h.db._selectResults.push([{
      id: "r2", plantId: "p1", approvalStatus: "PENDING",
      batanganKg: "200", entryStage: "PACK_WRAPPED", entryUnit: "PACK",
    }]);
    h.db._selectResults.push([]); // kode btx_ existing
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const expectedCode = `btx_${today}_01`;
    h.db._returningResults.push({ id: "b9", code: expectedCode });
    const res = await approveExternalReceiving("r2", "p1", "u1");
    expect(res.batchCode).toBe(expectedCode);
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values.source).toBe("EXTERNAL");
    expect(ins.values.stage).toBe("WRAPPED");
    expect(ins.values.batanganKg).toBe("0");
  });
});
