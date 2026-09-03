// Unit test — blokir packing HLP untuk batch produk final batangan (docs/26 §1)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import { hlpPackInput } from "@/lib/services/box.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

const baseInput = {
  plantId: "p1",
  batchId: "b1",
  hlpMachineId: "m1",
  packsLolos: 10,
  isiPerPack: 20,
  rejectBatangan: 0,
  operatorBy: "u1",
};

describe("hlpPackInput — target BATANGAN", () => {
  it("BATANGAN_FINAL: batch target BATANGAN ditolak packing HLP", async () => {
    h.db._selectResults.push([]); // belum ada hlp_pack untuk batch ini
    h.db._selectResults.push([
      { id: "b1", code: "btc_01", batanganKg: "10", targetUnit: "BATANGAN" },
    ]);
    await expect(hlpPackInput(baseInput)).rejects.toMatchObject({
      code: "BATANGAN_FINAL",
    });
  });
});
