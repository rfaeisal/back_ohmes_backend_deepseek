// Unit test rijekan.service — pool rijekan (docs/23 §5, docs/26 §3)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  addRijekanEntry,
  getRijekanOverview,
  deriveRijekanContextFromBatch,
  deriveRijekanContextFromShift,
  getRijekanPool,
  processRijekanReproses,
  returnRijekanMakloon,
} from "@/lib/services/rijekan.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

describe("addRijekanEntry", () => {
  it("insert entry dengan quantity string", async () => {
    await addRijekanEntry({ plantId: "p1", entryType: "IN_HLP_REJECT", quantity: 70, unit: "BATANG", refId: null, note: "SOBEK" });
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins).toBeTruthy();
    expect(ins.values.entryType).toBe("IN_HLP_REJECT");
    expect(ins.values.quantity).toBe("70");
    expect(ins.values.unit).toBe("BATANG");
  });

  it("insert entry menyimpan identitas lot (docs/26 §3)", async () => {
    await addRijekanEntry({
      plantId: "p1",
      entryType: "IN_STAGE_REJECT",
      quantity: 3,
      unit: "SLOP",
      tsgType: "MILD",
      origin: "MAKLOON",
      makloonOrderId: "o1",
    });
    const ins = h.db.calls.find((c: any) => c.kind === "insert");
    expect(ins.values.tsgType).toBe("MILD");
    expect(ins.values.origin).toBe("MAKLOON");
    expect(ins.values.makloonOrderId).toBe("o1");
  });

  it("skip kalau quantity <= 0", async () => {
    await addRijekanEntry({ plantId: "p1", entryType: "IN_HLP_REJECT", quantity: 0, unit: "BATANG" });
    expect(h.db.calls.some((c: any) => c.kind === "insert")).toBe(false);
  });
});

describe("deriveRijekanContextFromBatch", () => {
  it("internal tanpa order → jenis dari produk shift (0033)", async () => {
    h.db._selectResults.push([
      { source: "INTERNAL", isMakloonTsg: false, makloonOrderId: null, shiftReportId: "s1" },
    ]);
    h.db._selectResults.push([{ tsgType: "PUTIHAN" }]); // join shift→product
    const ctx = await deriveRijekanContextFromBatch("b1");
    expect(ctx).toEqual({ tsgType: "PUTIHAN", origin: "INTERNAL", makloonOrderId: null, makloonCustomer: null });
  });

  it("makloon dengan order → identitas dari order", async () => {
    h.db._selectResults.push([
      { source: "INTERNAL", isMakloonTsg: true, makloonOrderId: "o1", shiftReportId: "s1" },
    ]);
    h.db._selectResults.push([{ tsgType: "REGULER", customer: "PT. A" }]); // order
    const ctx = await deriveRijekanContextFromBatch("b1");
    expect(ctx.origin).toBe("MAKLOON");
    expect(ctx.tsgType).toBe("REGULER");
    expect(ctx.makloonOrderId).toBe("o1");
    expect(ctx.makloonCustomer).toBe("PT. A");
  });

  it("external tanpa order (data lama) → jenis tidak diketahui", async () => {
    h.db._selectResults.push([
      { source: "EXTERNAL", isMakloonTsg: false, makloonOrderId: null, shiftReportId: null },
    ]);
    const ctx = await deriveRijekanContextFromBatch("b1");
    expect(ctx).toEqual({ tsgType: null, origin: "MAKLOON", makloonOrderId: null, makloonCustomer: null });
  });
});

describe("deriveRijekanContextFromShift", () => {
  it("shift internal → INTERNAL + jenis produk", async () => {
    h.db._selectResults.push([{ tsgType: "MILD" }]); // shift→product
    h.db._selectResults.push([]); // tidak ada batch makloon
    const ctx = await deriveRijekanContextFromShift("s1");
    expect(ctx).toEqual({ tsgType: "MILD", origin: "INTERNAL", makloonOrderId: null, makloonCustomer: null });
  });

  it("shift dengan batch makloon → MAKLOON + order", async () => {
    h.db._selectResults.push([{ tsgType: "MILD" }]); // shift→product
    h.db._selectResults.push([{ makloonOrderId: "o1", makloonCustomer: "PT. B" }]); // batch makloon
    h.db._selectResults.push([{ customer: "PT. B" }]); // order
    const ctx = await deriveRijekanContextFromShift("s1");
    expect(ctx.origin).toBe("MAKLOON");
    expect(ctx.makloonOrderId).toBe("o1");
    expect(ctx.makloonCustomer).toBe("PT. B");
  });
});

