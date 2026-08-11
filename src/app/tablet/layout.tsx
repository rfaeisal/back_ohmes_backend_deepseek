import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MES Hummer — Tablet Operator",
  description: "Aplikasi tablet lantai produksi MES + WMS Hummer",
};

export default function TabletLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm no-print">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-primary-700">MES Hummer</span>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              Pilot
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>PLT-MLG-01 · Pabrik Malang 1</span>
            <span className="text-gray-300">|</span>
            <a href="/admin" className="text-gray-600 hover:underline font-medium">
              ⚙️ Admin
            </a>
            <span className="text-gray-300">|</span>
            <a href="/tablet/login" className="text-red-600 hover:underline font-medium">
              Logout
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </div>
  );
}
