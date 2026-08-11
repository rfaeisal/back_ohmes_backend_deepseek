"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Power, PowerOff } from "lucide-react";

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

const ALL_ROLES = ["SUPERADMIN","HQ_ADMIN","HQ_ANALYST","HQ_AUDITOR","AREA_COORDINATOR","AREA_QA","PLANT_MANAGER","SHIFT_SUPERVISOR","OPERATOR_KECER","OPERATOR_MEMBER","GUDANG_INBOUND","GUDANG_OUTBOUND","EKSPEDISI"];

const SCOPE_TYPES = ["PLANT", "REGION", "COMPANY", "GLOBAL"];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Dialog states
  const [showAdd, setShowAdd] = useState(false);
  const [showAssign, setShowAssign] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes] = await Promise.allSettled([
        apiFetch("/users"),
        apiFetch("/user-assignments"),
      ]);
      const userList = uRes.status === "fulfilled" ? (uRes.value.data ?? []) : [];
      const assignments = aRes.status === "fulfilled" ? (aRes.value.data ?? []) : [];
      // Merge assignments into users
      setUsers(userList.map((u: any) => ({
        ...u,
        assignments: assignments.filter((a: any) => a.userId === u.id),
      })));
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    setSaving(true); setError("");
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify({
        username: form.username, password: form.password, fullName: form.fullName, email: form.email || undefined,
      }) });
      setSuccess("User berhasil dibuat.");
      setShowAdd(false); setForm({}); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      if (currentActive) {
        // Deactivate (soft delete)
        await apiFetch(`/users/${userId}`, { method: "DELETE" });
        setSuccess("User dinonaktifkan.");
      } else {
        // Reactivate — PATCH to set isActive=true
        await apiFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
        setSuccess("User diaktifkan kembali.");
      }
      load();
    } catch (e: any) { setError(e.message); }
  };

  const handleAssignRole = async () => {
    if (!showAssign) return;
    setSaving(true); setError("");
    try {
      await apiFetch("/user-assignments", { method: "POST", body: JSON.stringify({
        userId: showAssign.id,
        scopeType: form.scopeType || "PLANT",
        scopeId: form.scopeId || "3b775285-6b60-4ffa-ad7b-5558fc9f3da2",
        roleCode: form.roleCode || "OPERATOR_KECER",
      }) });
      setSuccess("Role berhasil di-assign.");
      setShowAssign(null); setForm({}); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleRevokeAssignment = async (assignmentId: string) => {
    if (!confirm("Revoke assignment ini?")) return;
    try {
      await apiFetch(`/user-assignments/${assignmentId}`, { method: "DELETE" });
      setSuccess("Assignment di-revoke.");
      load();
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data user...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users & Role</h1>
          <p className="text-gray-500">Kelola user, assignment role, aktif/nonaktif</p>
        </div>
        <Button size="lg" onClick={() => { setForm({}); setError(""); setShowAdd(true); }}>+ Tambah User</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">{success} <button onClick={() => setSuccess("")} className="ml-2 underline">✕</button></div>}

      {/* Users Table */}
      <Card className="mb-6">
        <CardTitle>Daftar User ({users.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="pb-3 text-sm font-semibold text-gray-600">Username</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Nama</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Email</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Role</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Status</th>
                <th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada user</td></tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{u.username}</td>
                  <td className="py-3">{u.fullName}</td>
                  <td className="py-3 text-sm text-gray-500">{u.email ?? "-"}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {(u.assignments ?? []).length === 0 ? (
                        <Badge variant="neutral">No role</Badge>
                      ) : (u.assignments ?? []).map((a: any) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-xs">
                          <Badge variant={a.roleCode === "SUPERADMIN" ? "error" : "info"}>{a.roleCode}</Badge>
                          <button onClick={() => handleRevokeAssignment(a.id)} className="text-red-400 hover:text-red-600" title="Revoke">×</button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3">
                    <Badge variant={u.isActive !== false ? "success" : "error"}>
                      {u.isActive !== false ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setShowAssign(u); setForm({}); setError(""); }}>
                        + Role
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => handleToggleActive(u.id, u.isActive !== false)}
                        title={u.isActive !== false ? "Nonaktifkan" : "Aktifkan"}>
                        {u.isActive !== false ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4 text-red-500" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* All Roles Reference */}
      <Card>
        <CardTitle>13 Role Sistem</CardTitle>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {ALL_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono bg-gray-50">{r}</div>
          ))}
        </div>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onClose={() => setShowAdd(false)} title="Tambah User Baru">
        <div className="space-y-3">
          <Input label="Username" value={form.username ?? ""} onChange={e => setForm({...form, username: e.target.value})} placeholder="andi.kecer" />
          <Input label="Nama Lengkap" value={form.fullName ?? ""} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Andi Kecer" />
          <Input label="Email" value={form.email ?? ""} onChange={e => setForm({...form, email: e.target.value})} placeholder="andi@hummer.example" />
          <Input label="Password" type="password" value={form.password ?? ""} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 8 karakter" />
          <Button size="lg" className="w-full" onClick={handleAdd} disabled={saving || !form.username || !form.password}>
            {saving ? "Menyimpan..." : "Simpan User"}
          </Button>
        </div>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog open={!!showAssign} onClose={() => setShowAssign(null)} title={`Assign Role: ${showAssign?.username ?? ""}`}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select className="w-full rounded-lg border px-4 py-3" value={form.roleCode ?? "OPERATOR_KECER"} onChange={e => setForm({...form, roleCode: e.target.value})}>
              {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type</label>
            <select className="w-full rounded-lg border px-4 py-3" value={form.scopeType ?? "PLANT"} onChange={e => setForm({...form, scopeType: e.target.value})}>
              {SCOPE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Input label="Scope ID" value={form.scopeId ?? ""} onChange={e => setForm({...form, scopeId: e.target.value})} placeholder="UUID plant/region/company" />
          <Button size="lg" className="w-full" onClick={handleAssignRole} disabled={saving}>
            {saving ? "Menyimpan..." : "Assign Role"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
