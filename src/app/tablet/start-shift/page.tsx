"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: { message: res.statusText } })); throw new Error(err.error?.message ?? res.statusText); }
  return res.json();
}

// Mock fallback data
const MOCK_TEMPLATES = [
  { id: "tpl_siang", code: "shift_siang", name: "Shift Siang", startTime: "05:30", durationMinutes: 660 },
  { id: "tpl_malam", code: "shift_malam", name: "Shift Malam", startTime: "16:30", durationMinutes: 780 },
];
const MOCK_PRODUCTS = [{ id: "prd_hmr_std", code: "PRD-HMR-STD", brand: "Hummer", variant: "STD" }];
const MOCK_USERS: any[] = [];

function StartShiftForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const machineId = searchParams.get("machine") ?? "MKR-01";

  const [templates, setTemplates] = useState(MOCK_TEMPLATES);
  const [products, setProducts] = useState(MOCK_PRODUCTS);
  const [users, setUsers] = useState(MOCK_USERS);
  const [shiftRoles, setShiftRoles] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMasterData = useCallback(async () => {
    try {
      const [t, p, u, r] = await Promise.allSettled([
        apiFetch("/shift-templates"),
        apiFetch("/products"),
        apiFetch("/users"),
        apiFetch("/shift-roles"),
      ]);
      if (t.status === "fulfilled" && t.value.data?.length > 0) {
        setTemplates(t.value.data);
        setSelectedTemplate(t.value.data[0].id);
      } else { setSelectedTemplate(MOCK_TEMPLATES[0]!.id); }
      if (p.status === "fulfilled" && p.value.data?.length > 0) {
        setProducts(p.value.data);
        setSelectedProduct(p.value.data[0].id);
      } else { setSelectedProduct(MOCK_PRODUCTS[0]!.id); }
      if (u.status === "fulfilled" && u.value.data?.length > 0) setUsers(u.value.data);
      if (r.status === "fulfilled" && r.value.data?.length > 0) setShiftRoles(r.value.data);
    } catch { /* gunakan mock */ }
  }, []);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);

  const toggleMember = (userId: string) => {
    setSelectedTeam((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleStart = async () => {
    setError("");
    setLoading(true);
    try {
      const body: any = {
        machineId,
        productId: selectedProduct || products[0]?.id,
        shiftTemplateId: selectedTemplate || templates[0]?.id,
        members: selectedTeam.map((userId) => ({
          userId,
          shiftRoleId: shiftRoles.find((r: any) => r.code === "ketua_kecer")?.id ?? shiftRoles[0]?.id ?? userId,
        })),
      };
      const res = await apiFetch("/shifts/start", { method: "POST", body: JSON.stringify(body) });
      if (res.shiftId) {
        router.push(`/tablet/shift/${res.shiftId}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTpl = templates.find((t: any) => t.id === selectedTemplate) ?? templates[0];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mulai Shift Baru</h1>
        <p className="mt-1 text-lg text-gray-500">Mesin: {machineId} · Pabrik Malang 1</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Handoff Banner (jika ada) */}
      <Card highlight="yellow" className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <CardTitle>Cek carry-over shift sebelumnya</CardTitle>
            <CardSubtitle>Sistem akan auto-claim handoff jika ada TSG tersisa dari shift sebelumnya.</CardSubtitle>
          </div>
        </div>
      </Card>

      {/* Template Picker */}
      <Card className="mb-4">
        <CardTitle>Template Shift</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {templates.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                selectedTemplate === t.id ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-lg font-bold">{t.name}</p>
              <p className="text-sm text-gray-500">
                Mulai {t.startTime} · {t.durationMinutes} menit
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Product */}
      <Card className="mb-4">
        <CardTitle>Produk</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {products.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelectedProduct(p.id)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                selectedProduct === p.id ? "border-primary-500 bg-primary-50" : "border-gray-200"
              }`}
            >
              <p className="text-lg font-bold text-primary-700">{p.brand} {p.variant}</p>
              <p className="text-sm text-gray-500 font-mono">{p.code}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Team Picker */}
      <Card className="mb-6">
        <CardTitle>Anggota Tim</CardTitle>
        <CardSubtitle>{selectedTeam.length} orang dipilih</CardSubtitle>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {users.length > 0 ? users.map((u: any) => (
            <button
              key={u.id}
              onClick={() => toggleMember(u.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                selectedTeam.includes(u.id) ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">{u.fullName}</span>
              <span className="text-xs text-gray-400 ml-2">@{u.username}</span>
            </button>
          )) : (
            <p className="text-sm text-gray-400 col-span-2">Data user diambil dari server saat login...</p>
          )}
        </div>
      </Card>

      {/* Submit */}
      <Button
        size="operator"
        className="w-full"
        onClick={handleStart}
        disabled={loading || selectedTeam.length === 0}
      >
        {loading ? "Memulai..." : `Mulai Shift · ${selectedTpl?.name ?? ""}`}
      </Button>
    </div>
  );
}

export default function StartShiftPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Memuat...</div>}>
      <StartShiftForm />
    </Suspense>
  );
}
