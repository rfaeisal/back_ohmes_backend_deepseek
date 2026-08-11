import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          MES + WMS{" "}
          <span className="text-primary-600">Hummer</span>
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Manufacturing Execution System &amp; Warehouse Management System
          <br />
          untuk operasi pabrik rokok multi-cabang
        </p>
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 text-left">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Status
          </h2>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="font-medium">Fase 0 — Foundation (dalam pengerjaan)</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            API Foundation, skema database, RBAC, dan autentikasi sedang
            disiapkan. Fitur operasional dimulai di Fase 1.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/api/v1/health"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Cek API Health
          </Link>
          <Link
            href="/docs"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Dokumentasi
          </Link>
        </div>
      </div>
    </main>
  );
}
