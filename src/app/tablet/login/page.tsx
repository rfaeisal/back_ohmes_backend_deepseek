"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needOtp, setNeedOtp] = useState(false); // layer tambahan untuk SUPERADMIN

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          otp: otp || undefined,
          deviceType: "WEB",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.code === "OTP_REQUIRED") {
          setNeedOtp(true);
          setError("");
          return;
        }
        setError(data.error?.message ?? "Login gagal");
        return;
      }

      // Simpan token ke localStorage
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);

      // Redirect berdasarkan role
      const roles: string[] = (data.roles ?? []).map((r: any) => r.code);
      const isAdmin = roles.some((r: string) =>
        ["SUPERADMIN", "HQ_ADMIN", "HQ_ANALYST", "HQ_AUDITOR", "PLANT_MANAGER"].includes(r)
      );
      const isSupervisor = roles.includes("SHIFT_SUPERVISOR");
      const isCoordinator = roles.some((r: string) => ["AREA_COORDINATOR", "AREA_QA"].includes(r));
      const isGudang = roles.some((r: string) => ["GUDANG_INBOUND", "GUDANG_OUTBOUND", "EKSPEDISI"].includes(r));

      const isPlantManager = roles.includes("PLANT_MANAGER");
      if (roles.includes("HQ_ANALYST")) router.push("/admin/analytics");
      else if (roles.includes("HQ_AUDITOR")) router.push("/admin/audit");
      else if (isAdmin) router.push("/admin");
      else if (isPlantManager) router.push("/admin/plant-dashboard");
      else if (isSupervisor) router.push("/admin/approvals");
      else if (isCoordinator) router.push("/admin/area-dashboard");
      else if (roles.includes("GUDANG_OUTBOUND")) router.push("/admin/gudang-outbound");
      else if (roles.includes("EKSPEDISI")) router.push("/admin/dispatch");
      else if (isGudang) router.push("/admin/gudang");
      else router.push("/tablet");
    } catch {
      setError("Tidak bisa terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-700">MES Hummer</h1>
          <p className="mt-2 text-lg text-gray-500">Login ke sistem MES + WMS Hummer</p>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{needOtp ? "Verifikasi 2FA" : "Login"}</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {needOtp ? (
              <>
                <p className="text-sm text-gray-500">
                  Akun ini membutuhkan verifikasi 2FA. Masukkan kode OTP yang dikirim ke WhatsApp terdaftar.
                </p>
                <Input
                  label="Kode OTP"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Masukkan kode OTP"
                  autoFocus
                  inputMode="numeric"
                />
              </>
            ) : (
              <>
                <Input
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  autoFocus
                  inputMode="text"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </>
            )}
          </div>

          <Button
            type="submit"
            size="operator"
            className="w-full mt-6"
            disabled={loading || (needOtp ? !otp : !username || !password)}
          >
            {loading ? <Spinner size="md" /> : needOtp ? "Verifikasi OTP" : "Masuk"}
          </Button>
          {needOtp && (
            <button
              type="button"
              onClick={() => { setNeedOtp(false); setOtp(""); setError(""); }}
              className="mt-4 w-full text-center text-sm text-gray-500 hover:underline"
            >
              ← Kembali
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
