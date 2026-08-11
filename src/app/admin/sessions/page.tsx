"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Power, PowerOff, Smartphone, Monitor, Trash2 } from "lucide-react";

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

interface SessionInfo {
  id: string;
  userId: string;
  username?: string;
  deviceType: string;
  deviceName: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  loginAt: string;
  expiresAt: string;
  status: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState("");
  const [result, setResult] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Get all users
      const uRes = await apiFetch("/users");
      const userList = (uRes.data ?? []) as any[];

      // Get sessions for each user
      const allSessions: SessionInfo[] = [];
      for (const u of userList) {
        try {
          const sRes = await apiFetch(`/super/users/${u.id}/sessions`);
          const userSessions = (sRes.data ?? []).map((s: any) => ({
            ...s,
            username: u.username,
            fullName: u.fullName,
            userId: u.id,
          }));
          allSessions.push(...userSessions);
        } catch { /* skip users with no sessions */ }
      }
      setSessions(allSessions);
      setUsers(userList);
    } catch { setSessions([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRevoke = async (sessionId: string) => {
    if (!confirm("Revoke sesi ini? User akan logout dari device tersebut.")) return;
    try {
      await apiFetch(`/super/sessions/${sessionId}/revoke`, { method: "POST", body: JSON.stringify({ reason: "Admin revoke" }) });
      setResult("✅ Sesi direvoke.");
      loadAll();
    } catch (e: any) { setResult(`❌ ${e.message}`); }
  };

  const handleRevokeMobile = async (userId: string) => {
    if (!confirm("Revoke SEMUA sesi mobile user ini?")) return;
    try {
      await apiFetch(`/super/users/${userId}/sessions/mobile/revoke`, { method: "POST", body: JSON.stringify({ reason: "Admin revoke all mobile" }) });
      setResult("✅ Semua sesi mobile direvoke.");
      loadAll();
    } catch (e: any) { setResult(`❌ ${e.message}`); }
  };

  const handleForceLogout = async (userId: string) => {
    if (!confirm("Force logout user ini? SEMUA sesi akan direvoke.")) return;
    try {
      await apiFetch(`/super/users/${userId}/force-logout`, { method: "POST", body: JSON.stringify({ reason: "Admin force logout" }) });
      setResult("✅ User di-force logout.");
      loadAll();
    } catch (e: any) { setResult(`❌ ${e.message}`); }
  };

  const filtered = searchUser
    ? sessions.filter((s) => s.username?.toLowerCase().includes(searchUser.toLowerCase()))
    : sessions;

  const activeCount = filtered.filter((s) => s.status === "ACTIVE").length;
  const mobileCount = filtered.filter((s) => s.deviceType === "MOBILE").length;
  const webCount = filtered.filter((s) => s.deviceType === "WEB").length;

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data sesi...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Sesi</h1>
          <p className="text-gray-500">Lihat & kelola semua sesi aktif pengguna</p>
        </div>
        <Button onClick={loadAll} variant="outline" size="sm">🔄 Refresh</Button>
      </div>

      {result && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${result.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {result} <button onClick={() => setResult("")} className="ml-2 underline">✕</button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Sesi Aktif", value: activeCount, icon: <Power className="size-5 text-green-600" /> },
          { label: "Mobile", value: mobileCount, icon: <Smartphone className="size-5 text-blue-600" /> },
          { label: "Web", value: webCount, icon: <Monitor className="size-5 text-gray-600" /> },
        ].map((s) => (
          <Card key={s.label}>
            <div className="flex items-center gap-3">
              {s.icon}
              <div><p className="text-xs text-gray-500">{s.label}</p><p className="text-2xl font-bold">{s.value}</p></div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input placeholder="Cari username..." value={searchUser} onChange={(e) => setSearchUser(e.target.value)} className="max-w-xs" />
      </div>

      {/* Sessions Table */}
      <Card>
        <CardTitle>Semua Sesi ({filtered.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">User</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Device</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">IP</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Login</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Terakhir Aktif</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">Tidak ada sesi aktif</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3">
                    <div className="font-medium">{s.username ?? s.userId?.slice(0, 8)}</div>
                    <div className="text-xs text-gray-400 font-mono">{s.userId?.slice(0, 8)}</div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {s.deviceType === "MOBILE" ? <Smartphone className="size-4 text-blue-500" /> : <Monitor className="size-4 text-gray-500" />}
                      <div>
                        <div className="text-sm">{s.deviceType}</div>
                        {s.deviceName && <div className="text-xs text-gray-400">{s.deviceName}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-sm font-mono text-gray-500">{s.ipAddress ?? "-"}</td>
                  <td className="py-3 text-sm text-gray-500">{s.loginAt ? new Date(s.loginAt).toLocaleString("id-ID") : "-"}</td>
                  <td className="py-3 text-sm text-gray-500">{s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString("id-ID") : "-"}</td>
                  <td className="py-3">
                    <Badge variant={s.status === "ACTIVE" ? "success" : s.status === "EXPIRED" ? "warning" : "error"}>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <Button size="sm" variant="ghost" onClick={() => handleRevoke(s.id)} title="Revoke sesi ini">
                      <PowerOff className="size-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User List untuk bulk action */}
      <Card className="mt-6">
        <CardTitle>Bulk Action per User ({users.length} user)</CardTitle>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {users.map((u: any) => {
            const userSessions = sessions.filter((s) => s.userId === u.id);
            const mobileSessions = userSessions.filter((s) => s.deviceType === "MOBILE");
            if (userSessions.length === 0) return null;
            return (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="font-medium">{u.username}</p>
                  <p className="text-xs text-gray-400">
                    {userSessions.length} sesi ({mobileSessions.length} mobile)
                  </p>
                </div>
                <div className="flex gap-2">
                  {mobileSessions.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => handleRevokeMobile(u.id)} title="Revoke semua mobile">
                      <Smartphone className="size-4 text-red-500" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handleForceLogout(u.id)} title="Force logout semua device">
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
