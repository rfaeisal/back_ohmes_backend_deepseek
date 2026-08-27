// 05_outbound_cartoning — FG confirm (aktual = packsLolos → CONFIRMED) →
// buat karton → isi pack dari batch HLP → tutup → READY.
// Butuh state batchCode + packsLolos (02/04). Menulis { cartonCode } untuk 06.
import { test, expect } from "./fixtures";
import { dialog, selectByLabel, selectOptionByText } from "./helpers/ui";
import { readState, skipIfMissing, writeState } from "./helpers/state";

test("outbound: FG confirm → karton → isi pack → READY", async ({
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

  await test.step("buat karton baru (kapasitas 50)", async () => {
    await page.getByRole("button", { name: /Buat Karton Baru/ }).click();
    const dlg = dialog(page, "Buat Karton Baru");
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Kapasitas (pack)").fill("50");
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

  await test.step("isi pack ke karton", async () => {
    await page.getByRole("button", { name: /Isi Pack/ }).first().click();
    const dlg = dialog(page, /Isi Pack → Karton /);
    await expect(dlg).toBeVisible();

    await selectOptionByText(
      selectByLabel(dlg, "Pack dari HLP"),
      state.batchCode!
    );
    await dlg
      .getByLabel("Jumlah pack ke karton ini")
      .fill(String(state.packsLolos));
    await dlg.getByRole("button", { name: "Tambah ke Karton" }).click();
    await expect(page.getByText(/pack ditambahkan/)).toBeVisible();
  });

  await test.step("tutup karton → status READY", async () => {
    await page.getByRole("button", { name: "Tutup → READY" }).first().click();
    // confirm() "Tutup karton ini?" di-auto-accept oleh fixture
    await expect(page.getByText(/✅ Karton ditutup \(READY\)/)).toBeVisible();
    await expect(page.getByText("READY", { exact: true }).first()).toBeVisible();
  });
});
