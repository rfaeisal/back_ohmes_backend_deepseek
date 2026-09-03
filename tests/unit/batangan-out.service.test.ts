// Unit test batangan-out.service — batangan keluar produk final (docs/26 §6)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  createBatanganOut,
  listBatanganOuts,
} from "@/lib/services/batangan-out.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

describe("createBatanganOut", () => {
  it("sukses INTERNAL dengan tujuan bebas", async () => {
    h.db._selectResults.push([
      { id: "b1", plantId: "p1", code: "btc_01", batanganKg: "10.5", makloonOrderId: null },
    ]);
    h.db._selectResults.push([]); // tidak ada keluar sebelumnya
    h.db._returningResults.push({ id: "o1", qtyKg: "3.5" });
    const res = await createBatanganOut({
      plantId: "p1",
      batchId: "b1",
      qtyKg: 3.5,
      destinationType: "INTERNAL",
      destinationName: "Pabrik Pamekasan",
      actorUserId: "u1",
    });
    expect(res.qtyKg).toBe(3.5);
    const ins = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.destinationName === "Pabrik Pamekasan");
    expect(ins).toBeTruthy();
    expect(ins.values.destinationType).toBe("INTERNAL");
    expect(ins.values.makloonOrderId).toBeNull();
  });

  it("batch makloon → tujuan & order diwarisi otomatis", async () => {
    h.db._selectResults.push([
      { id: "b1", plantId: "p1", code: "btc_01", batanganKg: "10", makloonOrderId: "o1" },
    ]);
    h.db._selectResults.push([{ id: "o1", customer: "PT. B" }]); // order
    h.db._selectResults.push([]); // tidak ada keluar sebelumnya
    h.db._returningResults.push({ id: "o2", qtyKg: "2" });
    const res = await createBatanganOut({
      plantId: "p1",
      batchId: "b1",
      qtyKg: 2,
      destinationType: "INTERNAL", // diabaikan — batch makloon
      destinationName: "asal-asalan",
      actorUserId: "u1",
    });
    expect(res.qtyKg).toBe(2);
    const ins = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.makloonOrderId === "o1");
    expect(ins).toBeTruthy();
    expect(ins.values.destinationType).toBe("MAKLOON");
    expect(ins.values.destinationName).toBe("PT. B");
  });

  it("BATANGAN_INSUFFICIENT: qty melebihi sisa batch", async () => {
    h.db._selectResults.push([
      { id: "b1", plantId: "p1", code: "btc_01", batanganKg: "10", makloonOrderId: null },
    ]);
    h.db._selectResults.push([{ qtyKg: "8" }]); // sudah keluar 8
    await expect(
      createBatanganOut({
        plantId: "p1",
        batchId: "b1",
        qtyKg: 3,
        destinationType: "INTERNAL",
        destinationName: "Pabrik Pamekasan",
        actorUserId: "u1",
      })
    ).rejects.toMatchObject({ code: "BATANGAN_INSUFFICIENT" });
  });

  it("DESTINATION_REQUIRED: tanpa tujuan & bukan makloon", async () => {
    h.db._selectResults.push([
      { id: "b1", plantId: "p1", code: "btc_01", batanganKg: "10", makloonOrderId: null },
    ]);
    await expect(
      createBatanganOut({ plantId: "p1", batchId: "b1", qtyKg: 1, destinationType: "INTERNAL", actorUserId: "u1" })
    ).rejects.toMatchObject({ code: "DESTINATION_REQUIRED" });
  });
});

describe("listBatanganOuts", () => {
  it("mengembalikan daftar dengan kode batch & nama petugas", async () => {
    h.db._selectResults.push([
      { id: "o1", batchCode: "btc_01", batanganKg: "10", qtyKg: "3", destinationType: "INTERNAL", destinationName: "Pabrik Pamekasan", makloonOrderId: null, orderCode: null, outByName: "Pak Plant Manager", outAt: new Date(), batangEst: null, docRef: null, notes: null },
    ]);
    const res = await listBatanganOuts("p1");
    expect(res).toHaveLength(1);
    expect(res[0]!.qtyKg).toBe(3);
    expect(res[0]!.batchCode).toBe("btc_01");
  });
});
