"use client";

import Link from "next/link";
import { LayoutDashboard, ClipboardCheck, MapPin, TrendingUp, Wrench, Users, Settings, ScrollText, Shield, Printer, FileText, FileBarChart, Factory, LogOut } from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/approvals", label: "Approval Shift", icon: ClipboardCheck },
  { href: "/admin/area-dashboard", label: "Dashboard Area", icon: MapPin },
  { href: "/admin/analytics", label: "HQ Analytics", icon: TrendingUp },
  { href: "/admin/corrections", label: "Correction", icon: Wrench },
  { href: "/admin/users", label: "Users & Role", icon: Users },
  { href: "/admin/master-data", label: "Master Data", icon: Settings },
  { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
  { href: "/admin/reports/shifts", label: "Laporan Per Shift", icon: FileText },
  { href: "/admin/reports/tsg-receiving", label: "Laporan TSG Masuk", icon: FileBarChart },
  { href: "/admin/labels", label: "Cetak Label", icon: Printer },
  { href: "/admin/super", label: "SUPERADMIN Tools", icon: Shield },
  { href: "/tablet", label: "← Tablet Operator", icon: Factory },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-700">
          <Link href="/admin" className="text-lg font-bold tracking-tight">MES Hummer</Link>
          <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-700 space-y-2">
          <a href="/tablet/login" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
            onClick={(e) => { e.preventDefault(); if (typeof window !== "undefined") { localStorage.removeItem("accessToken"); localStorage.removeItem("refreshToken"); window.location.href = "/tablet/login"; } }}>
            <LogOut className="size-4" />
            Logout
          </a>
          <div className="text-xs text-gray-500">v0.1.0 · Fase 0–6</div>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
