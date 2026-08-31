// 09_sj_pool_shared — Pool label = inventaris bersama lintas petugas
// (migrasi 0010, SOP §3.2). Regresi bug produksi 31 Agu 2026: label pool
// cetakan area office (area.koordinator) tidak bisa di-resolve petugas SJ
// (petugassj) di gudang supplier — GET /supplier-sj/labels/{code} &
// weighSupplierSjBox dulu memblokir label AVAILABLE milik petugas lain
// (sisa model pra-0010) → semua scan balas 404 LABEL_NOT_FOUND padahal
// /supplier-sj/pool melaporkan 50 label available.
//
// Spesifikasi ini API-level (tanpa UI) — meniru persis pasangan user produksi.
import { test, expect } from "./fixtures";

test("label pool cetakan koordinator area bisa di-scan petugas SJ (resolve → assign → weigh)", async ({
  context,
}) => {
  const login = async (username: string) => {
    const res = await context.request.post("/api/v1/auth/login", {
      data: { username, password: "12345678", deviceType: "WEB" },
    });
    expect(res.ok(), `login ${username}`).toBeTruthy();
    return (await res.json()).accessToken as string;
  };

  // 1) Koordinator area mencetak 2 label pool di office (web)
  const koordinatorToken = await login("area.koordinator");
  const gen = await context.request.post("/api/v1/supplier-sj/pool", {
    headers: { Authorization: `Bearer ${koordinatorToken}` },
    data: { count: 2 },
  });
  expect(gen.status()).toBe(201);
  const { boxCodes } = (await gen.json()) as { boxCodes: string[] };
  expect(boxCodes).toHaveLength(2);

  // 2) Petugas SJ (petugas LAIN) resolve label cetakan koordinator
  const petugasToken = await login("petugassj");
  const lookup = async (boxCode: string) => {
    const res = await context.request.get(
      `/api/v1/supplier-sj/labels/${boxCode}`,
      { headers: { Authorization: `Bearer ${petugasToken}` } }
    );
    return res;
  };

  const res1 = await lookup(boxCodes[0]!);
  expect(res1.status()).toBe(200); // regresi: dulu 404 LABEL_NOT_FOUND
  expect((await res1.json()).labelStatus).toBe("AVAILABLE");

  const res2 = await lookup(boxCodes[1]!);
  expect(res2.status()).toBe(200);
  expect((await res2.json()).labelStatus).toBe("AVAILABLE");

  // 3) Petugas SJ buat SJ lalu scan label pool koordinator (assign + timbang)
  const opts = await context.request.get("/api/v1/supplier-sj/options", {
    headers: { Authorization: `Bearer ${petugasToken}` },
  });
  const { suppliers, plants } = (await opts.json()).data as {
    suppliers: { id: string }[];
    plants: { id: string }[];
  };

  const sjRes = await context.request.post("/api/v1/supplier-sj", {
    headers: { Authorization: `Bearer ${petugasToken}` },
    data: {
      sjNumber: `SJ-E2E-SHARED-${Date.now()}`,
      supplierId: suppliers[0]!.id,
      plantId: plants[0]!.id,
    },
  });
  expect(sjRes.status()).toBe(201);
  const { sjId } = (await sjRes.json()) as { sjId: string };

  const weigh = await context.request.post(
    `/api/v1/supplier-sj/${sjId}/boxes/weigh`,
    {
      headers: { Authorization: `Bearer ${petugasToken}` },
      data: { boxCode: boxCodes[0], tsgType: "REGULER", supplierWeightKg: 30.5 },
    }
  );
  expect(weigh.status()).toBe(200); // regresi: dulu 404 LABEL_NOT_FOUND
  expect((await weigh.json()).labelStatus).toBe("ASSIGNED");

  // 4) Resolve ulang → label terikat SJ milik petugas
  const res3 = await lookup(boxCodes[0]!);
  const label3 = await res3.json();
  expect(res3.status()).toBe(200);
  expect(label3.labelStatus).toBe("ASSIGNED");
  expect(label3.sjId).toBe(sjId);
});
