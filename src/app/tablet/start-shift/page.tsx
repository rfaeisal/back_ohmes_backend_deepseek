"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";

function StartShiftForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const machineId = searchParams.get("machine") ?? "";

  const [templates, setTemplates] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [shiftRoles, setShiftRoles] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [rosterMembers, setRosterMembers] = useState<string[]>([]);
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
      }
      if (p.status === "fulfilled" && p.value.data?.length > 0) {
        setProducts(p.value.data);
        setSelectedProduct(p.value.data[0].id);
      }
      if (u.status === "fulfilled" && u.value.data?.length > 0) setUsers(u.value.data);
      if (r.status === "fulfilled" && r.value.data?.length > 0) setShiftRoles(r.value.data);

      // Load roster for today
      const today = new Date().toISOString().slice(0, 10);
      try {
        const rosterData = await apiFetch(`/shift-roster?weekStart=${today}`);
        if (rosterData) {
          const todayAssignments = (rosterData.assignments || [])
            .filter((a: any) => a.date === today)
            .map((a: any) => a.userId);
          const uniqueUsers = [...new Set(todayAssignments)] as string[];
          setRosterMembers(uniqueUsers);
          setSelectedTeam(uniqueUsers);
        }
      } catch {}
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
        // Sync roster changes (operator may have added/removed members)
        if (rosterMembers.length > 0 || selectedTeam.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const assignments = selectedTeam.map((userId) => ({
            userId, date: today,
            shiftTemplateId: selectedTemplate || templates[0]?.id,
            shiftRoleId: shiftRoles.find((r: any) => r.code === "ketua_kecer")?.id ?? "f57ef947-862f-4cc1-bb95-2d89e8963c11",
          }));
          try {
            await apiFetch("/shift-roster", {
              method: "POST",
              body: JSON.stringify({ weekStart: today, assignments }),
            });
          } catch {}
        }
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
        <CardSubtitle>
          {selectedTeam.length} orang dipilih
          {rosterMembers.length > 0 && <span className="ml-2 text-xs text-primary-600">({rosterMembers.length} dari roster)</span>}
        </CardSubtitle>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {users.length > 0 ? users.map((u: any) => {
            const isFromRoster = rosterMembers.includes(u.id);
            const isSelected = selectedTeam.includes(u.id);
            return (
            <button
              key={u.id}
              onClick={() => toggleMember(u.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                isSelected ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">{u.fullName ?? u.full_name}</span>
              <span className="text-xs text-gray-400 ml-2">@{u.username}</span>
              {isFromRoster && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📋 Roster</span>}
            </button>
            );
          }) : (
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
