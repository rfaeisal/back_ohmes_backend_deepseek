// 06_dispatch — Ekspedisi: buat dispatch order dari karton READY → dispatch →
// generate dokumen surat jalan → unduh PDF (diverifikasi via respons API).
// Butuh state cartonCode dari 05_outbound_cartoning.
import { test, expect } from "./fixtures";
import { dialog, expectPdfDownload } from "./helpers/ui";
import { readState, skipIfMissing } from "./helpers/state";

test("dispatch: order → DISPATCHED → dokumen PDF", async ({ page, login }) => {
  const state = readState();
  skipIfMissing(state, ["cartonCode"], "05_outbound_cartoning");

  await login("ekspedisi");
  await page.goto("/admin/dispatch");

  await test.step("buat dispatch order dengan karton READY", async () => {
    await page.getByRole("button", { name: /Buat Dispatch Order/ }).click();
    const dlg = dialog(page, "Buat Dispatch Order");
    await expect(dlg).toBeVisible();

    await dlg.getByLabel("Nama Pelanggan *").fill("Distributor Surabaya E2E");
    await dlg.getByLabel("Alamat Tujuan *").fill("Jl. Test No. 1, Surabaya");
    await dlg
      .locator("label")
      .filter({ hasText: state.cartonCode! })
      .locator('input[type="checkbox"]')
      .check();

    await dlg.getByRole("button", { name: "Buat Order", exact: true }).click();
    await expect(page.getByText(/✅ Dispatch order dibuat/)).toBeVisible();
    // Order baru berstatus DRAFT (dispatch.service createOrder)
    await expect(page.getByText("DRAFT", { exact: true }).first()).toBeVisible();
  });

  await test.step("dispatch order → DISPATCHED", async () => {
    await page.getByRole("button", { name: "Dispatch", exact: true }).first().click();
    // confirm() "Dispatch order ini?" di-auto-accept
    await expect(page.getByText(/✅ Order DISPATCHED/)).toBeVisible();
    await expect(
      page.getByText("DISPATCHED", { exact: true }).first()
    ).toBeVisible();
  });

  await test.step("generate dokumen & unduh surat jalan PDF", async () => {
    // .first(): bisa ada order lain di tabel (mis. dari spec 05b)
    await page.getByRole("button", { name: /Dokumen/ }).first().click();
    await expect(page.getByText(/✅ Dokumen dibuat/)).toBeVisible();

    await expectPdfDownload(
      page,
      "**/api/v1/dispatch/documents/*/download",
      async () => {
        await page.getByRole("button", { name: /Unduh/ }).first().click();
      }
    );
  });
});
