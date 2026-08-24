// =============================================================================
// API Client — fetch helper bersama untuk semua halaman client
// =============================================================================
// Perilaku:
// - Otomatis attach Authorization Bearer dari localStorage
// - 401 → bersihkan token + redirect ke /tablet/login
// - Error non-OK → throw Error dengan pesan dari server
// =============================================================================

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
}

/** Cek apakah token ada & belum expired (JWT exp claim, detik) */
export function isSessionExpired(): boolean {
  const token = getToken();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!));
    const exp = payload.exp;
    if (!exp) return true;
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

/** Redirect ke login + bersihkan sesi lokal */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  if (!window.location.pathname.includes("/login")) {
    window.location.href = "/tablet/login";
  }
}

export async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const token = getToken();
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    // Tampilkan field error zod supaya user tahu persis input mana yang salah
    const fieldErrors = err.error?.details?.fieldErrors as Record<string, string[]> | undefined;
    const fieldMsg =
      fieldErrors && Object.keys(fieldErrors).length > 0
        ? " — " +
          Object.entries(fieldErrors)
            .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(", ")}`)
            .join("; ")
        : "";
    throw new Error((err.error?.message ?? res.statusText) + fieldMsg);
  }

  return res.json();
}
