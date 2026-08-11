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
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            <span className="font-medium">Semua Fase Selesai (0–6)</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            43 tabel database, 40+ API endpoint, 7 halaman tablet UI, 86 test.
            Siap untuk pilot pabrik.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/tablet"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Buka Aplikasi Tablet
          </Link>
          <Link
            href="/admin"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Admin Dashboard
          </Link>
          <Link
            href="/api/v1/health"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cek API Health
          </Link>
        </div>
      </div>
    </main>
  );
}
