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

      if (isAdmin) router.push("/admin");
      else if (isSupervisor) router.push("/admin/approvals");
      else if (isCoordinator) router.push("/admin/area-dashboard");
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
          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-left text-blue-700">
            <p className="font-semibold mb-1">👤 Akun Test Tersedia:</p>
            <table className="w-full"><tbody>
              <tr><td className="pr-3 py-0.5 font-mono">admin</td><td className="text-blue-500">→ Admin Dashboard</td></tr>
              <tr><td className="pr-3 py-0.5 font-mono">andi.kecer</td><td className="text-blue-500">→ Tablet Operator</td></tr>
              <tr><td className="pr-3 py-0.5 font-mono">budi.supervisor</td><td className="text-blue-500">→ Approval Shift</td></tr>
              <tr><td className="pr-3 py-0.5 font-mono">citra.gudang</td><td className="text-blue-500">→ Gudang Inbound</td></tr>
              <tr><td className="pr-3 py-0.5 font-mono">dodi.auditor</td><td className="text-blue-500">→ Correction</td></tr>
              <tr><td className="pr-3 py-0.5 font-mono">erik.koordinator</td><td className="text-blue-500">→ Area Dashboard</td></tr>
            </tbody></table>
            <p className="mt-2">Password: <strong>operator123</strong> / <strong>supervisor123</strong> / <strong>gudang123</strong> / <strong>auditor123</strong> / <strong>koordinator123</strong></p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Login</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="andi.kecer"
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
            <Input
              label="Kode OTP (Super Admin)"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="000000 (dev) — kosongkan untuk operator biasa"
            />
          </div>

          <Button
            type="submit"
            size="operator"
            className="w-full mt-6"
            disabled={loading || !username || !password}
          >
            {loading ? <Spinner size="md" /> : "Masuk"}
          </Button>
        </form>
      </div>
    </div>
  );
}
