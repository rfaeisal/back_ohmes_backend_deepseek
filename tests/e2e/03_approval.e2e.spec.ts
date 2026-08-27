// 03_approval — Supervisor review & approve shift COMPLETED → LOCKED.
// Butuh state shiftId dari 02_shift_lifecycle.
import { test, expect } from "./fixtures";
import { dialog } from "./helpers/ui";
import { readState, skipIfMissing } from "./helpers/state";

test("supervisor approve shift → status APPROVED (LOCKED)", async ({
  page,
  login,
}) => {
  const state = readState();
  skipIfMissing(state, ["shiftId"], "02_shift_lifecycle");

  await login("supervisor");
  await page.goto("/admin/approvals");
  await expect(page.getByText("MKR-01").first()).toBeVisible();

  await test.step("review detail shift sebelum approve", async () => {
    await page.getByRole("button", { name: "Review" }).first().click();
    const dlg = dialog(page, "Detail Shift");
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText("MKR-01")).toBeVisible();
    // Waste MENIR 0.5 kg dari spec 02 tampil di detail (API format toFixed(2));
    // .first() karena total waste juga "0.50 kg"
    await expect(dlg.getByText("MENIR")).toBeVisible();
    await expect(dlg.getByText("0.50 kg").first()).toBeVisible();
    await dlg.getByRole("button", { name: /Approve → LOCKED/ }).click();
    // Alert sukses di-auto-accept oleh fixture
  });

  await test.step("shift pindah ke tab Sudah Approved", async () => {
    // Antrean pending kosong
    await expect(page.getByText(/Shift Menunggu Approval \(0\)/)).toBeVisible();
    await page.getByRole("button", { name: /Sudah Approved/ }).click();
    await expect(page.getByText("MKR-01").first()).toBeVisible();
    await expect(page.getByText("APPROVED", { exact: true }).first()).toBeVisible();
  });
});
