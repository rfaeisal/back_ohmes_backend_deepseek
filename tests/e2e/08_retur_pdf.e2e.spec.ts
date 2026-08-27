// 08_retur_pdf — Retur TSG ke supplier + cetak Berita Acara Retur (PDF API).
import { test, expect } from "./fixtures";
import { dialog, expectPdfDownload } from "./helpers/ui";

test("retur 1 boks ke supplier → Berita Acara Retur PDF", async ({
  page,
  login,
}) => {
  await login("gudangin");
  await page.goto("/admin/gudang");

  await test.step("retur 1 boks dengan alasan", async () => {
    await page.getByRole("button", { name: /Retur TSG ke Supplier/ }).click();
    const dlg = dialog(page, "Retur TSG ke Supplier");
    await expect(dlg).toBeVisible();

    await dlg.getByLabel("Alasan Retur *").fill("Boks cacat uji E2E");
    // Supplier ter-isi otomatis dari asal boks (per baris yang dipilih)
    await dlg.getByRole("checkbox").first().check();
    await dlg.getByRole("button", { name: /Retur · 1 Boks/ }).click();

    await expect(
      page.getByText(/Riwayat Retur TSG ke Supplier \(1\)/)
    ).toBeVisible();
  });

  await test.step("cetak Berita Acara Retur (PDF)", async () => {
    await expectPdfDownload(
      page,
      "**/api/v1/tsg-returns/*/document",
      async () => {
        // "🖨 Cetak" spesifik — /Cetak/ saja menabrak tombol header "Cetak Label"
        await page.getByRole("button", { name: "🖨 Cetak" }).first().click();
      }
    );
  });
});
