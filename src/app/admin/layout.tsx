"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, ClipboardCheck, MapPin, TrendingUp, Wrench, Users, Settings, ScrollText, Shield, Printer, FileText, FileBarChart, Factory, LogOut, Smartphone, Calendar, Package, BarChart3, Menu, X } from "lucide-react";

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
  { href: "/admin/reports/tsg-usage", label: "Penggunaan TSG", icon: BarChart3 },
  { href: "/admin/reports/tsg-stock", label: "Stok TSG", icon: Package },
  { href: "/admin/reports/tsg-receiving", label: "Laporan TSG Masuk", icon: FileBarChart },
  { href: "/admin/gudang", label: "Gudang Inbound", icon: Factory },
  { href: "/admin/labels", label: "Cetak Label", icon: Printer },
  { href: "/admin/roster", label: "Roster Mingguan", icon: Calendar },
  { href: "/admin/sessions", label: "Manajemen Sesi", icon: Smartphone },
  { href: "/admin/super", label: "SUPERADMIN Tools", icon: Shield },
  { href: "/tablet", label: "← Tablet Operator", icon: Smartphone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    if (!t) window.location.href = "/tablet/login";
  }, []);

  // Close sidebar on route change (for mobile)
  const closeSidebar = () => setSidebarOpen(false);

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-lg font-bold tracking-tight" onClick={closeSidebar}>MES Hummer</Link>
          <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
        </div>
        {/* Close button — visible only on mobile */}
        <button onClick={closeSidebar} className="lg:hidden text-gray-400 hover:text-white">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              onClick={closeSidebar}
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
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar — always visible on lg+ */}
      <aside className="hidden lg:flex w-60 bg-gray-900 text-white flex-col shrink-0 no-print">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar — off-canvas overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeSidebar} />
          {/* Sidebar panel */}
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-gray-900 text-white flex flex-col z-10 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — hamburger on mobile */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 no-print">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 hover:text-gray-900">
            <Menu className="size-5" />
          </button>
          <span className="font-bold text-gray-900">MES Hummer</span>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">Admin</span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
