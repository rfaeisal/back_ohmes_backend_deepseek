// 01_receiving — WMS inbound: gudang terima TSG manual (tanpa SJ) → PENDING →
// approve oleh PLANT_MANAGER → boks masuk inventory AVAILABLE.
// Catatan RBAC: GUDANG_INBOUND TIDAK punya tsg.receiving.approve (seed) —
// approval wajib lewat plantmanager.
import { test, expect } from "./fixtures";
import { dialog, todayWib } from "./helpers/ui";

test("receiving manual 3 boks → approve PM → masuk inventory", async ({
  page,
  login,
}) => {
  await test.step("login gudangin → halaman gudang", async () => {
    await login("gudangin");
    await page.goto("/admin/gudang");
    await expect(
      page.getByRole("button", { name: /Terima TSG Baru/ })
    ).toBeVisible();
  });

  await test.step("isi receiving 3 boks (kode pool TSG-YYYYMMDD-NNN)", async () => {
    await page.getByRole("button", { name: /Terima TSG Baru/ }).click();
    const dlg = dialog(page, "Terima TSG dari Supplier");
    await expect(dlg).toBeVisible();

    const y = todayWib();
    const boxes = [
      { code: `TSG-${y}-201`, weight: "30.10" },
      { code: `TSG-${y}-202`, weight: "29.85" },
      { code: `TSG-${y}-203`, weight: "30.40" },
    ];

    // Baris pertama sudah ada; tambah 2 baris lagi
    await dlg.getByPlaceholder(/TSG-\d{8}-\d{3}/).first().fill(boxes[0]!.code);
    await dlg.getByPlaceholder("0.00").first().fill(boxes[0]!.weight);
    await dlg.getByRole("button", { name: "+ Tambah Boks" }).click();
    await dlg.getByRole("button", { name: "+ Tambah Boks" }).click();

    for (let i = 1; i <= 2; i++) {
      await dlg
        .getByPlaceholder(/TSG-\d{8}-\d{3}/)
        .nth(i)
        .fill(boxes[i]!.code);
      await dlg.getByPlaceholder("0.00").nth(i).fill(boxes[i]!.weight);
    }

    await dlg.getByRole("button", { name: /Simpan · 3 Boks/ }).click();
    await expect(
      page.getByText("⏳ Receiving Menunggu Approval (1)")
    ).toBeVisible();
  });

  await test.step("approve sebagai plantmanager → boks masuk inventory", async () => {
    await login("plantmanager");
    await page.goto("/admin/gudang");

    await page.getByRole("button", { name: /Approve → Inventory/ }).click();

    const y = todayWib();
    // Boks ter-approve muncul di tabel inventory AVAILABLE
    await expect(page.getByText(`TSG-${y}-201`)).toBeVisible();
    // Banner pending hilang total (render kondisional saat count = 0)
    await expect(
      page.getByText(/⏳ Receiving Menunggu Approval/)
    ).toHaveCount(0);
  });
});
