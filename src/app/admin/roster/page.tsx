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
  const [selectedCell, setSelectedCell] = useState<{ userId: string; date: string } | null>(null);

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

  const assignShift = (userId: string, date: string, templateId: string) => {
    const existing = assignments.findIndex((a: any) => a.userId === userId && a.date === date);
    const next = [...assignments];
    if (templateId === "") {
      if (existing >= 0) next.splice(existing, 1);
    } else if (existing >= 0) {
      next[existing] = { ...next[existing], shiftTemplateId: templateId };
    } else {
      next.push({ userId, date, shiftTemplateId: templateId, shiftRoleId: "ketua_kecer" });
    }
    setAssignments(next);
    setSelectedCell(null);
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
                    const isSelected = selectedCell?.userId === u.id && selectedCell?.date === formatDate(d);
                    return (
                      <td key={i} className="py-2 text-center cursor-pointer" onClick={() => setSelectedCell({ userId: u.id, date: formatDate(d) })}>
                        {isSelected ? (
                          <select
                            className="w-full rounded border border-primary-300 px-1 py-1 text-xs bg-primary-50"
                            value={a?.shiftTemplateId ?? ""}
                            onChange={e => assignShift(u.id, formatDate(d), e.target.value)}
                            autoFocus
                            onBlur={() => setSelectedCell(null)}
                          >
                            <option value="">—</option>
                            {templates.map((t: any) => (
                              <option key={t.id} value={t.id}>{t.name} ({t.start_time?.slice(0,5)})</option>
                            ))}
                          </select>
                        ) : a ? (
                          <Badge variant="info" className="cursor-pointer text-xs">{templates.find((t: any) => t.id === a.shiftTemplateId)?.name ?? "?"}</Badge>
                        ) : (
                          <span className="text-gray-300">—</span>
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

      <div className="mt-4 flex gap-2 flex-wrap">
        <p className="text-sm text-gray-500 w-full">Shift Templates:</p>
        {templates.map((t: any) => (
          <Badge key={t.id} variant="outline">
            {t.name}: {t.start_time?.slice(0, 5)} ({Math.floor(t.duration_minutes / 60)}j {t.duration_minutes % 60}m)
          </Badge>
        ))}
      </div>
    </div>
  );
}
