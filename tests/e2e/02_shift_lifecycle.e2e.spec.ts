// 02_shift_lifecycle — PIVOT chain: start shift MAKER → buka boks → event
// (pemakaian/downtime/maintenance) → timbang sesi (yield 112%) → akhiri shift.
// Menulis state { shiftId, batchCode, boxCode, boxWeightKg } untuk spec 03–05.
import { test, expect } from "./fixtures";
import { dialog, selectByLabel, selectOptionByText, wasteRow } from "./helpers/ui";
import { readState, writeState } from "./helpers/state";

test("siklus shift MAKER lengkap: mulai → boks → event → timbang → akhiri", async ({
  page,
  login,
}) => {
  await test.step("mulai shift di MKR-01 dengan 2 anggota tim", async () => {
    await login("kecer");
    await page.goto("/tablet");
    await expect(page.getByText("MKR-01")).toBeVisible();

    await page.getByRole("button", { name: "Mulai Shift Baru" }).first().click();
    await expect(page).toHaveURL(/\/tablet\/start-shift\?machine=/);

    // Team manual (seed tanpa roster)
    await page.getByRole("button", { name: /Pak Kecer/ }).click();
    await page.getByRole("button", { name: /Pak Anggota Tim/ }).click();

    await page.getByRole("button", { name: /Mulai Shift · / }).click();
    await expect(page).toHaveURL(/\/tablet\/shift\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    const shiftId = page.url().match(/shift\/([0-9a-f-]+)/)?.[1];
    expect(shiftId, "shiftId harus ada di URL").toBeTruthy();
    writeState({ shiftId: shiftId! });
  });

  await test.step("buka 1 boks TSG (FIFO)", async () => {
    await page.getByRole("button", { name: "BUKA BOKS BARU" }).first().click();
    const dlg = dialog(page, "Buka Boks Baru");
    await expect(dlg).toBeVisible();

    await dlg.getByRole("button", { name: "1", exact: true }).click();
    const boxBtn = dlg
      .locator("button")
      .filter({ hasText: /TSG-\d{8}/ })
      .first();
    // Ambil berat boks dari teks kartu untuk hitung berat timbang (yield 112%)
    const boxText = await boxBtn.innerText();
    const boxWeight = parseFloat(boxText.match(/([\d.]+)\s*kg/)?.[1] ?? "0");
    expect(boxWeight).toBeGreaterThan(0);
    const boxCode = boxText.match(/TSG-\d{8}-\d{3}/)?.[0] ?? "";
    writeState({ boxCode, boxWeightKg: boxWeight });

    await boxBtn.click();
    await dlg.getByRole("button", { name: /BUKA 1 BOKS TERPILIH/ }).click();
    await expect(page.getByText(/SESI BOKS AKTIF · 1 BOKS/)).toBeVisible();
  });

  await test.step("catat pemakaian material (Bobbin x3)", async () => {
    await page.getByRole("button", { name: "+ Tambah Pemakaian" }).click();
    const dlg = dialog(page, "Tambah Pemakaian");
    await expect(dlg).toBeVisible();
    await selectOptionByText(selectByLabel(dlg, "Item"), "Bobbin");
    await dlg.getByLabel("Quantity").fill("3");
    await dlg.getByLabel("Catatan (opsional)").fill("E2E bobbin");
    await dlg.getByRole("button", { name: "Simpan" }).click();
    await expect(dlg).toBeHidden();
  });

  await test.step("log downtime 10 menit", async () => {
    await page.getByRole("button", { name: "+ Log Downtime" }).click();
    const dlg = dialog(page, "Log Downtime");
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Durasi (menit)").fill("10");
    await dlg.getByRole("button", { name: "Simpan" }).click();
    await expect(dlg).toBeHidden();
  });

  await test.step("log maintenance (Pisau Filter x1)", async () => {
    await page.getByRole("button", { name: "+ Log Maintenance" }).click();
    const dlg = dialog(page, "Log Maintenance / Sparepart");
    await expect(dlg).toBeVisible();
    await selectOptionByText(selectByLabel(dlg, "Sparepart"), "Pisau Filter");
    await dlg.getByLabel("Quantity").fill("1");
    await dlg.getByRole("button", { name: "Simpan" }).click();
    await expect(dlg).toBeHidden();
  });

  await test.step("timbang batangan akhir sesi → batch code keluar", async () => {
    await page
      .getByRole("button", { name: /SESI SELESAI · TIMBANG BATANGAN TOTAL/ })
      .click();
    const wdlg = dialog(page, "Timbang Batangan Akhir Sesi");
    await expect(wdlg).toBeVisible();

    // Berat boks × 1.12 → yield 112% (band normal 110–114%)
    const { boxWeightKg } = readState();
    expect(boxWeightKg).toBeGreaterThan(0);
    await wdlg
      .getByLabel("Total Berat Batangan (kg)")
      .fill((boxWeightKg! * 1.12).toFixed(2));

    await wdlg.getByRole("button", { name: "Timbang & Selesaikan Sesi" }).click();

    await expect(
      page.getByText("Kode Boks Batangan (untuk mesin HLP)")
    ).toBeVisible();
    const batchCode = (
      await page.locator("p.text-3xl.font-mono").innerText()
    ).trim();
    expect(batchCode).toMatch(/^btc_/);
    writeState({ batchCode });
  });

  await test.step("akhiri shift dengan waste MENIR 0.5 kg", async () => {
    await page.getByRole("button", { name: "AKHIRI SHIFT", exact: true }).click();
    const edlg = dialog(page, "Akhiri Shift");
    await expect(edlg).toBeVisible();

    await wasteRow(page, "MENIR").getByPlaceholder("0.00 kg").fill("0.5");
    await edlg.getByLabel("Catatan Shift (opsional)").fill("E2E end shift");
    await edlg.getByRole("button", { name: "Akhiri Shift", exact: true }).click();

    // Redirect kembali ke /tablet setelah shift berakhir
    await expect(page).toHaveURL(/\/tablet$/, { timeout: 30_000 });
  });
});
