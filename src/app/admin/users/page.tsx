"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/users");
      setUsers(res.data ?? []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Users & Role</h1>
      <Card>
        <CardTitle>Daftar User ({users.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Username</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Email</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">Belum ada user</td></tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{u.username}</td>
                  <td className="py-3">{u.fullName}</td>
                  <td className="py-3 text-sm text-gray-500">{u.email ?? "-"}</td>
                  <td className="py-3"><Badge variant={u.isActive ? "success" : "neutral"}>{u.isActive ? "ACTIVE" : "OFF"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {["SUPERADMIN","HQ_ADMIN","HQ_ANALYST","HQ_AUDITOR","AREA_COORDINATOR","AREA_QA","PLANT_MANAGER","SHIFT_SUPERVISOR","OPERATOR_KECER","OPERATOR_MEMBER","GUDANG_INBOUND","GUDANG_OUTBOUND","EKSPEDISI"].map(r => (
          <div key={r} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono bg-gray-50">{r}</div>
        ))}
      </div>
    </div>
  );
}
