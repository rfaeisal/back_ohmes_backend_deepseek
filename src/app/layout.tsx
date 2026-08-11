import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MES + WMS Hummer",
  description:
    "Sistem terintegrasi Manufacturing Execution System + Warehouse Management System untuk pabrik rokok multi-cabang",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
