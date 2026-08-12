"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const API = "/api/v1";
function getToken() { return typeof window !== "undefined" ? localStorage.getItem("accessToken") : null; }

export default function MonthlyPrintRoster() {
  const [monthData, setMonthData] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { window.location.href = "/tablet/login"; return; }
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch templates
      let templateList: any[] = [];
      try {
        const tRes = await fetch(`${API}/shift-templates`, { headers: { Authorization: `Bearer ${token}` } });
        if (tRes.ok) { const d = await tRes.json(); templateList = d.data || []; }
      } catch {}
      setTemplates(templateList);

      // Fetch all weeks in month (compute Monday of each week)
      const allAssignments: any[] = [];
      const usersSet = new Set<string>();
      for (let w = 0; w < 6; w++) {
        const d = new Date(firstDay); d.setDate(d.getDate() + w * 7);
        // Adjust to Monday (JS getDay: 0=Sun, 1=Mon)
        const dayOfWeek = d.getDay();
        const monday = new Date(d); monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const ws = monday.toISOString().slice(0, 10);
        try {
          const res = await fetch(`${API}/shift-roster?weekStart=${ws}&_t=${Date.now()}`, {
            cache: "no-store", headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            allAssignments.push(...(data.assignments || []));
            (data.users || []).forEach((u: any) => usersSet.add(JSON.stringify(u)));
          }
        } catch {}
      }

      const users = [...usersSet].map((s: string) => JSON.parse(s));
      const monthName = firstDay.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      setMonthData({ monthName, users, assignments: allAssignments, year: firstDay.getFullYear(), month: firstDay.getMonth() });
      setLoading(false);
      setTimeout(() => window.print(), 1000);
    })();
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Menyiapkan jadwal...</div>;

  const { monthName, users, assignments, year, month } = monthData;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 9px; }
          table { page-break-inside: avoid; }
          th, td { padding: 2px 3px !important; }
        }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th, td { border: 1px solid #ddd; padding: 3px 5px; text-align: center; }
        th { background: #f5f5f5; font-weight: 600; }
        .shift-0 { background: #dbeafe; font-size: 9px; padding: 1px 3px; border-radius: 2px; display: inline-block; margin: 1px; }
        .shift-1 { background: #dcfce7; font-size: 9px; padding: 1px 3px; border-radius: 2px; display: inline-block; margin: 1px; }
        .shift-2 { background: #fef3c7; font-size: 9px; padding: 1px 3px; border-radius: 2px; display: inline-block; margin: 1px; }
        .shift-3 { background: #fce7f3; font-size: 9px; padding: 1px 3px; border-radius: 2px; display: inline-block; margin: 1px; }
        .shift-4 { background: #e0e7ff; font-size: 9px; padding: 1px 3px; border-radius: 2px; display: inline-block; margin: 1px; }
      `}</style>

      <div className="no-print p-4 flex gap-3 items-center bg-gray-50 border-b">
        <Button size="sm" onClick={() => window.print()}>🖨 Cetak</Button>
        <Button size="sm" variant="outline" onClick={() => window.close()}>✕ Tutup</Button>
        <h1 className="text-lg font-bold">Jadwal Shift — {monthName}</h1>
      </div>

      <div className="p-4">
        <h1 className="text-xl font-bold text-center mb-4 no-print">Jadwal Shift Bulanan — {monthName}</h1>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th className="w-32">Operator</th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <th key={d} className="text-xs">{d}<br/><span className="text-gray-400">{dayNames[new Date(year, month, d).getDay() === 0 ? 6 : new Date(year, month, d).getDay() - 1]}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td className="text-left font-medium text-xs">{u.full_name ?? u.username}</td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                    const dayAssignments = assignments.filter((a: any) => a.userId === u.id && a.date === date);
                    return (
                      <td key={i}>
                        {dayAssignments.map((a: any, j: number) => {
                          const tpl = templates.find((t: any) => t.id === a.shiftTemplateId);
                          const idx = templates.findIndex((t: any) => t.id === a.shiftTemplateId);
                          return (
                          <span key={j} className={`shift-${idx % 5}`} title={tpl?.name || "?"}>
                            {tpl?.code || "✓"}
                          </span>
                        )})}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
