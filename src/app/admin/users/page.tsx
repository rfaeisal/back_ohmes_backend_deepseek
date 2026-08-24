"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Power, PowerOff, Key, Pencil } from "lucide-react";

const ALL_ROLES = ["SUPERADMIN","HQ_ADMIN","HQ_ANALYST","HQ_AUDITOR","AREA_COORDINATOR","AREA_QA","PLANT_MANAGER","SHIFT_SUPERVISOR","OPERATOR_KECER","OPERATOR_MEMBER","GUDANG_INBOUND","GUDANG_OUTBOUND","EKSPEDISI"];

const SCOPE_TYPES = ["PLANT", "REGION", "COMPANY", "GLOBAL"];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Dialog states
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [showAssign, setShowAssign] = useState<any>(null);
  const [showPassword, setShowPassword] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes, pRes, rRes, cRes] = await Promise.allSettled([
        apiFetch("/users"),
        apiFetch("/user-assignments"),
        apiFetch("/plants"),
        apiFetch("/regions"),
        apiFetch("/companies"),
      ]);
      const userList = uRes.status === "fulfilled" ? (uRes.value.data ?? []) : [];
      const assignments = aRes.status === "fulfilled" ? (aRes.value.data ?? []) : [];
      // Merge assignments into users
      setUsers(userList.map((u: any) => ({
        ...u,
        assignments: assignments.filter((a: any) => a.userId === u.id),
      })));
      if (pRes.status === "fulfilled") setPlants(pRes.value.data ?? []);
      if (rRes.status === "fulfilled") setRegions(rRes.value.data ?? []);
      if (cRes.status === "fulfilled") setCompanies(cRes.value.data ?? []);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEditUser = async () => {
    if (!showEdit) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/users/${showEdit.id}`, { method: "PATCH", body: JSON.stringify({ fullName: form.fullName, email: form.email, username: form.username }) });
      setSuccess("User berhasil diupdate.");
      setShowEdit(null); setForm({}); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleAdd = async () => {
    setSaving(true); setError(""); setFieldErrors({});
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify({
        username: form.username, password: form.password, fullName: form.fullName, email: form.email || undefined,
      }) });
      setSuccess("User berhasil dibuat.");
      setShowAdd(false); setForm({}); load();
    } catch (e: any) {
      // Try to parse field-level errors
      try {
        const body = JSON.parse(e.message);
        if (body?.details?.fieldErrors) {
          const errs: Record<string, string> = {};
          for (const [k, v] of Object.entries(body.details.fieldErrors)) {
            errs[k] = (v as string[]).join(", ");
          }
          setFieldErrors(errs);
          return;
        }
      } catch {}
      setError(e.message);
    }
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
        scopeId: form.scopeId,
        roleCode: form.roleCode || "OPERATOR_KECER",
      }) });
      setSuccess("Role berhasil di-assign.");
      setShowAssign(null); setForm({}); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!showPassword) return;
    setSaving(true); setError("");
    try {
      await apiFetch(`/super/users/${showPassword.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: form.newPassword, requireChangeOnNextLogin: false }),
      });
      setSuccess(`Password untuk ${showPassword.username} berhasil direset.`);
      setShowPassword(null); setForm({});
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
        <Button size="lg" onClick={() => { setForm({}); setError(""); setFieldErrors({}); setShowAdd(true); }}>+ Tambah User</Button>
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
                <th className="pb-3 text-sm font-semibold text-gray-600">Role / Scope</th>
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
                    <div className="space-y-1">
                      {(u.assignments ?? []).length === 0 ? (
                        <Badge variant="neutral">No role</Badge>
                      ) : (u.assignments ?? []).map((a: any) => {
                        const scopeName = a.scopeType === "PLANT"
                          ? plants.find((p: any) => p.id === a.scopeId)?.code ?? a.scopeId?.slice(0, 8)
                          : a.scopeType === "REGION"
                          ? regions.find((r: any) => r.id === a.scopeId)?.code ?? a.scopeId?.slice(0, 8)
                          : a.scopeType === "GLOBAL" ? "GLOBAL" : a.scopeId?.slice(0, 8);
                        return (
                          <div key={a.id} className="flex items-center gap-1 text-xs">
                            <Badge variant={a.roleCode === "SUPERADMIN" ? "error" : "info"}>{a.roleCode}</Badge>
                            <span className="text-gray-400 font-mono">{a.scopeType}: {scopeName}</span>
                            <button onClick={() => handleRevokeAssignment(a.id)} className="text-red-400 hover:text-red-600" title="Revoke">×</button>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-3">
                    <Badge variant={u.isActive !== false ? "success" : "error"}>
                      {u.isActive !== false ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setShowEdit(u); setForm({ fullName: u.fullName, email: u.email ?? "", username: u.username }); setError(""); }} title="Edit User">
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowPassword(u); setForm({}); setError(""); }} title="Ganti Password">
                        <Key className="size-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowAssign(u); setForm({ roleCode: "OPERATOR_KECER", scopeType: "PLANT", scopeId: "" }); setError(""); }}>
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
          <Input label="Username" value={form.username ?? ""} onChange={e => setForm({...form, username: e.target.value})} placeholder="kecer" error={fieldErrors.username} />
          <Input label="Nama Lengkap" value={form.fullName ?? ""} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Andi Kecer" error={fieldErrors.fullName} />
          <Input label="Email" value={form.email ?? ""} onChange={e => setForm({...form, email: e.target.value})} placeholder="andi@hummer.example" error={fieldErrors.email} />
          <Input label="Password" type="password" value={form.password ?? ""} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 8 karakter" error={fieldErrors.password} />
          <Button size="lg" className="w-full" onClick={handleAdd} disabled={saving || !form.username || !form.password}>
            {saving ? "Menyimpan..." : "Simpan User"}
          </Button>
        </div>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit User: ${showEdit?.username ?? ""}`}>
        <div className="space-y-3">
          <Input label="Username" value={form.username ?? ""} onChange={e => setForm({...form, username: e.target.value})} />
          <Input label="Nama Lengkap" value={form.fullName ?? ""} onChange={e => setForm({...form, fullName: e.target.value})} />
          <Input label="Email" value={form.email ?? ""} onChange={e => setForm({...form, email: e.target.value})} />
          <Button size="lg" className="w-full" onClick={handleEditUser} disabled={saving}>{saving ? "Menyimpan..." : "Update User"}</Button>
        </div>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={!!showPassword} onClose={() => setShowPassword(null)} title={`Ganti Password: ${showPassword?.username ?? ""}`}>
        <div className="space-y-3">
          <Input label="Password Baru" type="password" value={form.newPassword ?? ""} onChange={e => setForm({...form, newPassword: e.target.value})} placeholder="Min 8 karakter" />
          <Button size="lg" className="w-full" onClick={handleChangePassword} disabled={saving || !form.newPassword || (form.newPassword?.length ?? 0) < 8}>
            {saving ? "Menyimpan..." : "Reset Password"}
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
            <select className="w-full rounded-lg border px-4 py-3" value={form.scopeType ?? "PLANT"} onChange={e => { setForm({...form, scopeType: e.target.value, scopeId: ""}); }}>
              {SCOPE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {form.scopeType === "PLANT" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pabrik</label>
              <select className="w-full rounded-lg border px-4 py-3" value={form.scopeId ?? ""} onChange={e => setForm({...form, scopeId: e.target.value})}>
                <option value="">Pilih Pabrik</option>
                {plants.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
          ) : form.scopeType === "REGION" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Area / Region</label>
              <select className="w-full rounded-lg border px-4 py-3" value={form.scopeId ?? ""} onChange={e => setForm({...form, scopeId: e.target.value})}>
                <option value="">Pilih Area</option>
                {regions.map((r: any) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
              </select>
            </div>
          ) : form.scopeType === "COMPANY" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <select className="w-full rounded-lg border px-4 py-3" value={form.scopeId ?? ""} onChange={e => setForm({...form, scopeId: e.target.value})}>
                <option value="">Pilih Company</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          ) : (
            <Input label="Scope ID" value={form.scopeId ?? ""} onChange={e => setForm({...form, scopeId: e.target.value})} placeholder="UUID GLOBAL" />
          )}
          <Button size="lg" className="w-full" onClick={handleAssignRole} disabled={saving || !form.scopeId}>
            {saving ? "Menyimpan..." : "Assign Role"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
