"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  const [plantInfo, setPlantInfo] = useState("PLT-MLG-01 · Pabrik Malang 1");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        if (!token && !window.location.pathname.includes("/login")) { window.location.href = "/tablet/login"; return; }
        // Decode JWT payload
        const payload = JSON.parse(atob(token.split(".")[1]!));
        const plantIds = payload.plantIds ?? [];
        const isPriv = payload.isPrivileged ?? false;
        const roleIds = payload.roleIds ?? [];

        // Admin check: SUPERADMIN or HQ roles
        setIsAdmin(isPriv || roleIds.length > 0);

        // Fetch plant info
        if (plantIds.length > 0) {
          const res = await fetch(`/api/v1/plants`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const plants = data.data ?? [];
            if (plants.length === 1) {
              setPlantInfo(`${plants[0].code} · ${plants[0].name}`);
            } else if (plants.length > 1) {
              setPlantInfo(`${plants.length} pabrik`);
            }
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
            <span>{plantInfo}</span>
            {isAdmin && (
              <>
                <span className="text-gray-300">|</span>
                <a href="/admin" className="text-gray-600 hover:underline font-medium">⚙️ Admin</a>
              </>
            )}
            <span className="text-gray-300">|</span>
            <a href="/tablet/login" className="text-red-600 hover:underline font-medium">Logout</a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
