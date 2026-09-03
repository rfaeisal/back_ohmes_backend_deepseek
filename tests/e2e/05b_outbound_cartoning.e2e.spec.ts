// 05b_outbound_cartoning — FG confirm (aktual = packsLolos → CONFIRMED) →
// buat karton SLOP → isi dari hasil SLOP (event stage di 05_stage_chain) →
// tutup → READY. Karton hanya SLOP|BAL (docs/26 §1 — keputusan 3 Sep 2026),
// jadi alur lama "isi pack HLP langsung ke karton" digantikan isi stage.
// Butuh state batchCode + packsLolos (02/04) + event stage (05_stage_chain).
// Menulis { cartonCode } untuk 06.
import { test, expect } from "./fixtures";
import { dialog, selectByLabel, selectOptionByText } from "./helpers/ui";
import { readState, skipIfMissing, writeState } from "./helpers/state";

test("outbound: FG confirm → karton SLOP → isi hasil SLOP → READY", async ({
  page,
  login,
}) => {
  const state = readState();
  skipIfMissing(
    state,
    ["batchCode", "packsLolos"],
    "02_shift_lifecycle / 04_hlp_packing"
  );

  await login("gudangout");
  await page.goto("/admin/gudang-outbound");

  await test.step("konfirmasi FG (aktual = packs dari HLP)", async () => {
    await page.getByRole("button", { name: /Konfirmasi FG/ }).first().click();
    const dlg = dialog(page, "Konfirmasi Finished Goods");
    await expect(dlg).toBeVisible();
    // Isi sama dengan packsLolos HLP → status CONFIRMED (bukan DISPUTED)
    await dlg.getByLabel("Jumlah Pack Aktual").fill(String(state.packsLolos));
    await dlg.getByRole("button", { name: "Konfirmasi", exact: true }).click();
    await expect(page.getByText(/✅ Finished goods dikonfirmasi/)).toBeVisible();
  });

  await test.step("buat karton unit SLOP (kapasitas 50)", async () => {
    await page.getByRole("button", { name: /Buat Karton Baru/ }).click();
    const dlg = dialog(page, "Buat Karton Baru");
    await expect(dlg).toBeVisible();
    // Default unit SLOP (docs/26 — karton hanya SLOP|BAL); kapasitas standar 50
    await selectOptionByText(selectByLabel(dlg, "Unit Karton"), "SLOP");
    await dlg.getByLabel("Kapasitas (slop)").fill("50");
    await dlg.getByRole("button", { name: "Buat Karton", exact: true }).click();
    await expect(page.getByText(/✅ Karton baru dibuat/)).toBeVisible();

    // Ekstrak kode karton dari tabel kedua (Karton) — kolom pertama
    const cartonCode = (
      await page
        .locator("table")
        .nth(1)
        .locator("tbody tr")
        .first()
        .locator("td")
        .first()
        .innerText()
    ).trim();
    expect(cartonCode).toMatch(/^CTN-PLT-PMK-01-/);
    writeState({ cartonCode });
  });

  await test.step("isi karton dari Hasil SLOP (sisa 8 − 3 dari 05_stage_chain = 5)", async () => {
    await page.getByRole("button", { name: /Isi Pack/ }).first().click();
    const dlg = dialog(page, /Isi Pack → Karton /);
    await expect(dlg).toBeVisible();

    // Karton unit SLOP → dropdown batch hasil SLOP
    await selectOptionByText(
      selectByLabel(dlg, "Batch (hasil SLOP)"),
      state.batchCode!
    );
    await dlg.getByLabel("Jumlah slop ke karton ini").fill("5");
    await dlg.getByRole("button", { name: "Tambah ke Karton" }).click();
    await expect(page.getByText(/slop ditambahkan/)).toBeVisible();
  });

  await test.step("tutup karton → status READY", async () => {
    await page.getByRole("button", { name: "Tutup → READY" }).first().click();
    // confirm() "Tutup karton ini?" di-auto-accept oleh fixture
    await expect(page.getByText(/✅ Karton ditutup \(READY\)/)).toBeVisible();
    await expect(page.getByText("READY", { exact: true }).first()).toBeVisible();
  });
});
