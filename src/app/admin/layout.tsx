"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSessionExpired, redirectToLogin } from "@/lib/utils/api-client";
import { canAccessAdmin } from "@/lib/utils/admin-gate";
import Link from "next/link";
import { LayoutDashboard, ClipboardCheck, MapPin, TrendingUp, Wrench, Users, Settings, ScrollText, Shield, Printer, FileText, FileBarChart, Factory, LogOut, Smartphone, Calendar, Package, BarChart3, Menu, X, Recycle } from "lucide-react";

type NavItem = { href: string; label: string; icon: any; permissions?: string[]; superadminOnly?: boolean };
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operasional",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/approvals", label: "Approval Shift", icon: ClipboardCheck, permissions: ["shift.approve"] },
      { href: "/admin/roster", label: "Roster Mingguan", icon: Calendar, permissions: ["shift.member.assign"] },
      { href: "/admin/gudang", label: "Gudang Inbound", icon: Factory, permissions: ["tsg.receiving.create"] },
      { href: "/admin/gudang-outbound", label: "Gudang Outbound", icon: Package, permissions: ["cartoning.create"] },
      { href: "/admin/dispatch", label: "Dispatch", icon: Factory, permissions: ["dispatch.order.create"] },
      { href: "/admin/labels", label: "Cetak Label", icon: Printer, permissions: ["tsg.receiving.create"] },
      { href: "/admin/supplier-sj", label: "Surat Jalan Supplier", icon: FileText, permissions: ["supplier.sj.pool"] },
    ],
  },
  {
    title: "Dashboard",
    items: [
      { href: "/admin/plant-dashboard", label: "Dashboard Pabrik", icon: LayoutDashboard, permissions: ["dashboard.plant.view"] },
      { href: "/admin/area-dashboard", label: "Dashboard Area", icon: MapPin, permissions: ["dashboard.area.view"] },
      { href: "/admin/analytics", label: "HQ Analytics", icon: TrendingUp, permissions: ["dashboard.hq.view"] },
    ],
  },
  {
    title: "Laporan TSG",
    items: [
      { href: "/admin/reports/shifts", label: "Laporan Per Shift", icon: FileText, permissions: ["shift.view"] },
      { href: "/admin/reports/tsg-usage", label: "Penggunaan TSG", icon: BarChart3, permissions: ["shift.view"] },
      { href: "/admin/reports/tsg-stock", label: "Stok TSG", icon: Package, permissions: ["tsg.inventory.view"] },
      { href: "/admin/reports/rijekan", label: "Laporan Rijekan", icon: Recycle, permissions: ["tsg.inventory.view"] },
      { href: "/admin/reports/tsg-receiving", label: "Laporan TSG Masuk", icon: FileBarChart, permissions: ["tsg.receiving.view"] },
      { href: "/admin/reports/tsg-out", label: "TSG Keluar", icon: FileText, permissions: ["tsg.inventory.view"] },
    ],
  },
  {
    title: "Material & Sparepart",
    items: [
      { href: "/admin/reports/material-stock", label: "Stok Material", icon: Package, permissions: ["tsg.inventory.view"] },
      { href: "/admin/reports/material-receiving", label: "Material Masuk", icon: FileBarChart, permissions: ["tsg.receiving.view"] },
      { href: "/admin/reports/material-usage", label: "Pemakaian Material", icon: BarChart3, permissions: ["shift.view"] },
      { href: "/admin/reports/material-out", label: "Material Keluar", icon: FileText, permissions: ["tsg.inventory.view"] },
      { href: "/admin/master-consumables", label: "Master Consumable", icon: Package, permissions: ["masterdata.consumable.edit"] },
      { href: "/admin/master-spareparts", label: "Master Sparepart", icon: Wrench, permissions: ["masterdata.sparepart.edit"] },
    ],
  },
  {
    title: "Master Data",
    items: [
      { href: "/admin/master-data", label: "Master Data (Semua)", icon: Settings, superadminOnly: true },
      { href: "/admin/master-data#machines", label: "Master Mesin", icon: Wrench, superadminOnly: true },
      { href: "/admin/master-data#plants", label: "Master Pabrik", icon: Factory, superadminOnly: true },
      { href: "/admin/master-data#products", label: "Master Produk", icon: Package, superadminOnly: true },
      { href: "/admin/master-data#suppliers", label: "Master Supplier TSG", icon: FileText, superadminOnly: true },
      { href: "/admin/master-data#shift-templates", label: "Master Shift Template", icon: Calendar, superadminOnly: true },
      { href: "/admin/master-data#regions", label: "Master Region & Area", icon: MapPin, superadminOnly: true },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/admin/corrections", label: "Correction", icon: Wrench, permissions: ["shift.correct"], superadminOnly: true },
      { href: "/admin/users", label: "Users & Role", icon: Users, permissions: ["user.assign_scope"], superadminOnly: true },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, permissions: ["audit.read"], superadminOnly: true },
    ],
  },
  {
    title: "SUPERADMIN",
    items: [
      { href: "/admin/sessions", label: "Manajemen Sesi", icon: Smartphone, permissions: ["super.session.view"] },
      { href: "/admin/super", label: "SUPERADMIN Tools", icon: Shield, permissions: ["super.impersonate"] },
    ],
  },
  {
    title: "",
    items: [
      { href: "/tablet", label: "← Tablet Operator", icon: Smartphone, superadminOnly: true },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPrivileged, setIsPrivileged] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSessionExpired()) { redirectToLogin(); return; }
    try {
      const payload = JSON.parse(atob(localStorage.getItem("accessToken")!.split(".")[1]!));
      // Fallback: token lama (pra-RBAC) tidak punya klaim isPrivileged —
      // deteksi juga dari roles di payload supaya SUPERADMIN selalu lengkap.
      const privileged = payload.isPrivileged ?? (Array.isArray(payload.roles) && payload.roles.includes("SUPERADMIN"));
      setIsPrivileged(privileged);
      setUserPermissions(payload.permissions ?? []);

      // Operator lantai (tanpa permission admin) TIDAK boleh masuk /admin —
      // redirect ke /tablet supaya cuma bisa akses KPI-nya.
      if (!canAccessAdmin(payload.permissions ?? [], privileged)) {
        router.replace("/tablet");
      }
    } catch {}
  }, [router]);

  const canSee = (item: { permissions?: string[]; superadminOnly?: boolean }) => {
    if (item.superadminOnly && !isPrivileged) return false;
    return (
      !item.permissions ||
      isPrivileged ||
      item.permissions.some((p) => userPermissions.includes(p))
    );
  };

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
      <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(canSee);
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.title || "bottom"}>
              {section.title && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
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
              </div>
            </div>
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
