import type { BrowserContext, Page } from "@playwright/test";

// Login programmatik via API → inject token ke localStorage.
// Pola dari test-shift-workflow.cjs (sudah terbukti jalan).
// - deviceType "WEB" tidak kena single-session 409 (khusus MOBILE).
// - Logout TIDAK dipakai di suite — logout merevoke SEMUA sesi user,
//   bisa membunuh sesi user yang sama di spec lain.

export const PASSWORD = "12345678";

export async function loginAs(
  context: BrowserContext,
  page: Page,
  username: string,
  password = PASSWORD
): Promise<void> {
  const res = await context.request.post("/api/v1/auth/login", {
    data: { username, password, deviceType: "WEB" },
  });
  if (!res.ok()) {
    throw new Error(
      `Login ${username} gagal: ${res.status()} ${await res.text()}`
    );
  }
  const data = await res.json();
  await page.addInitScript(
    ({ at, rt }: { at: string; rt: string }) => {
      localStorage.setItem("accessToken", at);
      localStorage.setItem("refreshToken", rt);
    },
    { at: data.accessToken, rt: data.refreshToken }
  );
}
