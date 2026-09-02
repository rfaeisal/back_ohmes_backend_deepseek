// Unit test wms-outbound.service — generalisasi karton multi-satuan (0029)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  addContentToCarton,
  autoCreateFinishedGoods,
  confirmReceiving,
  getStageAvailability,
} from "@/lib/services/wms-outbound.service";
import { getBatchSisaSummary, weighBoxSession } from "@/lib/services/box.service";
import { approveReceiving } from "@/lib/services/wms-inbound.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
  h.db._executeResults.length = 0;
});

const openPackCarton = { id: "c1", status: "OPEN", capacityPack: 50, unit: "PACK" };
const openSlopCarton = { id: "c2", status: "OPEN", capacityPack: 30, unit: "SLOP" };

describe("addContentToCarton — HLP_PACK", () => {
  it("happy path: upsert + recompute actualPackCount", async () => {
    h.db._selectResults.push(
      [openPackCarton],            // ctn
      [{ total: 10 }],             // fill
      [{ packsLolos: 30 }],        // pack
      [{ total: 10 }],             // allocated HLP
      [{ total: 12 }]              // count after upsert
    );
    const res = await addContentToCarton({
      cartonId: "c1", plantId: "p1", addedBy: "u1",
      sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 2,
    });
    expect(res).toEqual({ cartonId: "c1", packCount: 12, remainingCapacity: 38 });
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values).toMatchObject({ sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 2 });
    const upd = h.db.calls.filter((c: any) => c.kind === "update");
    expect(upd.some((u: any) => u.set?.actualPackCount === 12)).toBe(true);
  });

  it("INVALID_PACK_QTY untuk qty < 1", async () => {
    await expect(
      addContentToCarton({ cartonId: "c1", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 0 })
    ).rejects.toMatchObject({ code: "INVALID_PACK_QTY" });
  });

  it("CARTON_NOT_OPEN untuk karton READY", async () => {
    h.db._selectResults.push([{ ...openPackCarton, status: "READY" }]);
    await expect(
      addContentToCarton({ cartonId: "c1", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 1 })
    ).rejects.toMatchObject({ code: "CARTON_NOT_OPEN" });
  });

  it("CARTON_FULL saat melebihi kapasitas", async () => {
    h.db._selectResults.push([openPackCarton], [{ total: 49 }]);
    await expect(
      addContentToCarton({ cartonId: "c1", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 2 })
    ).rejects.toMatchObject({ code: "CARTON_FULL" });
  });

  it("PACK_NOT_FOUND", async () => {
    h.db._selectResults.push([openPackCarton], [{ total: 0 }], []);
    await expect(
      addContentToCarton({ cartonId: "c1", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hpX", packQty: 1 })
    ).rejects.toMatchObject({ code: "PACK_NOT_FOUND" });
  });

  it("PACK_INSUFFICIENT saat sisa batch tidak cukup", async () => {
    h.db._selectResults.push([openPackCarton], [{ total: 0 }], [{ packsLolos: 10 }], [{ total: 8 }]);
    await expect(
      addContentToCarton({ cartonId: "c1", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 3 })
    ).rejects.toMatchObject({ code: "PACK_INSUFFICIENT" });
  });

  it("UNIT_MISMATCH: pack HLP ke karton SLOP", async () => {
    h.db._selectResults.push([openSlopCarton], [{ total: 0 }]);
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "HLP_PACK", hlpPackId: "hp1", packQty: 1 })
    ).rejects.toMatchObject({ code: "UNIT_MISMATCH" });
  });
});

