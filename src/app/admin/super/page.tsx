"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SuperAdminPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const handleAction = async (action: string, path: string, body?: Record<string, string>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setLoading(action);
    setResult(null);
    try {
      const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      setResult(res);
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(null);
    }
  };

  const handleView = async (action: string, path: string) => {
    setLoading(action);
    setResult(null);
    try {
      const res = await apiFetch(path);
      setResult(res);
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">SUPERADMIN Tools</h1>
      <p className="text-gray-500 mb-6">Privileged actions — semua tercatat audit isPrivileged=true</p>

      {result && (
        <div className={`mb-4 rounded-lg p-4 ${result.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
          <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {/* Impersonate */}
      <Card className="mb-4">
        <CardTitle>Impersonate User</CardTitle>
        <div className="mt-4 flex items-end gap-3">
          <Input label="User ID" value={form.uid ?? ""} onChange={e => setForm({...form, uid: e.target.value})} placeholder="UUID" className="flex-1" />
          <Input label="Alasan" value={form.reason ?? ""} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Debug..." className="flex-1" />
          <Button variant="danger"
            disabled={loading === "imp" || !form.uid?.trim() || !form.reason?.trim()}
            onClick={() => handleAction("imp", "/super/impersonate", { userId: form.uid ?? "", reason: form.reason ?? "" }, "Impersonate user ini? Semua aksi tercatat atas nama Anda.")}>
            {loading === "imp" ? "..." : "Impersonate"}
          </Button>
        </div>
      </Card>

      {/* Force Logout */}
      <Card className="mb-4">
        <CardTitle>Force Logout User</CardTitle>
        <div className="mt-4 flex items-end gap-3">
          <Input label="User ID" value={form.fid ?? ""} onChange={e => setForm({...form, fid: e.target.value})} placeholder="UUID" className="flex-1" />
          <Input label="Alasan" value={form.flReason ?? ""} onChange={e => setForm({...form, flReason: e.target.value})} placeholder="Wajib..." className="flex-1" />
          <Button variant="danger"
            disabled={loading === "fl" || !form.fid?.trim() || !form.flReason?.trim()}
            onClick={() => handleAction("fl", `/super/users/${form.fid}/force-logout`, { reason: form.flReason ?? "" }, "Force logout user ini? SEMUA sesi akan direvoke.")}>
            {loading === "fl" ? "..." : "Force Logout"}
          </Button>
        </div>
      </Card>

      {/* Revoke Mobile */}
      <Card className="mb-4">
        <CardTitle>Revoke Mobile Sessions</CardTitle>
        <div className="mt-4 flex items-end gap-3">
          <Input label="User ID" value={form.mid ?? ""} onChange={e => setForm({...form, mid: e.target.value})} placeholder="UUID" className="flex-1" />
          <Input label="Alasan" value={form.rmReason ?? ""} onChange={e => setForm({...form, rmReason: e.target.value})} placeholder="Wajib..." className="flex-1" />
          <Button variant="danger"
            disabled={loading === "rm" || !form.mid?.trim() || !form.rmReason?.trim()}
            onClick={() => handleAction("rm", `/super/users/${form.mid}/sessions/mobile/revoke`, { reason: form.rmReason ?? "" }, "Revoke SEMUA sesi mobile user ini?")}>
            {loading === "rm" ? "..." : "Revoke Mobile"}
          </Button>
        </div>
      </Card>

      {/* View Sessions */}
      <Card className="mb-4">
        <CardTitle>View User Sessions</CardTitle>
        <div className="mt-4 flex items-end gap-3">
          <Input label="User ID" value={form.sid ?? ""} onChange={e => setForm({...form, sid: e.target.value})} placeholder="UUID" className="flex-1" />
          <Button variant="outline" disabled={loading === "vs" || !form.sid?.trim()} onClick={() => handleView("vs", `/super/users/${form.sid}/sessions`)}>
            {loading === "vs" ? "..." : "View Sessions"}
          </Button>
        </div>
      </Card>

      {/* Info */}
      <Card>
        <CardTitle>SUPERADMIN Limits</CardTitle>
        <div className="mt-4 grid grid-cols-4 gap-4">
          {[{ label: "Max Aktif", value: "3" }, { label: "JWT TTL", value: "5 menit" }, { label: "Refresh TTL", value: "7 hari" }, { label: "2FA", value: "WAJIB" }].map(s => (
            <div key={s.label} className="text-center rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
