"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GudangRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/gudang"); }, [router]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-gray-500">
      Mengarahkan ke Admin → Gudang...
    </div>
  );
}
