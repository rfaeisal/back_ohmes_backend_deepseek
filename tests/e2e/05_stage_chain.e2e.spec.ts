// 05_stage_chain — Rantai target (0030) + karton multi-satuan (0029):
// batch INTERNAL diberi target BAL → SLOP tanpa WR ditolak → catat WR → SLOP
// → karton unit SLOP → isi dari "Hasil SLOP" → READY → dispatch + surat jalan
// PDF. Butuh state batchCode (02/04). Menulis { slopCartonCode }.
// (Sejak docs/26 — karton hanya SLOP|BAL: spec ini MENDAHULUI 05b supaya
// event stage tersedia saat 05b mengisi karton dari "Hasil SLOP".)
import { test, expect } from "./fixtures";
import { dialog, selectByLabel, selectOptionByText, expectPdfDownload } from "./helpers/ui";
import { readState, skipIfMissing, writeState } from "./helpers/state";
import { PASSWORD } from "./helpers/auth";

test("rantai target → WR → SLOP → karton SLOP → dispatch PDF", async ({
  page,
  login,
}) => {
  const state = readState();
  skipIfMissing(state, ["batchCode"], "02_shift_lifecycle / 04_hlp_packing");

  // Fixture login: memasang auto-accept dialog browser (confirm() tutup
  // karton & dispatch) + token localStorage untuk alur UI.
  await login("gudangout");

  // Login manual supaya token tersedia untuk panggilan API langsung
  const loginFor = async (username: string) => {
    const res = await page.context().request.post("/api/v1/auth/login", {
      data: { username, password: PASSWORD, deviceType: "WEB" },
    });
    expect(res.ok(), `login ${username}`).toBeTruthy();
    const data = await res.json();
    await page.addInitScript(
      (t: string) => localStorage.setItem("accessToken", t),
      data.accessToken
    );
    return data.accessToken as string;
  };
  const api = (token: string) => (method: "GET" | "POST" | "PATCH", path: string, data?: any) =>
    page.context().request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

  const gudangToken = await loginFor("gudangout");
  const gudangApi = api(gudangToken);

  // 1. Resolve batchId dari kode batch
  const batchesRes = await gudangApi("GET", "/batches");
  expect(batchesRes.ok()).toBeTruthy();
  const batches = await batchesRes.json();
  const batch = (batches.data ?? []).find((b: any) => b.code === state.batchCode);
  expect(batch, "batch dari state harus ada di /batches").toBeTruthy();
  const batchId = batch.id;
  let slopCartonCode: string | null = null;

  await test.step("set target BAL (belum ada event → tanpa alasan)", async () => {
    const res = await gudangApi("PATCH", `/batches/${batchId}/target`, { targetUnit: "BAL" });
    const bodyText = await res.text();
    expect(res.ok(), `PATCH target gagal ${res.status()}: ${bodyText}`).toBeTruthy();
  });

  await test.step("BLOCK: SLOP sebelum WR ditolak (STAGE_SEQUENCE_REQUIRED)", async () => {
    const res = await gudangApi("POST", "/batch-stage-events", {
      batchId, stage: "SLOP", inputQty: 9, outputQty: 8, rejectQty: 0,
    });
    // Route stage-events memetakan ServiceError → 400
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("STAGE_SEQUENCE_REQUIRED");
  });

  await test.step("catat WR lalu SLOP (target BAL mengizinkan berurutan)", async () => {
    const wr = await gudangApi("POST", "/batch-stage-events", {
      batchId, stage: "WR", inputQty: 10, outputQty: 9, rejectQty: 1,
    });
    expect(wr.status()).toBe(201);
    const slop = await gudangApi("POST", "/batch-stage-events", {
      batchId, stage: "SLOP", inputQty: 9, outputQty: 8, rejectQty: 0,
    });
    expect(slop.status()).toBe(201);
  });

  await page.goto("/admin/gudang-outbound");

  await test.step("buat karton unit SLOP (kapasitas 10)", async () => {
    await page.getByRole("button", { name: /Buat Karton Baru/ }).click();
    const dlg = dialog(page, "Buat Karton Baru");
    await expect(dlg).toBeVisible();
    await selectOptionByText(selectByLabel(dlg, "Unit Karton"), "SLOP");
    await dlg.getByLabel("Kapasitas (slop)").fill("10");
    await dlg.getByRole("button", { name: "Buat Karton", exact: true }).click();
    await expect(page.getByText(/✅ Karton baru dibuat/)).toBeVisible();

    slopCartonCode = (
      await page.locator("table").nth(1).locator("tbody tr").first().locator("td").first().innerText()
    ).trim();
    writeState({ slopCartonCode });
  });

  await test.step("isi karton dari Hasil SLOP (sisa 8 → ambil 3)", async () => {
    await page.getByRole("button", { name: /Isi Pack/ }).first().click();
    const dlg = dialog(page, /Isi Pack → Karton /);
    await expect(dlg).toBeVisible();

    // Karton unit SLOP → tanpa pilih Sumber Isi, langsung dropdown batch hasil SLOP
    await selectOptionByText(
      selectByLabel(dlg, "Batch (hasil SLOP)"),
      state.batchCode!
    );
    await dlg.getByLabel("Jumlah slop ke karton ini").fill("3");
    await dlg.getByRole("button", { name: "Tambah ke Karton" }).click();
    await expect(page.getByText(/slop ditambahkan/)).toBeVisible();
  });

  await test.step("tutup karton → READY", async () => {
    await page.getByRole("button", { name: "Tutup → READY" }).first().click();
    await expect(page.getByText(/✅ Karton ditutup \(READY\)/)).toBeVisible();
  });

  await test.step("dispatch order + surat jalan PDF (unit SLOP)", async () => {
    await loginFor("ekspedisi");
    await page.goto("/admin/dispatch");

    await page.getByRole("button", { name: /Buat Dispatch Order/ }).click();
    const dlg = dialog(page, "Buat Dispatch Order");
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Nama Pelanggan *").fill("Distributor Slop E2E");
    await dlg.getByLabel("Alamat Tujuan *").fill("Jl. Test No. 2, Surabaya");
    await dlg
      .locator("label")
      .filter({ hasText: slopCartonCode! })
      .locator('input[type="checkbox"]')
      .check();
    await dlg.getByRole("button", { name: "Buat Order", exact: true }).click();
    await expect(page.getByText(/✅ Dispatch order dibuat/)).toBeVisible();

    await page.getByRole("button", { name: "Dispatch", exact: true }).first().click();
    await expect(page.getByText(/✅ Order DISPATCHED/)).toBeVisible();

    await page.getByRole("button", { name: /Dokumen/ }).click();
    await expect(page.getByText(/✅ Dokumen dibuat/)).toBeVisible();
    await expectPdfDownload(
      page,
      "**/api/v1/dispatch/documents/*/download",
      async () => {
        await page.getByRole("button", { name: /Unduh/ }).click();
      }
    );
  });
});
