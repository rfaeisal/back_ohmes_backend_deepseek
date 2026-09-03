// 10_makloon_waste — rantai order makloon + pool waste + reproses + serah terima
// (docs/26). API-level (pola spec 09 — tanpa UI).
//
// Alur:
//   1) Order PT. A/B/C → receiving batangan PT. A (link order) → approve →
//      batch EXTERNAL bertarget SLOP + taut order.
//   2) HLP reject di batch makloon → sink ledger origin MAKLOON → pool →
//      serah terima ke customer + PDF berita acara.
//   3) Settle waste RIJEKAN/MENIR shift internal (spec 02) → sink origin
//      INTERNAL → pool → reproses → TSG baru masuk inventory AVAILABLE.
import { test, expect } from "./fixtures";
import type { BrowserContext } from "@playwright/test";
import { readState, skipIfMissing, writeState } from "./helpers/state";

const login = async (context: BrowserContext, username: string) => {
  const res = await context.request.post("/api/v1/auth/login", {
    data: { username, password: "12345678", deviceType: "WEB" },
  });
  expect(res.ok(), `login ${username}`).toBeTruthy();
  return (await res.json()).accessToken as string;
};

// Sink ledger fire-and-forget — poll sampai pool mencapai kondisi (max ±5 detik)
const pollPool = async (
  context: BrowserContext,
  token: string,
  pred: (pool: { groups: Array<Record<string, unknown>>; lots: Array<Record<string, unknown>> }) => boolean,
  label: string
) => {
  for (let i = 0; i < 20; i++) {
    const res = await context.request.get("/api/v1/rijekan", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pool = ((await res.json()).pool ?? { groups: [], lots: [] }) as {
      groups: Array<Record<string, unknown>>;
      lots: Array<Record<string, unknown>>;
    };
    if (pred(pool)) return pool;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Pool tidak mencapai kondisi: ${label}`);
};

test("order makloon + receiving batangan PT. A → batch EXTERNAL target SLOP", async ({
  context,
}) => {
  const pm = await login(context, "plantmanager");

  // 1) Tiga order makloon (PT. A slop+batangan, PT. B batangan+TSG, PT. C pack+TSG)
  const mk = async (data: Record<string, unknown>) => {
    const res = await context.request.post("/api/v1/makloon-orders", {
      headers: { Authorization: `Bearer ${pm}` },
      data,
    });
    expect(res.status(), `order ${data.customer}`).toBe(201);
    return (await res.json()) as { id: string; code: string; customer: string };
  };
  const orderA = await mk({ customer: "PT. A", productName: "Marbol - Putihan", tsgType: "PUTIHAN", finalForm: "SLOP", inputType: "BATANGAN" });
  const orderB = await mk({ customer: "PT. B", productName: "Turya - Reguler", tsgType: "REGULER", finalForm: "BATANGAN", inputType: "TSG" });
  const orderC = await mk({ customer: "PT. C", productName: "Bagong - Mild", tsgType: "MILD", finalForm: "PACK", inputType: "TSG" });
  expect(orderA.code).toMatch(/^MKL-\d{8}-\d{3}$/);

  // 2) Daftar + ubah status
  const list = await context.request.get("/api/v1/makloon-orders", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const orders = ((await list.json()).data ?? []) as Array<{ id: string; status: string }>;
  expect(orders.filter((o) => o.id === orderA.id || o.id === orderB.id || o.id === orderC.id)).toHaveLength(3);

  const patch = await context.request.patch(`/api/v1/makloon-orders/${orderB.id}`, {
    headers: { Authorization: `Bearer ${pm}` },
    data: { status: "RECEIVING" },
  });
  expect(patch.status()).toBe(200);

  // 3) Bahan masuk PT. A: batangan via order (senderName disalin dari order)
  const recv = await context.request.post("/api/v1/external-receivings", {
    headers: { Authorization: `Bearer ${pm}` },
    data: { senderName: "asal-asalan", docRef: "PO-A-1", batanganKg: 0.5, entryStage: "BATANGAN", makloonOrderId: orderA.id },
  });
  expect(recv.status()).toBe(201);
  const receiving = (await recv.json()) as { id: string; senderName: string; makloonOrderId: string };
  expect(receiving.senderName).toBe("PT. A"); // free-text diabaikan — disalin dari order
  expect(receiving.makloonOrderId).toBe(orderA.id);

  // 4) Approve → batch EXTERNAL lahir bertarget SLOP + taut order
  const approve = await context.request.post(`/api/v1/external-receivings/${receiving.id}/approve`, {
    headers: { Authorization: `Bearer ${pm}` },
    data: {},
  });
  expect(approve.status()).toBe(200);
  const approved = (await approve.json()) as { batchId: string; batchCode: string };
  expect(approved.batchCode).toMatch(/^btx_/);

  const batchesRes = await context.request.get("/api/v1/batches", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const batches = ((await batchesRes.json()).data ?? []) as Array<{
    id: string; code: string; source: string; targetUnit: string; makloonCustomer: string | null;
  }>;
  const btx = batches.find((b) => b.id === approved.batchId);
  expect(btx).toBeTruthy();
  expect(btx!.source).toBe("EXTERNAL");
  expect(btx!.targetUnit).toBe("SLOP"); // dari order.finalForm (docs/26 §2.3)
  expect(btx!.makloonCustomer).toBe("PT. A");

  // State untuk test berikutnya (dalam spec yang sama)
  writeState({ makloonBatchId: approved.batchId, makloonOrderId: orderA.id });
});

test("HLP reject di batch makloon → pool MAKLOON → serah terima + PDF", async ({
  context,
}) => {
  const state = readState();
  skipIfMissing(state, ["makloonBatchId", "makloonOrderId"], "test 1 spec ini");

  const pm = await login(context, "plantmanager");

  // 1) Mesin HLP + sesi OPEN (boleh sudah ada — reuse)
  const machinesRes = await context.request.get("/api/v1/machines", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const machines = ((await machinesRes.json()).data ?? []) as Array<{ id: string; code: string; type: string }>;
  const hlpMachine = machines.find((m) => m.type === "HLP");
  expect(hlpMachine, "mesin HLP ter-seed").toBeTruthy();

  const openList = await context.request.get(`/api/v1/hlp/shifts?machineId=${hlpMachine!.id}&status=OPEN`, {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const openShifts = ((await openList.json()).data ?? []) as Array<{ id: string }>;
  if (openShifts.length === 0) {
    const open = await context.request.post("/api/v1/hlp/shifts", {
      headers: { Authorization: `Bearer ${pm}` },
      data: { hlpMachineId: hlpMachine!.id },
    });
    expect(open.status()).toBe(201);
  }

  // 2) Catat packing dengan reject → sink ledger origin MAKLOON (docs/26 §3.2)
  const pack = await context.request.post("/api/v1/hlp/pack", {
    headers: { Authorization: `Bearer ${pm}` },
    data: {
      batchId: state.makloonBatchId,
      hlpMachineId: hlpMachine!.id,
      packsLolos: 10,
      isiPerPack: 20,
      rejectBatangan: 3,
      rejectReason: "SOBEK",
    },
  });
  expect(pack.status(), `packing makloon: ${await pack.text()}`).toBe(201);

  // 3) Pool: muncul kelompok MAKLOON milik order PT. A
  const pool = await pollPool(
    context,
    pm,
    (p) =>
      p.groups.some(
        (g) => g.origin === "MAKLOON" && g.makloonOrderId === state.makloonOrderId && g.unit === "BATANG"
      ),
    "kelompok MAKLOON PT. A (BATANG)"
  );
  const makloonGroup = pool.groups.find(
    (g) => g.origin === "MAKLOON" && g.makloonOrderId === state.makloonOrderId && g.unit === "BATANG"
  ) as { availableQty: number };
  expect(makloonGroup.availableQty).toBeGreaterThanOrEqual(3);

  // 4) Serah terima ke customer → lot marked returned
  const ret = await context.request.post("/api/v1/rijekan/return", {
    headers: { Authorization: `Bearer ${pm}` },
    data: { makloonOrderId: state.makloonOrderId, docRef: "BA-WASTE-001" },
  });
  expect(ret.status(), `serah terima: ${await ret.text()}`).toBe(201);
  const returned = (await ret.json()) as { returnId: string; customer: string; items: Array<{ unit: string; qty: number }> };
  expect(returned.customer).toBe("PT. A");
  expect(returned.items).toContainEqual({ unit: "BATANG", qty: 3 });

  // 5) PDF berita acara serah terima waste (pola asersi waitForResponse → konten PDF)
  const doc = await context.request.get(`/api/v1/rijekan-returns/${returned.returnId}/document`, {
    headers: { Authorization: `Bearer ${pm}` },
  });
  expect(doc.status()).toBe(200);
  expect(doc.headers()["content-type"]).toContain("application/pdf");

  // 6) Pool makloon order ini kosong kembali (return sinkron — langsung cek)
  const rij2 = await context.request.get("/api/v1/rijekan", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const pool2 = ((await rij2.json()).pool ?? {}) as {
    groups: Array<{ origin: string; makloonOrderId: string | null }>;
  };
  expect(pool2.groups.find((g) => g.origin === "MAKLOON" && g.makloonOrderId === state.makloonOrderId)).toBeUndefined();
});

test("settle waste MAKER → pool INTERNAL → reproses jadi TSG baru", async ({
  context,
}) => {
  const state = readState();
  skipIfMissing(state, ["shiftId"], "02_shift_lifecycle");

  const pm = await login(context, "plantmanager");

  // 1) Settle waste RIJEKAN & MENIR shift internal → sink pool (docs/26 §3.2)
  const settle = async (category: string) => {
    const res = await context.request.patch(`/api/v1/shifts/${state.shiftId}/waste/${category}`, {
      headers: { Authorization: `Bearer ${pm}` },
      data: {},
    });
    expect(res.status(), `settle ${category}: ${await res.text()}`).toBe(200);
  };
  await settle("RIJEKAN");
  await settle("MENIR");

  // 2) Pool INTERNAL KG REGULER tersedia (jenis dari produk shift — 0033)
  const data = await pollPool(
    context,
    pm,
    (p) =>
      p.groups.some(
        (g) => g.origin === "INTERNAL" && g.unit === "KG" && g.tsgType === "REGULER" && Number(g.availableQty) > 0
      ),
    "kelompok INTERNAL KG REGULER"
  );
  const kgGroup = data.groups.find(
    (g) => g.origin === "INTERNAL" && g.unit === "KG" && g.tsgType === "REGULER"
  ) as { availableQty: number };
  const kgLots = data.lots.filter(
    (l) => l.unit === "KG" && l.tsgType === "REGULER" && Number(l.availableQty) > 0.001
  );
  expect(kgLots.length).toBeGreaterThan(0);

  // 3) Reproses: lot KG REGULER → TSG REGULER baru (berat timbang aktual)
  const available = kgGroup!.availableQty;
  const reproses = await context.request.post("/api/v1/rijekan/reproses", {
    headers: { Authorization: `Bearer ${pm}` },
    data: {
      tsgType: "REGULER",
      lots: kgLots.slice(0, 1).map((l) => ({ ledgerEntryId: l.id, qty: l.availableQty })),
      weightKg: Math.max(1, Math.round(available * 10) / 10), // berat timbang aktual
      note: "E2E reproses",
    },
  });
  expect(reproses.status(), `reproses: ${await reproses.text()}`).toBe(201);
  const res = (await reproses.json()) as {
    receivingCode: string;
    beratAcuan: Record<string, number>;
    tsgType: string;
  };
  expect(res.receivingCode).toMatch(/^RCV-/);
  expect(res.beratAcuan.KG).toBeGreaterThan(0); // berat rijekan sebagai acuan
  expect(res.tsgType).toBe("REGULER"); // hasil = jenis yang sama

  // 4) TSG baru masuk inventory AVAILABLE — ditandai supplier reproses
  // (list /available hanya berisi boks AVAILABLE — tanpa kolom status)
  const inv = await context.request.get("/api/v1/tsg-inventory/available?limit=500", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  expect(inv.status(), `inventory: ${await inv.text()}`).toBe(200);
  const invData = ((await inv.json()).data ?? []) as Array<{ supplierName: string | null; tsgType: string }>;
  expect(
    invData.some((b) => b.supplierName === "Reproses Internal (Rijekan)" && b.tsgType === "REGULER")
  ).toBeTruthy();

  // 5) Saldo pool INTERNAL KG berkurang sesuai konsumsi (lot habis total →
  // kelompok hilang dari pool — saldo efektif 0)
  const rij2 = await context.request.get("/api/v1/rijekan", {
    headers: { Authorization: `Bearer ${pm}` },
  });
  const data2 = (await rij2.json()) as {
    pool: { groups: Array<{ origin: string; tsgType: string | null; unit: string; availableQty: number }> };
  };
  const kgAfter = data2.pool.groups.find(
    (g) => g.origin === "INTERNAL" && g.unit === "KG" && g.tsgType === "REGULER"
  );
  expect(kgAfter?.availableQty ?? 0).toBeLessThan(kgGroup!.availableQty);
});
