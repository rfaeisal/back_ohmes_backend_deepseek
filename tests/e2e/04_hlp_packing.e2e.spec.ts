// 04_hlp_packing — Operator HLP pilih batch dari Maker → catat hasil packing.
// Butuh state batchCode dari 02_shift_lifecycle. Menulis { packsLolos } untuk 05.
import { test, expect } from "./fixtures";
import { dialog, selectByLabel, selectOptionByText } from "./helpers/ui";
import { readState, skipIfMissing, writeState } from "./helpers/state";

test("HLP catat packing dari batch Maker → 25 pack lolos", async ({
  page,
  login,
}) => {
  const state = readState();
  skipIfMissing(state, ["batchCode"], "02_shift_lifecycle");

  await login("kecer");
  await page.goto("/tablet/hlp");

  await test.step("pilih batch dari picker", async () => {
    await page
      .getByRole("button", { name: /Pilih Boks Batangan \(scan kode btc_\.\.\.\)/ })
      .click();
    const dlg = dialog(page, "Pilih Boks Batangan");
    await expect(dlg).toBeVisible();

    await dlg.getByLabel("Cari kode batch").fill(state.batchCode!);
    await dlg.locator("button").filter({ hasText: state.batchCode! }).first().click();

    // Batch terpilih tampil di form utama (dengan tombol "Ganti")
    await expect(page.getByText(state.batchCode!).first()).toBeVisible();
  });

  await test.step("isi hasil packing & simpan", async () => {
    await selectOptionByText(selectByLabel(page, "Mesin HLP"), "HLP-01");
    await page.getByLabel("Pack Lolos").fill("25");
    await page.getByLabel("Isi per Pack").fill("20");
    await page.getByLabel("Reject (batang)").fill("2");

    await page.getByRole("button", { name: "SIMPAN HASIL PACKING" }).click();

    await expect(page.getByText(/✅ Packing dicatat/)).toBeVisible();
    await expect(page.getByText("Hasil Tersimpan ✅")).toBeVisible();
    writeState({ packsLolos: 25 });
  });
});
