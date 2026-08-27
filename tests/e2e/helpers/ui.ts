import { expect, type Locator, type Page } from "@playwright/test";
import type { Route } from "@playwright/test";

// Helper selector — repo TIDAK punya data-testid. Semua selector berbasis
// label/role/teks. Komponen Input shared set id dari label (getByLabel jalan),
// tapi pasangan <label>+<select> polos tidak punya htmlFor.

/** Scope dialog: judul dialog = satu-satunya <h2> di halaman (CardTitle = div). */
export function dialog(page: Page, title: string | RegExp): Locator {
  return page.locator("h2", { hasText: title }).locator("..").locator("..");
}

/** Select tanpa htmlFor: <div><label>X</label><select>…</select></div> */
export function selectByLabel(root: Page | Locator, label: string): Locator {
  return root.locator("label", { hasText: label }).locator("..").locator("select");
}

/** Pilih option select lewat teks yang terlihat (value = UUID, tidak dikenal). */
export async function selectOptionByText(
  select: Locator,
  text: string
): Promise<void> {
  const opt = select.locator("option").filter({ hasText: text }).first();
  const value = await opt.getAttribute("value");
  expect(value, `option '${text}' harus ada`).not.toBeNull();
  await select.selectOption(value!);
}

/** Baris kategori waste di dialog Akhiri Shift. */
export function wasteRow(page: Page, category: string): Locator {
  return page.locator("div.flex.items-center.gap-4").filter({ hasText: category });
}

/**
 * Asersi download PDF via route interception — WAJIB, bukan waitForResponse:
 * halaman meng-konsumsi body respons (res.blob() → window.open / anchor),
 * sehingga body() dari waitForResponse kosong. Route intercept menangkap
 * bytes asli dari route.fetch() sebelum halaman memakannya.
 */
export async function expectPdfDownload(
  page: Page,
  urlPattern: string | RegExp,
  trigger: () => Promise<void>
): Promise<void> {
  let status = 0;
  let contentType = "";
  let body = Buffer.alloc(0);
  const handler = async (route: Route) => {
    const response = await route.fetch();
    status = response.status();
    contentType = response.headers()["content-type"] ?? "";
    body = Buffer.from(await response.body());
    await route.fulfill({ response });
  };
  await page.route(urlPattern, handler);
  try {
    await trigger();
    await expect
      .poll(() => body.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
  } finally {
    await page.unroute(urlPattern, handler);
  }
  expect(status).toBe(200);
  expect(contentType).toContain("application/pdf");
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
}

/** Tanggal hari ini WIB (UTC+7) format YYYYMMDD — gotcha timezone CLAUDE.md #12. */
export function todayWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}
