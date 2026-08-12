"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
  });
  if (!res.ok) return { users: [], templates: [], assignments: [] };
  return res.json();
}

function getWeekDates(weekStart: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function RosterPage() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1);

  const [weekStart, setWeekStart] = useState(monday);
  const [users, setUsers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const ws = formatDate(weekStart);
    const data = await apiFetch(`/shift-roster?weekStart=${ws}`);
    setUsers(data.users ?? []);
    setTemplates(data.templates ?? []);
    setAssignments(data.assignments ?? []);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const dates = getWeekDates(weekStart);
  const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  const getAssignment = (userId: string, date: string) => {
    return assignments.find((a: any) => a.userId === userId && a.date === date);
  };

  const toggleCell = (userId: string, date: string) => {
    if (!activeTemplate) return;
    const existing = assignments.findIndex((a: any) => a.userId === userId && a.date === date);
    const next = [...assignments];
    if (existing >= 0) {
      // If same template → remove assignment. If different → switch.
      if (next[existing]!.shiftTemplateId === activeTemplate) {
        next.splice(existing, 1);
      } else {
        next[existing] = { ...next[existing]!, shiftTemplateId: activeTemplate };
      }
    } else {
      next.push({ userId, date, shiftTemplateId: activeTemplate, shiftRoleId: "ketua_kecer" });
    }
    setAssignments(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getToken();
      await fetch(`${API}/shift-roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ weekStart: formatDate(weekStart), assignments }),
      });
      alert("✅ Roster disimpan!");
    } catch { alert("❌ Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const prevWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); };
  const nextWeek = () => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat roster...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Roster Mingguan</h1>
          <p className="text-gray-500">
            {formatDate(weekStart)} — {formatDate(dates[6]!)}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={prevWeek}><ChevronLeft className="size-4" /></Button>
            <Button size="sm" variant="outline" onClick={nextWeek}><ChevronRight className="size-4" /></Button>
          </div>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "💾 Simpan Roster"}</Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 text-sm font-semibold text-gray-600 w-40 sticky left-0 bg-white">Operator</th>
                {dates.map((d, i) => (
                  <th key={i} className="pb-3 text-sm font-semibold text-gray-600 text-center min-w-[100px]">
                    {dayNames[i]}<br /><span className="text-xs text-gray-400">{formatDate(d).slice(5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">Belum ada user. Tambah user di /admin/users</td></tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 sticky left-0 bg-white">
                    <div className="font-medium text-sm">{u.full_name ?? u.username}</div>
                    <div className="text-xs text-gray-400 font-mono">@{u.username}</div>
                  </td>
                  {dates.map((d, i) => {
                    const a = getAssignment(u.id, formatDate(d));
                    const tpl = templates.find((t: any) => t.id === a?.shiftTemplateId);
                    return (
                      <td key={i} className={`py-2 text-center cursor-pointer transition-colors ${activeTemplate ? 'hover:bg-primary-50' : ''}`}
                        onClick={() => toggleCell(u.id, formatDate(d))}>
                        {a ? (
                          <Badge variant="info" className="text-xs">{tpl?.name ?? "?"}</Badge>
                        ) : (
                          <span className="text-gray-300">{activeTemplate ? "Klik untuk isi" : "—"}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm font-semibold text-gray-700 mb-3">🎯 Pilih shift template dulu, lalu klik di tabel:</p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={activeTemplate === "" ? "primary" : "outline"} onClick={() => setActiveTemplate("")}>
            ✋ Lepas (hapus assignment)
          </Button>
          {templates.map((t: any) => (
            <Button key={t.id} size="sm" variant={activeTemplate === t.id ? "primary" : "outline"} onClick={() => setActiveTemplate(t.id)}>
              {t.name} ({t.start_time?.slice(0,5)} — {Math.floor(t.duration_minutes/60)}j)
            </Button>
          ))}
        </div>
        {activeTemplate && <p className="text-xs text-primary-600 mt-2">Klik sel di tabel untuk assign shift. Klik lagi sel yang sudah ada untuk hapus.</p>}
      </div>
    </div>
  );
}
