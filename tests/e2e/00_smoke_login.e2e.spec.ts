// 00_smoke_login — Login sungguhan lewat UI (bukan API) + redirect role.
import { test, expect } from "./fixtures";

test("operator login via form UI → redirect ke /tablet", async ({ page }) => {
  await page.goto("/tablet/login");

  await page.getByLabel("Username").fill("kecer");
  await page.getByLabel("Password").fill("12345678");
  await page.getByRole("button", { name: "Masuk" }).click();

  // Redirect role OPERATOR → /tablet
  await expect(page).toHaveURL(/\/tablet$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Lantai Produksi" })
  ).toBeVisible();
  // Grid mesin MAKER terlihat (MKR-01 dari seed)
  await expect(page.getByText("MKR-01")).toBeVisible();
});
