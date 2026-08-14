"use client";

import { useState, useEffect } from "react";
import { isSessionExpired, redirectToLogin, apiFetch } from "@/lib/utils/api-client";
import Link from "next/link";

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  const [plantInfo, setPlantInfo] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        if (isSessionExpired()) {
          if (!window.location.pathname.includes("/login")) redirectToLogin();
          return;
        }
        const token = localStorage.getItem("accessToken");
        if (!token) { if (!window.location.pathname.includes("/login")) window.location.href = "/tablet/login"; return; }
        // Decode JWT payload
        const payload = JSON.parse(atob(token.split(".")[1]!));
        const plantIds = payload.plantIds ?? [];
        const isPriv = payload.isPrivileged ?? false;

        // Admin link hanya untuk SUPERADMIN
        setIsAdmin(isPriv);

        // Fetch plant info
        if (plantIds.length > 0) {
          const data = await apiFetch("/plants");
          const plants = data.data ?? [];
          if (plants.length === 1) {
            setPlantInfo(`${plants[0].code} · ${plants[0].name}`);
          }
        }
      } catch {}
    };
    loadUserInfo();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm no-print">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/tablet" className="text-xl font-bold text-primary-700 hover:underline">MES Hummer</Link>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Pilot</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            {plantInfo && <span>{plantInfo}</span>}
            {isAdmin && (
              <Link href="/admin" className="text-gray-600 hover:underline font-medium">⚙️ Admin</Link>
            )}
            <Link href="/tablet/login" className="text-red-600 hover:underline font-medium"
              onClick={(e) => { e.preventDefault(); localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); window.location.href = "/tablet/login"; }}>
              Logout
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
