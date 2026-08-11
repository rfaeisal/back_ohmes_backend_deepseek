import Link from "next/link";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";

export default function AdminOverview() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
      <p className="text-gray-500 mb-8">Kelola sistem MES + WMS Hummer</p>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Pabrik", value: "1", sub: "PLT-MLG-01" },
          { label: "User", value: "1", sub: "1 SUPERADMIN" },
          { label: "Shift Hari Ini", value: "0", sub: "Belum ada" },
          { label: "API Endpoints", value: "40+", sub: "7 fase selesai" },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-400">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* Navigation Cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/admin/approvals", title: "Approval Shift", desc: "Supervisor: review & approve shift COMPLETED → LOCKED", icon: "✅" },
          { href: "/admin/area-dashboard", title: "Dashboard Area", desc: "Koordinator: rollup KPI semua pabrik dalam region", icon: "📍" },
          { href: "/admin/analytics", title: "HQ Analytics", desc: "Analyst: yield trend, OEE, waste benchmark, export cukai", icon: "📈" },
          { href: "/admin/corrections", title: "CORRECTION Flow", desc: "Auditor: koreksi shift LOCKED tanpa mengubah data asli", icon: "🔧" },
          { href: "/admin/users", title: "Users & Role", desc: "Admin: kelola user, assignment, 13 role", icon: "👤" },
          { href: "/admin/master-data", title: "Master Data", desc: "Admin: pabrik, mesin, produk, supplier", icon: "⚙️" },
          { href: "/admin/audit", title: "Audit Log", desc: "Admin/SUPERADMIN: immutable trail semua aktivitas", icon: "📋" },
          { href: "/admin/super", title: "SUPERADMIN Tools", desc: "Impersonate, force logout, revoke session, security log", icon: "🔐" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="flex items-start gap-4">
                <span className="text-3xl">{item.icon}</span>
                <div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardSubtitle>{item.desc}</CardSubtitle>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Fase Status */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Status Fase</h2>
        <div className="grid grid-cols-7 gap-2">
          {["F0 Foundation", "F1 Pilot", "F2 Rollout", "F3 Mobile+QR", "F4 Analytics", "F5 Outbound", "F6 Distribusi"].map((f) => (
            <Card key={f} highlight="green">
              <div className="text-center">
                <p className="text-lg font-bold text-green-700">✅</p>
                <p className="text-xs font-medium text-gray-700">{f}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