describe("addContentToCarton — STAGE", () => {
  it("happy path: hasil SLOP ke karton SLOP", async () => {
    h.db._selectResults.push(
      [openSlopCarton],
      [{ total: 0 }],
      [{ id: "b1", source: "INTERNAL", code: "btc_1" }],
      [{ total: 20 }],
      [{ total: 5 }],
      [{ total: 0 }],
      [{ total: 3 }]
    );
    const res = await addContentToCarton({
      cartonId: "c2", plantId: "p1", addedBy: "u1",
      sourceType: "STAGE", batchId: "b1", stage: "SLOP", packQty: 3,
    });
    expect(res.packCount).toBe(3);
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values).toMatchObject({ sourceType: "STAGE", batchId: "b1", stage: "SLOP", packQty: 3 });
    expect(ins.values.hlpPackId).toBeUndefined();
  });

  it("UNIT_MISMATCH: hasil WR (unit PACK) ke karton SLOP", async () => {
    h.db._selectResults.push([openSlopCarton], [{ total: 0 }]);
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "STAGE", batchId: "b1", stage: "WR", packQty: 1 })
    ).rejects.toMatchObject({ code: "UNIT_MISMATCH" });
  });

  it("BATCH_NOT_FOUND", async () => {
    h.db._selectResults.push([openSlopCarton], [{ total: 0 }], []);
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "STAGE", batchId: "bX", stage: "SLOP", packQty: 1 })
    ).rejects.toMatchObject({ code: "BATCH_NOT_FOUND" });
  });

  it("NOT_INTERNAL_BATCH untuk batch EXTERNAL", async () => {
    h.db._selectResults.push(
      [openSlopCarton],
      [{ total: 0 }],
      [{ id: "b1", source: "EXTERNAL", code: "btx_1" }]
    );
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "STAGE", batchId: "b1", stage: "SLOP", packQty: 1 })
    ).rejects.toMatchObject({ code: "NOT_INTERNAL_BATCH" });
  });

  it("STAGE_OUTPUT_INSUFFICIENT saat sisa (out − in next − allocated) kurang", async () => {
    h.db._selectResults.push(
      [openSlopCarton],
      [{ total: 0 }],
      [{ id: "b1", source: "INTERNAL", code: "btc_1" }],
      [{ total: 10 }],
      [{ total: 8 }],
      [{ total: 1 }]
    );
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "STAGE", batchId: "b1", stage: "SLOP", packQty: 2 })
    ).rejects.toMatchObject({ code: "STAGE_OUTPUT_INSUFFICIENT" });
  });

  it("STAGE_OUTPUT_INSUFFICIENT saat stage kosong (available 0)", async () => {
    h.db._selectResults.push(
      [openSlopCarton],
      [{ total: 0 }],
      [{ id: "b1", source: "INTERNAL", code: "btc_1" }],
      [{ total: 0 }],
      [{ total: 0 }],
      [{ total: 0 }]
    );
    await expect(
      addContentToCarton({ cartonId: "c2", plantId: "p1", addedBy: "u1", sourceType: "STAGE", batchId: "b1", stage: "SLOP", packQty: 1 })
    ).rejects.toMatchObject({ code: "STAGE_OUTPUT_INSUFFICIENT" });
  });
});

describe("autoCreateFinishedGoods — per unit", () => {
  it("PACK saja saat tidak ada stage event", async () => {
    h.db._selectResults.push(
      [],                                    // existing rows
      [{ id: "s1", plantId: "p1" }],         // shift
      [{ total: 25 }],                       // packs
      [],                                    // stageRows
      [{ id: "f1", unit: "PACK", shiftReportId: "s1", packsExpectedCount: 25, status: "PENDING" }]
    );
    const rows = await autoCreateFinishedGoods("s1");
    expect(rows).toHaveLength(1);
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values).toHaveLength(1);
    expect(ins.values[0]).toMatchObject({ unit: "PACK", packsExpectedCount: 25 });
  });

  it("SLOP = max(0, out SLOP − in BAL); BAL = out BAL", async () => {
    h.db._selectResults.push(
      [],
      [{ id: "s1", plantId: "p1" }],
      [{ total: 25 }],
      [
        { stage: "SLOP", outTotal: 16, inTotal: 14 },
        { stage: "BAL", outTotal: 13, inTotal: 14 },
      ],
      [{ id: "f1", unit: "PACK", packsExpectedCount: 25 }]
    );
    await autoCreateFinishedGoods("s1");
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    const byUnit = Object.fromEntries(ins.values.map((v: any) => [v.unit, v.packsExpectedCount]));
    expect(byUnit.PACK).toBe(25);
    expect(byUnit.SLOP).toBe(2);  // 16 − 14
    expect(byUnit.BAL).toBe(13);
  });

  it("idempotent: unit yang sudah ada tidak di-insert ulang", async () => {
    h.db._selectResults.push(
      [{ id: "f1", unit: "PACK", status: "PENDING" }],
      [{ id: "s1", plantId: "p1" }],
      [{ total: 25 }],
      [],
      [{ id: "f1", unit: "PACK", status: "PENDING" }]
    );
    await autoCreateFinishedGoods("s1");
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins).toBeUndefined();
  });
});

describe("confirmReceiving — per unit", () => {
  it("CONFIRMED saat aktual = ekspektasi", async () => {
    h.db._selectResults.push(
      [{ id: "f1", unit: "PACK", shiftReportId: "s1", packsExpectedCount: 25, packsActualCount: null, status: "PENDING" }]
    );
    h.db._returningResults.push({ id: "f1", status: "CONFIRMED" });
    const res = await confirmReceiving("s1", "PACK", 25, "u1");
    expect(res).toMatchObject({ status: "CONFIRMED" });
    const upd = h.db.calls.find((c: any) => c.kind === "update");
    expect(upd.set).toMatchObject({ packsActualCount: 25, status: "CONFIRMED" });
  });

  it("DISPUTED saat aktual beda", async () => {
    h.db._selectResults.push(
      [{ id: "f1", unit: "SLOP", shiftReportId: "s1", packsExpectedCount: 2, packsActualCount: null, status: "PENDING" }]
    );
    h.db._returningResults.push({ id: "f1", status: "DISPUTED" });
    const res = await confirmReceiving("s1", "SLOP", 5, "u1");
    expect(res).toMatchObject({ status: "DISPUTED" });
  });

  it("ALREADY_CONFIRMED untuk baris terminal", async () => {
    h.db._selectResults.push(
      [{ id: "f1", unit: "PACK", shiftReportId: "s1", packsExpectedCount: 25, packsActualCount: 25, status: "CONFIRMED" }]
    );
    await expect(confirmReceiving("s1", "PACK", 25, "u1")).rejects.toMatchObject({ code: "ALREADY_CONFIRMED" });
  });
});

