// Unit test supplier-sj.service — weigh/assign & void label SJ
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  weighSupplierSjBox,
  voidSupplierSjLabel,
  receiveFromSupplierSj,
} from "@/lib/services/supplier-sj.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

describe("weighSupplierSjBox", () => {
  const base = {
    supplierSjId: "sj1",
    boxCode: "TSG-20260901-001",
    tsgType: "REGULER" as const,
    supplierWeightKg: 30.5,
    actorUserId: "u1",
  };

  it("SJ tidak ditemukan", async () => {
    h.db._selectResults.push([]);
    await expect(weighSupplierSjBox(base)).rejects.toMatchObject({ code: "SJ_NOT_FOUND" });
  });

  it("SJ bukan DRAFT ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "SHIPPED" }]);
    await expect(weighSupplierSjBox(base)).rejects.toMatchObject({ code: "SJ_NOT_DRAFT" });
  });

  it("berat di luar rentang ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT" }]);
    await expect(weighSupplierSjBox({ ...base, supplierWeightKg: 0 })).rejects.toMatchObject({ code: "INVALID_BOX_WEIGHT" });
  });

  it("label VOID ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT" }]);
    h.db._selectResults.push([{ id: "b1", supplierSjId: null, createdBy: "u1", labelStatus: "VOID" }]);
    await expect(weighSupplierSjBox(base)).rejects.toMatchObject({ code: "LABEL_VOIDED" });
  });

  it("label terikat SJ lain ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT" }]);
    h.db._selectResults.push([{ id: "b1", supplierSjId: "sj-lain", createdBy: "u1", labelStatus: "ASSIGNED", supplierWeightKg: null }]);
    await expect(weighSupplierSjBox(base)).rejects.toMatchObject({ code: "LABEL_ALREADY_ASSIGNED" });
  });

  it("label sudah ditimbang di SJ ini ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT" }]);
    h.db._selectResults.push([{ id: "b1", supplierSjId: "sj1", createdBy: "u1", labelStatus: "ASSIGNED", supplierWeightKg: "29.5" }]);
    await expect(weighSupplierSjBox(base)).rejects.toMatchObject({ code: "LABEL_ALREADY_WEIGHED" });
  });

  it("assign pool tanpa jenis TSG ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT" }]);
    h.db._selectResults.push([{ id: "b1", supplierSjId: null, createdBy: "u1", labelStatus: "AVAILABLE", supplierWeightKg: null }]);
    await expect(weighSupplierSjBox({ ...base, tsgType: undefined })).rejects.toMatchObject({ code: "INVALID_TSG_TYPE" });
  });

  it("sukses assign pool → ASSIGNED + plant ikut SJ", async () => {
    h.db._selectResults.push([{ id: "sj1", status: "DRAFT", plantId: "plant-a" }]);
    h.db._selectResults.push([{ id: "b1", supplierSjId: null, createdBy: "u1", labelStatus: "AVAILABLE", supplierWeightKg: null }]);
    h.db._returningResults.push({ id: "b1", boxCode: base.boxCode, tsgType: "REGULER", labelStatus: "ASSIGNED", supplierWeightKg: "30.5" });
    const res = await weighSupplierSjBox(base);
    expect(res.labelStatus).toBe("ASSIGNED");
    const upd = h.db.calls.find((c: any) => c.kind === "update" && c.set?.labelStatus === "ASSIGNED");
    expect(upd).toBeTruthy();
    expect(upd.set.plantId).toBe("plant-a");
    expect(upd.set.tsgType).toBe("REGULER");
  });
});

describe("voidSupplierSjLabel", () => {
  const base = { boxCode: "TSG-20260901-001", actorUserId: "u1" };

  it("label tidak ditemukan", async () => {
    h.db._selectResults.push([]);
    await expect(voidSupplierSjLabel(base)).rejects.toMatchObject({ code: "LABEL_NOT_FOUND" });
  });

  it("label bukan AVAILABLE ditolak", async () => {
    h.db._selectResults.push([{ id: "b1", supplierSjId: "sj1", createdBy: "u1", labelStatus: "ASSIGNED" }]);
    await expect(voidSupplierSjLabel(base)).rejects.toMatchObject({ code: "LABEL_NOT_AVAILABLE" });
  });

  it("sukses → VOID + alasan", async () => {
    h.db._selectResults.push([{ id: "b1", supplierSjId: null, createdBy: "u1", labelStatus: "AVAILABLE" }]);
    h.db._returningResults.push({ id: "b1", boxCode: base.boxCode, labelStatus: "VOID", voidReason: "rusak" });
    const res = await voidSupplierSjLabel({ ...base, reason: "rusak" });
    expect(res.labelStatus).toBe("VOID");
    expect(res.voidReason).toBe("rusak");
  });
});

describe("receiveFromSupplierSj (finalisasi SJ → receiving + inventory, 0031)", () => {
  it("sukses + propagasi makloon ke receiving & inventory", async () => {
    h.db._selectResults.push(
      [{ id: "sj1", plantId: "p1", status: "SHIPPED", sjNumber: "SJ-1", supplierId: "sup1" }], // sj
      [{ id: "b1", supplierSjId: "sj1", boxCode: "TSG-20260901-001", supplierWeightKg: "25", tsgType: "MILD", labelStatus: "ASSIGNED" }], // boxes
      [{ count: 0 }] // existing receiving count
    );
    h.db._returningResults.push({ id: "r1", receivingCode: "RCV-1" }); // header insert
    h.db._returningResults.push({ id: "rb1" }); // receiving box insert
    h.db._returningResults.push(undefined); // inventory insert
    h.db._returningResults.push(undefined); // sj update

    const res = await receiveFromSupplierSj({
      supplierSjId: "sj1",
      plantId: "p1",
      actorUserId: "u1",
      isMakloon: true,
      makloonCustomer: "PT Makloon Jaya",
      makloonTarget: "BAL",
    });
    expect(res.sjStatus).toBe("RECEIVED");
    const invIns = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.status === "AVAILABLE");
    expect(invIns.values).toMatchObject({ isMakloon: true, makloonCustomer: "PT Makloon Jaya", makloonTarget: "BAL" });
    const hdrIns = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.source === "SJ");
    expect(hdrIns.values).toMatchObject({ isMakloon: true, makloonCustomer: "PT Makloon Jaya", makloonTarget: "BAL" });
  });

  it("SJ bukan SHIPPED ditolak", async () => {
    h.db._selectResults.push([{ id: "sj1", plantId: "p1", status: "DRAFT" }]);
    await expect(
      receiveFromSupplierSj({ supplierSjId: "sj1", plantId: "p1", actorUserId: "u1" })
    ).rejects.toMatchObject({ code: "SJ_NOT_SHIPPED" });
  });
});
