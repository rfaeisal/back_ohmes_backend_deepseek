"use client";
import { apiFetch, isSessionExpired, redirectToLogin } from "@/lib/utils/api-client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";


export default function MonthlyPrintRoster() {
  const [monthData, setMonthData] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (isSessionExpired()) { redirectToLogin(); return; }
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

      // Fetch templates
      let templateList: any[] = [];
      try {
        const d = await apiFetch("/shift-templates");
        templateList = d.data || [];
      } catch {}
      setTemplates(templateList);

      // Fetch all roster data for current month using sql
      const allAssignments: any[] = [];
      const usersSet = new Set<string>();
      try {
        const from = firstDay.toISOString().slice(0, 10);
        const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
        const to = lastDay.toISOString().slice(0, 10);
        const data = await apiFetch(`/shift-roster?from=${from}&to=${to}`);
        allAssignments.push(...(data.assignments || []));
        (data.users || []).forEach((u: any) => usersSet.add(JSON.stringify(u)));
      } catch {}

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
          body { font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: avoid; }
          th, td { padding: 2px 3px !important; }
          .shift-0, .shift-1, .shift-2, .shift-3, .shift-4 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
                            {tpl?.name || "✓"}
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
        <div className="mt-4 text-xs">
          <p className="font-semibold mb-1">Keterangan Shift:</p>
          <div className="flex gap-4 flex-wrap">
            {templates.map((t: any, i: number) => (
              <span key={t.id} className={`shift-${i % 5} px-2 py-1 rounded`}>
                {(() => { const st = t.startTime || t.start_time || "00:00"; const [sh, sm] = st.split(":").map(Number); const dur = t.durationMinutes || t.duration_minutes || 0; const eh = (sh! + Math.floor((sm! + dur) / 60)) % 24; const em = (sm! + dur) % 60; return `${t.name} (${t.code}): ${st.slice(0,5)} — ${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}`; })()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
