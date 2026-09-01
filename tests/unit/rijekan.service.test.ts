// Unit test rijekan.service — ledger rijekan (docs/23 §5)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});

import { addRijekanEntry, getRijekanOverview } from "@/lib/services/rijekan.service";

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

  it("skip kalau quantity <= 0", async () => {
    await addRijekanEntry({ plantId: "p1", entryType: "IN_HLP_REJECT", quantity: 0, unit: "BATANG" });
    expect(h.db.calls.some((c: any) => c.kind === "insert")).toBe(false);
  });
});

describe("getRijekanOverview", () => {
  it("summary masuk/keluar/saldo per satuan", async () => {
    h.db._selectResults.push([
      { entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "10.5" },
      { entryType: "IN_MAKER_WASTE", unit: "KG", quantity: "4.5" },
      { entryType: "IN_HLP_REJECT", unit: "BATANG", quantity: "70" },
      { entryType: "OUT_REPROSES", unit: "KG", quantity: "6" },
      { entryType: "OUT_REPROSES", unit: "BATANG", quantity: "50" },
    ]);
    const res = await getRijekanOverview("p1");
    expect(res.summary.inKg).toBe(15);
    expect(res.summary.outKg).toBe(6);
    expect(res.summary.saldoKg).toBe(9);
    expect(res.summary.inBatang).toBe(70);
    expect(res.summary.outBatang).toBe(50);
    expect(res.summary.saldoBatang).toBe(20);
    expect(res.data).toHaveLength(5);
  });

  it("kosong → semua nol", async () => {
    h.db._selectResults.push([]);
    const res = await getRijekanOverview("p1");
    expect(res.summary).toEqual({ inKg: 0, outKg: 0, saldoKg: 0, inBatang: 0, outBatang: 0, saldoBatang: 0 });
  });
});
