// Unit test hlp-session.service — sesi HLP open-ended (docs/23)
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/db", async () => {
  const { createMockDb } = await import("../helpers/mock-db");
  h.db = createMockDb();
  return { default: h.db };
});
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  openHlpShift,
  closeHlpShift,
  attachHlpShiftMember,
  leaveHlpShiftMember,
} from "@/lib/services/hlp-session.service";

beforeEach(() => {
  h.db.calls.length = 0;
  h.db._selectResults.length = 0;
  h.db._returningResults.length = 0;
});

describe("openHlpShift", () => {
  const base = { plantId: "p1", hlpMachineId: "m1", startedBy: "u1" };

  it("mesin tidak ditemukan", async () => {
    h.db._selectResults.push([]);
    await expect(openHlpShift(base)).rejects.toMatchObject({ code: "MACHINE_NOT_FOUND" });
  });

  it("mesin bukan HLP ditolak", async () => {
    h.db._selectResults.push([{ id: "m1", type: "MAKER", code: "MKR-01" }]);
    await expect(openHlpShift(base)).rejects.toMatchObject({ code: "NOT_HLP_MACHINE" });
  });

  it("sudah ada sesi OPEN → HLP_SHIFT_ALREADY_OPEN", async () => {
    h.db._selectResults.push([{ id: "m1", type: "HLP", code: "HLP-01" }]);
    h.db._selectResults.push([{ id: "s-lama" }]);
    await expect(openHlpShift(base)).rejects.toMatchObject({ code: "HLP_SHIFT_ALREADY_OPEN" });
  });

  it("sukses + anggota awal di-insert", async () => {
    h.db._selectResults.push([{ id: "m1", type: "HLP", code: "HLP-01" }]);
    h.db._selectResults.push([]); // tidak ada sesi open
    h.db._returningResults.push({ id: "s1", plantId: "p1", hlpMachineId: "m1", status: "OPEN", startedAt: new Date() });
    const res = await openHlpShift({ ...base, members: [{ userId: "u2", shiftRoleId: "r1" }] });
    expect(res.hlpShiftId).toBe("s1");
    const memberIns = h.db.calls.find((c: any) => c.kind === "insert" && c.values?.userId === "u2");
    expect(memberIns).toBeTruthy();
    expect(memberIns.values.shiftRoleId).toBe("r1");
  });
});

describe("closeHlpShift", () => {
  it("sesi tidak ditemukan", async () => {
    h.db._selectResults.push([]);
    await expect(closeHlpShift("s-x", "u1")).rejects.toMatchObject({ code: "HLP_SHIFT_NOT_FOUND" });
  });

  it("sesi sudah CLOSED ditolak", async () => {
    h.db._selectResults.push([{ id: "s1", status: "CLOSED", deletedAt: null }]);
    await expect(closeHlpShift("s1", "u1")).rejects.toMatchObject({ code: "HLP_SHIFT_NOT_OPEN" });
  });

  it("sukses → status CLOSED + anggota aktif dilepas", async () => {
    h.db._selectResults.push([{ id: "s1", status: "OPEN", deletedAt: null }]);
    h.db._returningResults.push({ id: "s1", status: "CLOSED", endedAt: new Date() });
    const res = await closeHlpShift("s1", "u1");
    expect(res.status).toBe("CLOSED");
    const updMember = h.db.calls.find((c: any) => c.kind === "update" && c.set?.leftAt != null);
    expect(updMember).toBeTruthy();
  });
});

describe("attachHlpShiftMember", () => {
  it("sesi CLOSED tidak bisa tambah anggota", async () => {
    h.db._selectResults.push([{ id: "s1", status: "CLOSED", deletedAt: null }]);
    await expect(attachHlpShiftMember("s1", "u2")).rejects.toMatchObject({ code: "HLP_SHIFT_NOT_OPEN" });
  });

  it("user sudah aktif ditolak", async () => {
    h.db._selectResults.push([{ id: "s1", status: "OPEN", deletedAt: null }]);
    h.db._selectResults.push([{ id: "mem1" }]);
    await expect(attachHlpShiftMember("s1", "u2")).rejects.toMatchObject({ code: "HLP_MEMBER_ALREADY_ACTIVE" });
  });

  it("sukses insert anggota", async () => {
    h.db._selectResults.push([{ id: "s1", status: "OPEN", deletedAt: null }]);
    h.db._selectResults.push([]);
    h.db._returningResults.push({ id: "mem1", hlpShiftId: "s1", userId: "u2", shiftRoleId: null });
    const res = await attachHlpShiftMember("s1", "u2");
    expect(res.id).toBe("mem1");
  });
});

describe("leaveHlpShiftMember", () => {
  it("anggota tidak ditemukan", async () => {
    h.db._selectResults.push([]);
    await expect(leaveHlpShiftMember("mem-x")).rejects.toMatchObject({ code: "HLP_MEMBER_NOT_FOUND" });
  });

  it("sudah lepas ditolak", async () => {
    h.db._selectResults.push([{ id: "mem1", leftAt: new Date() }]);
    await expect(leaveHlpShiftMember("mem1")).rejects.toMatchObject({ code: "HLP_MEMBER_ALREADY_LEFT" });
  });

  it("sukses set leftAt", async () => {
    h.db._selectResults.push([{ id: "mem1", userId: "u2", leftAt: null }]);
    h.db._returningResults.push({ id: "mem1", leftAt: new Date() });
    const res = await leaveHlpShiftMember("mem1");
    expect(res).toBeTruthy();
    expect(res!.leftAt).toBeTruthy();
  });
});