describe("getStageAvailability", () => {
  it("formula out − in next − allocated; omits stage tanpa output", async () => {
    h.db._selectResults.push(
      [{ total: 0 }],                        // Σout WR per plant = 0 → skip
      [{ total: 0 }],                        // Σout SLOP per plant = 0 → skip
      [{ total: 25 }],                       // Σout BAL per plant > 0
      [{ id: "b1", code: "btc_1" }],         // batches
      [{ total: 20 }],                       // out BAL b1 (BAL tidak ada next → tanpa query in)
      [{ total: 3 }]                         // allocated BAL b1
    );
    const rows = await getStageAvailability("p1");
    // SLOP: totalOutput 0 → tidak diproses; BAL tersedia 17
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      batchCode: "btc_1", stage: "BAL", unit: "BAL",
      outputTotal: 20, nextInput: 0, allocated: 3, available: 17,
    });
  });
});

describe("getBatchSisaSummary — sisa per stage dikurangi alokasi karton", () => {
  it("sisa WR = out WR − in SLOP − allocated WR", async () => {
    h.db._selectResults.push(
      [{ id: "b1", code: "btc_1", batanganKg: "100" }],   // batch
      [{ totalBatangPakai: 0, packsLolos: 0, rejectPacks: 0, rejectBatangan: 0 }], // agg hlp
      [],                                                  // lastPack
      [                                                    // stageRows
        { stage: "WR", inputQty: 0, outputQty: 24, rejectQty: 1 },
        { stage: "SLOP", inputQty: 18, outputQty: 16, rejectQty: 1 },
      ],
      [{ stage: "WR", total: 4 }]                          // allocated ke karton
    );
    const res = await getBatchSisaSummary("b1");
    const wr = res.stageBreakdown.find((s) => s.stage === "WR")!;
    expect(wr.sisaQty).toBe(2);   // 24 − 18 − 4
    expect(wr.allocatedToCarton).toBe(4);
    const slop = res.stageBreakdown.find((s) => s.stage === "SLOP")!;
    expect(slop.sisaQty).toBe(16); // 16 − 0 − 0
  });
});

describe("makloon (0031) — propagasi isMakloon", () => {
  it("approveReceiving meneruskan isMakloon ke inventory", async () => {
    h.db._selectResults.push(
      [{ id: "r1", plantId: "p1", approvalStatus: "PENDING", isMakloon: true }], // receiving
      [{ id: "rb1" }] // boxes
    );
    const res = await approveReceiving("r1", "p1", "u1");
    expect(res.inventoryCreated).toBe(1);
    const ins = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.status === "AVAILABLE");
    expect(ins.values).toMatchObject({ isMakloon: true, status: "AVAILABLE" });
  });

  it("weighBoxSession menandai batch isMakloonTsg bila ada boks makloon", async () => {
    h.db._selectResults.push(
      [{ id: "s1", shiftReportId: "sh1", plantId: "p1", status: "OPEN", batchId: null, totalBatanganKg: null, weighedAt: null }], // session
      [{ id: "b1", tsgWeightKg: "30", inventoryBoxId: "inv1", completedAt: null, outputWeightKg: null, yieldPct: null }, { id: "b2", tsgWeightKg: "20", inventoryBoxId: "inv2", completedAt: null, outputWeightKg: null, yieldPct: null }], // boxes
      [{ id: "sh1", machineId: "m1" }], // shift
      [{ code: "MKR01" }], // machine
      [{ isMakloon: true }], // inventory makloon check
      [{ productId: "prd1" }], // yield template shift
      [{ yieldMinPct: "110", yieldMaxPct: "114" }], // yield template
      [] // existing kode batch
    );
    h.db._returningResults.push({ id: "btc1", code: "btc_x" }); // insert batch
    h.db._returningResults.push(undefined, undefined); // update 2 boks
    h.db._returningResults.push(undefined); // update session
    const res = await weighBoxSession({ sessionId: "s1", totalBatanganKg: 55, actorUserId: "u1" });
    expect(res.batchCode).toMatch(/^btc_MKR01_\d{8}_\d{2}$/);
    const ins = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.isMakloonTsg === true);
    expect(ins.values.isMakloonTsg).toBe(true);
  });
});
