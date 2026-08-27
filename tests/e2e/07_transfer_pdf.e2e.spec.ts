// 07_transfer_pdf — Kirim TSG antar pabrik + cetak Berita Acara Serah Terima
// (PDF asli dari API, diverifikasi via respons).
import { test, expect } from "./fixtures";
import { dialog, expectPdfDownload } from "./helpers/ui";

test("transfer 1 boks antar pabrik → Berita Acara PDF", async ({
  page,
  login,
}) => {
  await login("gudangin");
  await page.goto("/admin/gudang");

  await test.step("kirim 1 boks ke pabrik lain", async () => {
    await page.getByRole("button", { name: /Kirim TSG ke Pabrik Lain/ }).click();
    const dlg = dialog(page, "Kirim TSG ke Pabrik Lain");
    await expect(dlg).toBeVisible();

    await dlg.getByLabel("Pabrik Tujuan").fill("Pabrik Pamekasan E2E");
    await dlg.getByRole("checkbox").first().check();
    await dlg.getByRole("button", { name: /Kirim · 1 Boks/ }).click();

    await expect(
      page.getByText(/Riwayat Kirim TSG Antar Pabrik \(1\)/)
    ).toBeVisible();
  });

  await test.step("cetak Berita Acara Serah Terima (PDF)", async () => {
    await expectPdfDownload(
      page,
      "**/api/v1/tsg-transfers/*/document",
      async () => {
        // "🖨 Cetak" spesifik — /Cetak/ saja menabrak tombol header "Cetak Label"
        await page.getByRole("button", { name: "🖨 Cetak" }).first().click();
      }
    );
  });
});
