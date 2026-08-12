// =============================================================================
// Shared API fetch utility — handle 401 auto-redirect
// =============================================================================

export async function fetchWithAuth(path: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });

  // Auto-redirect to login on token expiry
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    window.location.href = "/tablet/login";
    throw new Error("Sesi berakhir. Silakan login kembali.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }

  return res.json();
}
