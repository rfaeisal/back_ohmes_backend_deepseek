import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard — MES Hummer",
};

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: "📊" },
  { href: "/admin/approvals", label: "Approval Shift", icon: "✅", role: "SHIFT_SUPERVISOR" },
  { href: "/admin/area-dashboard", label: "Dashboard Area", icon: "📍", role: "AREA_COORDINATOR" },
  { href: "/admin/analytics", label: "HQ Analytics", icon: "📈", role: "HQ_ANALYST" },
  { href: "/admin/corrections", label: "Correction", icon: "🔧", role: "HQ_AUDITOR" },
  { href: "/admin/users", label: "Users & Role", icon: "👤", role: "HQ_ADMIN" },
  { href: "/admin/master-data", label: "Master Data", icon: "⚙️", role: "HQ_ADMIN" },
  { href: "/admin/audit", label: "Audit Log", icon: "📋", role: "SUPERADMIN" },
  { href: "/admin/super", label: "SUPERADMIN Tools", icon: "🔐", role: "SUPERADMIN" },
  { href: "/admin/reports/shifts", label: "Laporan Per Shift", icon: "📄" },
  { href: "/admin/reports/tsg-receiving", label: "Laporan TSG Masuk", icon: "📋" },
  { href: "/admin/labels", label: "Cetak Label", icon: "🖨" },
  { href: "/tablet", label: "← Tablet Operator", icon: "🏭" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-700">
          <Link href="/admin" className="text-lg font-bold tracking-tight">
            MES Hummer
          </Link>
          <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-700 space-y-2">
          <a
            href="/tablet/login"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window !== "undefined") {
                localStorage.removeItem("accessToken");
                localStorage.removeItem("refreshToken");
                window.location.href = "/tablet/login";
              }
            }}
          >
            <span>🚪</span>
            Logout
          </a>
          <div className="text-xs text-gray-500">v0.1.0 · Fase 0–6</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
