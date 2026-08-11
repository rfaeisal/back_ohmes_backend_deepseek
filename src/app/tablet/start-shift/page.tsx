"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/card";

// Mock data
const TEMPLATES = [
  { id: "tpl_siang", name: "Shift Siang", start: "05:30", durasi: "11 jam" },
  { id: "tpl_malam", name: "Shift Malam", start: "16:30", durasi: "13 jam" },
];

const PRODUCTS = [
  { id: "prd_hmr_std", name: "Hummer STD" },
];

const TEAM = [
  { id: "usr_alfi", name: "Alfi (Ketua Kecer)" },
  { id: "usr_ahmadi", name: "Ahmadi" },
  { id: "usr_didik", name: "Didik" },
  { id: "usr_zaini", name: "Zaini" },
];

export default function StartShiftPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const machineId = searchParams.get("machine") ?? "MKR-01";

  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]!.id);
  const [selectedProduct] = useState(PRODUCTS[0]!.id);
  const [selectedTeam, setSelectedTeam] = useState<string[]>(["usr_alfi"]);
  const [loading, setLoading] = useState(false);

  const toggleMember = (userId: string) => {
    setSelectedTeam((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/v1/shifts/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          machineId,
          productId: selectedProduct,
          shiftTemplateId: selectedTemplate,
          members: selectedTeam.map((userId, i) => ({
            userId,
            shiftRoleId: i === 0 ? "role_ketua" : "role_operator",
          })),
        }),
      });

      const data = await res.json();
      if (res.ok && data.shiftId) {
        router.push(`/tablet/shift/${data.shiftId}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Mulai Shift Baru</h1>
        <p className="mt-1 text-lg text-gray-500">Mesin: {machineId} · Pabrik Malang 1</p>
      </div>

      {/* Handoff Banner */}
      <Card highlight="yellow" className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <CardTitle>Carry-over dari shift sebelumnya</CardTitle>
            <CardSubtitle>
              Boks 1 akan partial: 7.20 kg TSG + 6.10 kg batangan sementara
            </CardSubtitle>
          </div>
        </div>
      </Card>

      {/* Template Picker */}
      <Card className="mb-4">
        <CardTitle>Template Shift</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                selectedTemplate === t.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-lg font-bold">{t.name}</p>
              <p className="text-sm text-gray-500">
                Mulai {t.start} · {t.durasi}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Product */}
      <Card className="mb-4">
        <CardTitle>Produk</CardTitle>
        <p className="text-lg font-semibold text-primary-700 mt-2">
          {PRODUCTS[0]!.name}
        </p>
      </Card>

      {/* Team Picker */}
      <Card className="mb-6">
        <CardTitle>Anggota Tim</CardTitle>
        <CardSubtitle>{selectedTeam.length} orang dipilih</CardSubtitle>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {TEAM.map((member) => (
            <button
              key={member.id}
              onClick={() => toggleMember(member.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                selectedTeam.includes(member.id)
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-medium">{member.name}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Submit */}
      <Button
        size="operator"
        className="w-full"
        onClick={handleStart}
        disabled={loading || selectedTeam.length === 0}
      >
        {loading ? "Memulai..." : `Mulai Shift · ${TEMPLATES.find((t) => t.id === selectedTemplate)?.name}`}
      </Button>
    </div>
  );
}
