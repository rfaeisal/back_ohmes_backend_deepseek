"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/super/audit?limit=50");
      setLogs(res.data ?? []);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat audit log...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Audit Log</h1>
      <Card>
        <CardTitle>Semua Aktivitas ({logs.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Waktu</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Action</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Entity</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Actor</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Flag</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada aktivitas</td></tr>
              ) : logs.map((log: any) => (
                <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 text-sm font-mono text-gray-500">{new Date(log.createdAt).toLocaleString("id-ID")}</td>
                  <td className="py-3 font-mono text-sm">{log.action}</td>
                  <td className="py-3 text-sm text-gray-500">{log.entityTable}/{log.entityId?.slice(0,8)}</td>
                  <td className="py-3 text-sm">{log.actorUserId?.slice(0,8) ?? "-"}</td>
                  <td className="py-3">
                    {log.isPrivileged ? <Badge variant="error">PRIVILEGED</Badge> : <Badge variant="neutral">NORMAL</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