describe("getRijekanOverview", () => {
  it("summary masuk/keluar/saldo per satuan (termasuk menir & stage)", async () => {
    h.db._selectResults.push([
      { entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10.5" },
      { entryType: "IN_MAKER_MENIR", unit: "KG", quantity: "4.5" },
      { entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "70" },
      { entryType: "IN_STAGE_REJECT", unit: "PACK", quantity: "12" },
      { entryType: "IN_STAGE_REJECT", unit: "SLOP", quantity: "3" },
      { entryType: "OUT_REPROSES", unit: "KG", quantity: "6" },
      { entryType: "OUT_REPROSES", unit: "BATANG", quantity: "50" },
    ]);
    const res = await getRijekanOverview("p1");
    // KG masuk = waste RIJEKAN + MENIR
    expect(res.summary.inKg).toBe(15);
    expect(res.summary.outKg).toBe(6);
    expect(res.summary.saldoKg).toBe(9);
    expect(res.summary.inBatang).toBe(70);
    expect(res.summary.outBatang).toBe(50);
    expect(res.summary.saldoBatang).toBe(20);
    expect(res.summary.inStage).toEqual({ PACK: 12, SLOP: 3, BAL: 0 });
    expect(res.summary.saldoStage).toEqual({ PACK: 12, SLOP: 3, BAL: 0 });
    expect(res.data).toHaveLength(7);
  });

  it("kosong → semua nol", async () => {
    h.db._selectResults.push([]);
    const res = await getRijekanOverview("p1");
    expect(res.summary).toEqual({
      inKg: 0, outKg: 0, saldoKg: 0,
      inBatang: 0, outBatang: 0, saldoBatang: 0,
      inStage: { PACK: 0, SLOP: 0, BAL: 0 },
      outStage: { PACK: 0, SLOP: 0, BAL: 0 },
      saldoStage: { PACK: 0, SLOP: 0, BAL: 0 },
    });
  });
});

describe("getRijekanPool", () => {
  it("saldo per kelompok + lot tersisa (dikurangi alokasi & return)", async () => {
    h.db._selectResults.push([
      { id: "e1", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10", origin: "INTERNAL", tsgType: "REGULER", makloonOrderId: null, createdAt: new Date() },
      { id: "e2", entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "70", origin: "MAKLOON", tsgType: "MILD", makloonOrderId: "o1", createdAt: new Date() },
      { id: "e3", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "5", origin: "INTERNAL", tsgType: "REGULER", makloonOrderId: null, createdAt: new Date() },
    ]);
    h.db._selectResults.push([{ ledgerEntryId: "e1", qty: "4" }]); // alokasi e1
    h.db._selectResults.push([]); // return item
    h.db._selectResults.push([{ id: "o1", customer: "PT. A" }]); // orders
    const res = await getRijekanPool("p1");

    const kg = res.groups.find((g) => g.origin === "INTERNAL" && g.unit === "KG" && g.tsgType === "REGULER");
    expect(kg?.availableQty).toBe(11); // (10-4) + 5
    const makloon = res.groups.find((g) => g.origin === "MAKLOON");
    expect(makloon?.availableQty).toBe(70);
    expect(makloon?.makloonCustomer).toBe("PT. A");

    const lot1 = res.lots.find((l) => l.id === "e1");
    expect(lot1?.availableQty).toBe(6);
    expect(res.lots).toHaveLength(3);
  });
});

describe("processRijekanReproses", () => {
  const okSelects = (lots: unknown[], allocs: unknown[] = [], returns: unknown[] = []) => {
    h.db._selectResults.push(lots); // lot
    h.db._selectResults.push(allocs); // alokasi
    h.db._selectResults.push(returns); // return item
    h.db._selectResults.push([{ id: "sup1" }]); // supplier SUP-INTERNAL
    h.db._selectResults.push([{ count: 2 }]); // receiving count hari ini
    h.db._selectResults.push([]); // boks hari ini (kode baru)
    h.db._returningResults.push({ id: "rcv1", receivingCode: "RCV-20260903-03" }); // header
    h.db._returningResults.push({ id: "rb1" }); // box
  };

  it("sukses: lot satu jenis → receiving + alokasi + OUT per satuan", async () => {
    okSelects([
      { id: "lot1", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10", origin: "INTERNAL", tsgType: "REGULER", makloonOrderId: null, createdAt: new Date() },
    ]);
    const res = await processRijekanReproses({
      plantId: "p1", actorUserId: "u1", tsgType: "REGULER",
      lots: [{ ledgerEntryId: "lot1", qty: 7 }], weightKg: 9.8,
    });
    expect(res.receivingCode).toBe("RCV-20260903-03");
    expect(res.beratAcuan).toEqual({ KG: 7 });

    const allocIns = h.db.calls.filter(
      (c: any) => c.kind === "insert" && c.values?.reprosesReceivingId != null
    );
    expect(allocIns).toHaveLength(1);
    expect(allocIns[0].values.qty).toBe("7");

    const outIns = h.db.calls.filter(
      (c: any) => c.kind === "insert" && c.values?.entryType === "OUT_REPROSES"
    );
    expect(outIns).toHaveLength(1);
    expect(outIns[0].values.quantity).toBe("7");
    expect(outIns[0].values.unit).toBe("KG");
  });

  it("RIJEKAN_TYPE_MISMATCH: lot beda jenis ditolak", async () => {
    h.db._selectResults.push([
      { id: "lot1", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10", origin: "INTERNAL", tsgType: "MILD", makloonOrderId: null, createdAt: new Date() },
    ]);
    await expect(
      processRijekanReproses({ plantId: "p1", actorUserId: "u1", tsgType: "REGULER", lots: [{ ledgerEntryId: "lot1", qty: 5 }], weightKg: 5 })
    ).rejects.toMatchObject({ code: "RIJEKAN_TYPE_MISMATCH" });
  });

  it("RIJEKAN_MAKLOON_RESTRICTED: rijek makloon tidak boleh di-reproses", async () => {
    h.db._selectResults.push([
      { id: "lot1", entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "10", origin: "MAKLOON", tsgType: "REGULER", makloonOrderId: "o1", createdAt: new Date() },
    ]);
    await expect(
      processRijekanReproses({ plantId: "p1", actorUserId: "u1", tsgType: "REGULER", lots: [{ ledgerEntryId: "lot1", qty: 5 }], weightKg: 5 })
    ).rejects.toMatchObject({ code: "RIJEKAN_MAKLOON_RESTRICTED" });
  });

  it("RIJEKAN_INSUFFICIENT: porsi melebihi sisa lot", async () => {
    h.db._selectResults.push([
      { id: "lot1", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10", origin: "INTERNAL", tsgType: "REGULER", makloonOrderId: null, createdAt: new Date() },
    ]);
    h.db._selectResults.push([{ ledgerEntryId: "lot1", qty: "6" }]); // sudah teralokasi 6
    h.db._selectResults.push([]);
    await expect(
      processRijekanReproses({ plantId: "p1", actorUserId: "u1", tsgType: "REGULER", lots: [{ ledgerEntryId: "lot1", qty: 5 }], weightKg: 5 })
    ).rejects.toMatchObject({ code: "RIJEKAN_INSUFFICIENT" });
  });
});

describe("returnRijekanMakloon", () => {
  it("sukses: semua lot MAKLOON order ditandai returned + header", async () => {
    h.db._selectResults.push([{ id: "o1", plantId: "p1", customer: "PT. A", code: "MKL-1" }]); // order
    h.db._selectResults.push([
      { id: "e1", entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "50", origin: "MAKLOON", makloonOrderId: "o1" },
      { id: "e2", entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "2.5", origin: "MAKLOON", makloonOrderId: "o1" },
    ]);
    h.db._selectResults.push([]); // alokasi
    h.db._selectResults.push([]); // return lama
    h.db._returningResults.push({ id: "r1" }); // header return
    const res = await returnRijekanMakloon({
      plantId: "p1", actorUserId: "u1", makloonOrderId: "o1",
    });
    expect(res.returnId).toBe("r1");
    expect(res.customer).toBe("PT. A");
    expect(res.items).toEqual([
      { unit: "BATANG", qty: 50 },
      { unit: "KG", qty: 2.5 },
    ]);
    const updates = h.db.calls.filter(
      (c: any) => c.kind === "update" && c.set?.returnedAt != null
    );
    expect(updates).toHaveLength(2);
    expect(updates[0].set.returnedAt).toBeTruthy();
  });

  it("NOTHING_TO_RETURN: tidak ada sisa waste makloon", async () => {
    h.db._selectResults.push([{ id: "o1", plantId: "p1", customer: "PT. A", code: "MKL-1" }]);
    h.db._selectResults.push([
      { id: "e1", entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "50", origin: "MAKLOON", makloonOrderId: "o1" },
    ]);
    h.db._selectResults.push([{ ledgerEntryId: "e1", qty: "50" }]); // sudah teralokasi penuh
    h.db._selectResults.push([]);
    await expect(
      returnRijekanMakloon({ plantId: "p1", actorUserId: "u1", makloonOrderId: "o1" })
    ).rejects.toMatchObject({ code: "NOTHING_TO_RETURN" });
  });

  it("ORDER_NOT_FOUND: order bukan milik pabrik", async () => {
    h.db._selectResults.push([]);
    await expect(
      returnRijekanMakloon({ plantId: "p1", actorUserId: "u1", makloonOrderId: "o-x" })
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
