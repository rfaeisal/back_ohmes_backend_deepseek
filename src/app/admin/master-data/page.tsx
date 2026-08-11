"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";

const API = "/api/v1";
const TOKEN_KEY = "accessToken";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }
  return res.json();
}

// =============================================================================

export default function MasterDataPage() {
  const [plants, setPlants] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog states
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, m, pr, s] = await Promise.allSettled([
        apiFetch("/plants"),
        apiFetch("/machines"),
        apiFetch("/products"),
        apiFetch("/tsg-suppliers"),
      ]);
      if (p.status === "fulfilled") setPlants(p.value.data ?? []);
      if (m.status === "fulfilled") setMachines(m.value.data ?? []);
      if (pr.status === "fulfilled") setProducts(pr.value.data ?? []);
      if (s.status === "fulfilled") setSuppliers(s.value.data ?? []);
    } catch {
      setError("Gagal memuat data. Pastikan sudah login.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async (type: string) => {
    try {
      const endpoints: Record<string, string> = {
        plant: "/plants",
        machine: "/machines",
        product: "/products",
        supplier: "/tsg-suppliers",
      };
      await apiFetch(endpoints[type]!, { method: "POST", body: JSON.stringify(form) });
      setShowAdd(null);
      setForm({});
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleEdit = async (type: string) => {
    try {
      const endpoints: Record<string, string> = {
        plant: `/plants/${form.id}`, machine: `/machines/${form.id}`,
        product: `/products/${form.id}`, supplier: `/tsg-suppliers/${form.id}`,
      };
      await apiFetch(endpoints[type]!, { method: "PATCH", body: JSON.stringify(form) });
      setShowAdd(null); setForm({}); loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm("Yakin hapus?")) return;
    try {
      const endpoints: Record<string, string> = {
        plant: `/plants/${id}`,
        machine: `/machines/${id}`,
        product: `/products/${id}`,
        supplier: `/tsg-suppliers/${id}`,
      };
      await apiFetch(endpoints[type]!, { method: "DELETE" });
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Memuat data...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Data</h1>
          <p className="text-gray-500">Kelola pabrik, mesin, produk, supplier</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("plant"); }}>+ Pabrik</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("machine"); }}>+ Mesin</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("product"); }}>+ Produk</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("supplier"); }}>+ Supplier</Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* Plants Table */}
      <Card className="mb-6">
        <CardTitle>Pabrik ({plants.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Alamat</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {plants.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">Belum ada pabrik</td></tr>
              ) : plants.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{p.code}</td>
                  <td className="py-3">{p.name}</td>
                  <td className="py-3 text-sm text-gray-500">{p.address ?? "-"}</td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm(p); setShowAdd("plant"); }}>✏️</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("plant", p.id)}>🗑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Machines Table */}
      <Card className="mb-6">
        <CardTitle>Mesin ({machines.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Tipe</th><th className="pb-3 text-sm font-semibold text-gray-600">Status</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {machines.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada mesin</td></tr>
              ) : machines.map((m: any) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{m.code}</td>
                  <td className="py-3">{m.name}</td>
                  <td className="py-3"><Badge variant="neutral">{m.type}</Badge></td>
                  <td className="py-3"><Badge variant={m.isActive ? "success" : "neutral"}>{m.isActive ? "AKTIF" : "OFF"}</Badge></td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm(m); setShowAdd("machine"); }}>✏️</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("machine", m.id)}>🗑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Products & Suppliers */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardTitle>Produk ({products.length})</CardTitle>
          <div className="mt-4 space-y-2">
            {products.length === 0 ? <p className="text-center text-gray-400 py-4">Belum ada produk</p> : products.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div><p className="font-mono font-medium">{p.code}</p><p className="text-sm text-gray-500">{p.brand} {p.variant}</p></div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(p); setShowAdd("product"); }}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete("product", p.id)}>🗑</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Supplier ({suppliers.length})</CardTitle>
          <div className="mt-4 space-y-2">
            {suppliers.length === 0 ? <p className="text-center text-gray-400 py-4">Belum ada supplier</p> : suppliers.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div><p className="font-mono font-medium">{s.code}</p><p className="text-sm text-gray-500">{s.name} · {s.contactPerson ?? "-"}</p></div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(s); setShowAdd("supplier"); }}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete("supplier", s.id)}>🗑</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={!!showAdd} onClose={() => setShowAdd(null)} title={`${form.id ? "Edit" : "Tambah"} ${showAdd === "plant" ? "Pabrik" : showAdd === "machine" ? "Mesin" : showAdd === "product" ? "Produk" : "Supplier"}`}>
        <div className="space-y-3">
          {showAdd === "plant" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="PLT-MLG-02" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="Pabrik Malang 2" />
            <Input label="Alamat" value={form.address ?? ""} onChange={e => setForm({...form, address: e.target.value})} />
            {!form.id && <Input label="Region ID" value={form.regionId ?? ""} onChange={e => setForm({...form, regionId: e.target.value})} placeholder="UUID region" />}
          </>)}
          {showAdd === "machine" && (<>
            <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="MKR-03" />
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} />
            <label className="block text-sm font-medium text-gray-700">Tipe</label>
            <select className="w-full rounded-lg border px-4 py-3" value={form.type ?? "MAKER"} onChange={e => setForm({...form, type: e.target.value})}>
              <option value="MAKER">MAKER</option><option value="HLP">HLP</option>
            </select>
            <Input label="Plant ID" value={form.plantId ?? ""} onChange={e => setForm({...form, plantId: e.target.value})} placeholder="UUID plant" />
          </>)}
          {showAdd === "product" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="PRD-HMR-LTS" />}
            <Input label="Brand" value={form.brand ?? ""} onChange={e => setForm({...form, brand: e.target.value})} placeholder="Hummer" />
            <Input label="Variant" value={form.variant ?? ""} onChange={e => setForm({...form, variant: e.target.value})} placeholder="LTS" />
          </>)}
          {showAdd === "supplier" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="SUP-JAWA-03" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Kontak" value={form.contactPerson ?? ""} onChange={e => setForm({...form, contactPerson: e.target.value})} />
            <Input label="Telepon" value={form.contactPhone ?? ""} onChange={e => setForm({...form, contactPhone: e.target.value})} />
            <Input label="Alamat" value={form.address ?? ""} onChange={e => setForm({...form, address: e.target.value})} />
          </>)}
          <Button size="lg" className="w-full" onClick={() => form.id ? handleEdit(showAdd!) : handleAdd(showAdd!)}>
            {form.id ? "Update" : "Simpan"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
