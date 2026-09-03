"use client";
import { apiFetch } from "@/lib/utils/api-client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Pencil, Trash2, Power, PowerOff } from "lucide-react";


// =============================================================================

export default function MasterDataPage() {
  const [plants, setPlants] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Dialog states
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, m, pr, s, st, r, c] = await Promise.allSettled([
        apiFetch("/plants"),
        apiFetch("/machines"),
        apiFetch("/products"),
        apiFetch("/tsg-suppliers"),
        apiFetch("/shift-templates"),
        apiFetch("/regions"),
        apiFetch("/companies"),
      ]);
      if (p.status === "fulfilled") setPlants(p.value.data ?? []);
      if (m.status === "fulfilled") setMachines(m.value.data ?? []);
      if (pr.status === "fulfilled") setProducts(pr.value.data ?? []);
      if (s.status === "fulfilled") setSuppliers(s.value.data ?? []);
      if (st.status === "fulfilled") setShiftTemplates(st.value.data ?? []);
      if (r.status === "fulfilled") setRegions(r.value.data ?? []);
      if (c.status === "fulfilled") setCompanies(c.value.data ?? []);
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
        shiftTemplate: "/shift-templates",
        region: "/regions",
      };
      // 0033: konversi batangPerPack string (Input) → number untuk produk
      const normProduct = (f: any) => ({
        ...f,
        batangPerPack: f.batangPerPack ? parseInt(f.batangPerPack, 10) : undefined,
        tsgType: f.tsgType || undefined,
      });
      const body = type === "shiftTemplate"
        ? { ...form, durationMinutes: parseInt(form.durationMinutes || "660"), plantId: form.plantId || "3b775285-6b60-4ffa-ad7b-5558fc9f3da2" }
        : type === "product" ? normProduct(form) : form;
      await apiFetch(endpoints[type]!, { method: "POST", body: JSON.stringify(body) });
      setShowAdd(null);
      setForm({});
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleToggleActive = async (type: string, id: string, current: boolean) => {
    try {
      if (type === "plant") {
        // Plant uses deletedAt — reactivate = clear deletedAt, deactivate = set deletedAt
        if (current) await apiFetch(`/plants/${id}`, { method: "DELETE" });
        else await apiFetch(`/plants/${id}`, { method: "PATCH", body: JSON.stringify({ deletedAt: null }) });
      } else {
        const endpoints: Record<string, string> = { machine: `/machines/${id}`, product: `/products/${id}`, supplier: `/tsg-suppliers/${id}` };
        await apiFetch(endpoints[type]!, { method: "PATCH", body: JSON.stringify({ isActive: !current }) });
      }
      loadData();
    } catch (e: any) { alert(e.message); }
  };

  const handleEdit = async (type: string) => {
    try {
      const endpoints: Record<string, string> = {
        plant: `/plants/${form.id}`, machine: `/machines/${form.id}`,
        product: `/products/${form.id}`, supplier: `/tsg-suppliers/${form.id}`,
        shiftTemplate: `/shift-templates/${form.id}`,
        region: `/regions/${form.id}`,
      };
      const normProduct = (f: any) => ({
        ...f,
        batangPerPack: f.batangPerPack ? parseInt(f.batangPerPack, 10) : undefined,
        tsgType: f.tsgType || undefined,
      });
      const body = type === "shiftTemplate"
        ? { ...form, durationMinutes: parseInt(form.durationMinutes || "660") }
        : type === "product" ? normProduct(form) : form;
      await apiFetch(endpoints[type]!, { method: "PATCH", body: JSON.stringify(body) });
      setShowAdd(null); setForm({}); loadData();
    } catch (e: any) { alert(e.message); }
  };

  // ---- Riwayat maintenance & downtime level mesin (backlog #2) ----
  const [showMachineHistory, setShowMachineHistory] = useState<any>(null);
  const [histTab, setHistTab] = useState<"maintenance" | "downtime">("maintenance");
  const [histList, setHistList] = useState<any[]>([]);
  const [histForm, setHistForm] = useState<Record<string, string>>({});
  const [histSaving, setHistSaving] = useState(false);
  const [histMsg, setHistMsg] = useState("");

  const openMachineHistory = async (m: any) => {
    setShowMachineHistory(m);
    setHistTab("maintenance");
    setHistForm({});
    setHistMsg("");
    await loadHist(m.id, "maintenance");
  };

  const loadHist = async (machineId: string, tab: "maintenance" | "downtime") => {
    setHistList([]);
    try {
      const res = await apiFetch(`/machines/${machineId}/${tab}`);
      setHistList(res.data ?? []);
    } catch { setHistList([]); }
  };

  const switchHistTab = async (tab: "maintenance" | "downtime") => {
    setHistTab(tab);
    setHistForm({});
    setHistMsg("");
    if (showMachineHistory) await loadHist(showMachineHistory.id, tab);
  };

  const saveHist = async () => {
    if (!showMachineHistory) return;
    setHistSaving(true);
    setHistMsg("");
    try {
      if (histTab === "maintenance") {
        await apiFetch(`/machines/${showMachineHistory.id}/maintenance`, {
          method: "POST",
          body: JSON.stringify({
            maintenanceType: histForm.mType || "PERBAIKAN",
            description: histForm.description,
            // datetime-local → ISO UTC (zod datetime)
            maintenanceAt: histForm.mAt ? new Date(histForm.mAt).toISOString() : undefined,
            notes: histForm.notes || undefined,
          }),
        });
      } else {
        await apiFetch(`/machines/${showMachineHistory.id}/downtime`, {
          method: "POST",
          body: JSON.stringify({
            startedAt: new Date(histForm.startedAt!).toISOString(),
            endedAt: new Date(histForm.endedAt!).toISOString(),
            reason: histForm.reason,
          }),
        });
      }
      setHistMsg("✅ Tersimpan.");
      setHistForm({});
      await loadHist(showMachineHistory.id, histTab);
    } catch (e: any) { setHistMsg(e.message); }
    finally { setHistSaving(false); }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm("Yakin hapus?")) return;
    try {
      const endpoints: Record<string, string> = {
        plant: `/plants/${id}`,
        machine: `/machines/${id}`,
        product: `/products/${id}`,
        supplier: `/tsg-suppliers/${id}`,
        shiftTemplate: `/shift-templates/${id}`,
        region: `/regions/${id}`,
      };
      if (type === "shiftTemplate" && !confirm("Hapus shift template?")) return;
      await apiFetch(endpoints[type]!, { method: "DELETE" });
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Validasi client: tombol Simpan nonaktif sampai field wajib terisi.
  // Field tersembunyi saat edit (code/regionId/companyId) tidak diwajibkan.
  const requiredFields: Record<string, string[]> = {
    machine: ["code", "name", "plantId"],
    plant: ["code", "name", ...(form.id ? [] : ["regionId"])],
    supplier: ["code", "name"],
    product: ["code", "brand"],
    region: ["code", "name", ...(form.id ? [] : ["companyId"])],
    shiftTemplate: ["code", "name", "startTime", "endTime", "plantId"],
  };
  const fieldLabels: Record<string, string> = {
    code: "Kode", name: "Nama", plantId: "Pabrik", regionId: "Area / Region",
    companyId: "Company", brand: "Brand", startTime: "Jam Mulai", endTime: "Jam Selesai",
  };
  const missingFields = showAdd
    ? (requiredFields[showAdd] ?? []).filter((f) => {
        const v = (form as any)[f];
        return v === undefined || v === null || String(v).trim() === "";
      })
    : [];

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
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("region"); }}>+ Area</Button>
          <Button size="sm" onClick={() => { setForm({ type: "MAKER" }); setShowAdd("machine"); }}>+ Mesin</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("product"); }}>+ Produk</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("supplier"); }}>+ Supplier</Button>
          <Button size="sm" onClick={() => { setForm({}); setShowAdd("shiftTemplate"); }}>+ Shift</Button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {/* Plants Table */}
      <div id="plants" className="scroll-mt-16">
      <Card className="mb-6">
        <CardTitle>Pabrik ({plants.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Area</th><th className="pb-3 text-sm font-semibold text-gray-600">Status</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {plants.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">Belum ada pabrik</td></tr>
              ) : plants.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{p.code}</td>
                  <td className="py-3">{p.name}</td>
                  <td className="py-3 text-sm text-gray-500">
                    {(() => { const r = regions.find((x: any) => x.id === p.regionId); return r ? `${r.code} — ${r.name}` : "-"; })()}
                  </td>
                  <td className="py-3"><Badge variant={!p.deletedAt ? "success" : "error"}>{!p.deletedAt ? "AKTIF" : "OFF"}</Badge></td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleToggleActive("plant", p.id, !p.deletedAt)} title={!p.deletedAt ? "Nonaktifkan" : "Aktifkan"}>
                      {!p.deletedAt ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4 text-red-500" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setForm(p); setShowAdd("plant"); }}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("plant", p.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* Regions Table */}
      <div id="regions" className="scroll-mt-16">
      <Card className="mb-6">
        <CardTitle>Area / Region ({regions.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Company</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {regions.length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-gray-400">Belum ada area</td></tr>
              ) : regions.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{r.code}</td>
                  <td className="py-3">{r.name}</td>
                  <td className="py-3 text-sm text-gray-500">{companies.find((c: any) => c.id === r.companyId)?.name ?? "-"}</td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm(r); setShowAdd("region"); }}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("region", r.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* Machines Table */}
      <div id="machines" className="scroll-mt-16">
      <Card className="mb-6">
        <CardTitle>Mesin ({machines.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Tipe</th><th className="pb-3 text-sm font-semibold text-gray-600">Pabrik</th><th className="pb-3 text-sm font-semibold text-gray-600">Status</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {machines.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Belum ada mesin</td></tr>
              ) : machines.map((m: any) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{m.code}</td>
                  <td className="py-3">{m.name}</td>
                  <td className="py-3"><Badge variant="neutral">{m.type}</Badge></td>
                  <td className="py-3 text-sm text-gray-500">
                    {(() => { const p = plants.find((x: any) => x.id === m.plantId); return p ? `${p.code} — ${p.name}` : "-"; })()}
                  </td>
                  <td className="py-3"><Badge variant={m.isActive ? "success" : "error"}>{m.isActive ? "AKTIF" : "OFF"}</Badge></td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleToggleActive("machine", m.id, m.isActive)} title={m.isActive ? "Nonaktifkan" : "Aktifkan"}>
                      {m.isActive ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4 text-red-500" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setForm(m); setShowAdd("machine"); }}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" title="Riwayat maintenance & downtime" onClick={() => openMachineHistory(m)}>🔧</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("machine", m.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* Products & Suppliers */}
      <div className="grid grid-cols-2 gap-6">
        <div id="products" className="scroll-mt-16">
        <Card>
          <CardTitle>Produk ({products.length})</CardTitle>
          <div className="mt-4 space-y-2">
            {products.length === 0 ? <p className="text-center text-gray-400 py-4">Belum ada produk</p> : products.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="font-mono font-medium">{p.code}</p>
                  <p className="text-sm text-gray-500">{p.brand} {p.variant}</p>
                  <Badge variant={p.isActive !== false ? "success" : "error"} className="mt-1">{p.isActive !== false ? "AKTIF" : "OFF"}</Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleToggleActive("product", p.id, p.isActive !== false)} title={p.isActive !== false ? "Nonaktifkan" : "Aktifkan"}>
                    {p.isActive !== false ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4 text-red-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setForm(p); setShowAdd("product"); }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete("product", p.id)}><Trash2 className="size-4 text-red-500" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        </div>
        <div id="suppliers" className="scroll-mt-16">
        <Card>
          <CardTitle>Supplier ({suppliers.length})</CardTitle>
          <div className="mt-4 space-y-2">
            {suppliers.length === 0 ? <p className="text-center text-gray-400 py-4">Belum ada supplier</p> : suppliers.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="font-mono font-medium">{s.code}</p>
                  <p className="text-sm text-gray-500">{s.name} · {s.contactPerson ?? "-"}</p>
                  <Badge variant={s.isActive !== false ? "success" : "error"} className="mt-1">{s.isActive !== false ? "AKTIF" : "OFF"}</Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleToggleActive("supplier", s.id, s.isActive !== false)} title={s.isActive !== false ? "Nonaktifkan" : "Aktifkan"}>
                    {s.isActive !== false ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4 text-red-500" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setForm(s); setShowAdd("supplier"); }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete("supplier", s.id)}><Trash2 className="size-4 text-red-500" /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
        </div>
      </div>

      {/* Shift Templates */}
      <div id="shift-templates" className="scroll-mt-16">
      <Card className="mb-6">
        <CardTitle>Shift Template ({shiftTemplates.length})</CardTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200">
              <tr><th className="pb-3 text-sm font-semibold text-gray-600">Kode</th><th className="pb-3 text-sm font-semibold text-gray-600">Nama</th><th className="pb-3 text-sm font-semibold text-gray-600">Mulai</th><th className="pb-3 text-sm font-semibold text-gray-600">Selesai</th><th className="pb-3 text-sm font-semibold text-gray-600">Durasi</th><th className="pb-3 text-sm font-semibold text-gray-600">Pabrik</th><th className="pb-3 text-sm font-semibold text-gray-600">Aksi</th></tr>
            </thead>
            <tbody>
              {shiftTemplates.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">Belum ada shift template</td></tr>
              ) : shiftTemplates.map((st: any) => {
                const p = (st.startTime || "00:00").split(":");
                const sh = parseInt(p[0] || "0"); const sm = parseInt(p[1] || "0");
                const tm = parseInt(st.durationMinutes) || 0;
                const eh = (sh + Math.floor((sm + tm) / 60)) % 24;
                const em = (sm + tm) % 60;
                const et = `${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}`;
                const cross = (sh * 60 + sm + tm) > 24 * 60;
                return <tr key={st.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 font-mono font-medium">{st.code}</td>
                  <td className="py-3">{st.name}</td>
                  <td className="py-3">{st.startTime}</td>
                  <td className="py-3">{et} {cross && <Badge variant="warning" className="ml-1 text-xs">+1</Badge>}</td>
                  <td className="py-3 text-sm">{Math.floor(tm/60)}j {tm%60}m</td>
                  <td className="py-3 text-sm text-gray-500">{(() => { const pl = plants.find((p: any) => p.id === st.plantId); return pl ? `${pl.name} (${pl.code})` : "-"; })()}</td>
                  <td className="py-3 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setForm(st); setShowAdd("shiftTemplate"); }}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete("shiftTemplate", st.id)}><Trash2 className="size-4 text-red-500" /></Button>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={!!showAdd} onClose={() => setShowAdd(null)} title={`${form.id ? "Edit" : "Tambah"} ${showAdd === "plant" ? "Pabrik" : showAdd === "machine" ? "Mesin" : showAdd === "product" ? "Produk" : showAdd === "supplier" ? "Supplier" : "Shift Template"}`}>
        <div className="space-y-3">
          {showAdd === "region" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="AREA-JATIM" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="Area Jawa Timur" />
            {!form.id && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <select className="w-full rounded-lg border px-4 py-3 bg-white" value={form.companyId ?? ""} onChange={e => setForm({...form, companyId: e.target.value})}>
                  <option value="">Pilih Company</option>
                  {(companies ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </select>
              </div>
            )}
          </>)}
          {showAdd === "plant" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="PLT-MLG-02" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="Pabrik Malang 2" />
            <Input label="Alamat" value={form.address ?? ""} onChange={e => setForm({...form, address: e.target.value})} />
            {!form.id && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Area / Region</label>
                <select className="w-full rounded-lg border px-4 py-3 bg-white" value={form.regionId ?? ""} onChange={e => setForm({...form, regionId: e.target.value})}>
                  <option value="">Pilih Area</option>
                  {regions.map((r: any) => <option key={r.id} value={r.id}>{r.code} — {r.name}</option>)}
                </select>
              </div>
            )}
          </>)}
          {showAdd === "machine" && (<>
            <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="MKR-03" />
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} />
            <label className="block text-sm font-medium text-gray-700">Tipe</label>
            <select className="w-full rounded-lg border px-4 py-3" value={form.type ?? "MAKER"} onChange={e => setForm({...form, type: e.target.value})}>
              <option value="MAKER">MAKER</option><option value="HLP">HLP</option>
            </select>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pabrik</label>
              <select className="w-full rounded-lg border px-4 py-3 bg-white" value={form.plantId ?? ""} onChange={e => setForm({...form, plantId: e.target.value})}>
                <option value="">Pilih Pabrik</option>
                {plants.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
          </>)}
          {showAdd === "product" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="PRD-HMR-LTS" />}
            <Input label="Brand" value={form.brand ?? ""} onChange={e => setForm({...form, brand: e.target.value})} placeholder="Hummer" />
            <Input label="Variant" value={form.variant ?? ""} onChange={e => setForm({...form, variant: e.target.value})} placeholder="LTS" />
            {/* 0033 — satu jenis TSG per produk + batang per pack standar */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jenis TSG</label>
              <select className="w-full rounded-lg border px-4 py-3 bg-white" value={form.tsgType ?? ""} onChange={e => setForm({...form, tsgType: e.target.value})}>
                <option value="">Tidak ditentukan</option>
                <option value="REGULER">REGULER</option>
                <option value="MILD">MILD</option>
                <option value="PUTIHAN">PUTIHAN</option>
              </select>
            </div>
            <Input label="Batang per Pack" type="number" inputMode="numeric" value={form.batangPerPack ?? ""} onChange={e => setForm({...form, batangPerPack: e.target.value})} placeholder="20" />
          </>)}
          {showAdd === "shiftTemplate" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="shift_pagi" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} placeholder="Shift Pagi" />
            <Input label="Jam Mulai" value={form.startTime ?? ""} onChange={e => setForm({...form, startTime: e.target.value})} placeholder="07:00" />
            <Input label="Jam Selesai" value={form.endTime ?? ""} onChange={e => { const sp = (form.startTime || "00:00").split(":"); const sh = parseInt(sp[0]||"0"); const sm = parseInt(sp[1]||"0"); const ep = (e.target.value || "00:00").split(":"); const eh = parseInt(ep[0]||"0"); const em = parseInt(ep[1]||"0"); let dur = (eh*60+em) - (sh*60+sm); if (dur <= 0) dur += 24*60; setForm({...form, endTime: e.target.value, durationMinutes: String(dur)}); }} placeholder="15:00" />
            {form.endTime && form.startTime && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="info">Durasi: {Math.floor(parseInt(form.durationMinutes || "0") / 60)}j {parseInt(form.durationMinutes || "0") % 60}m</Badge>
                {(() => { const sp = (form.startTime || "00:00").split(":"); const sh = parseInt(sp[0]||"0"); const ep = (form.endTime || "00:00").split(":"); const eh = parseInt(ep[0]||"0"); return (eh < sh) ? <Badge variant="warning">Lintas Hari</Badge> : null; })()}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pabrik</label>
              <select className="w-full rounded-lg border px-4 py-3 bg-white" value={form.plantId ?? ""} onChange={e => setForm({...form, plantId: e.target.value})}>
                <option value="">Pilih Pabrik</option>
                {plants.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>
          </>)}
          {showAdd === "supplier" && (<>
            {!form.id && <Input label="Kode" value={form.code ?? ""} onChange={e => setForm({...form, code: e.target.value})} placeholder="SUP-JAWA-03" />}
            <Input label="Nama" value={form.name ?? ""} onChange={e => setForm({...form, name: e.target.value})} />
            <Input label="Kontak" value={form.contactPerson ?? ""} onChange={e => setForm({...form, contactPerson: e.target.value})} />
            <Input label="Telepon" value={form.contactPhone ?? ""} onChange={e => setForm({...form, contactPhone: e.target.value})} />
            <Input label="Alamat" value={form.address ?? ""} onChange={e => setForm({...form, address: e.target.value})} />
          </>)}
          {missingFields.length > 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Lengkapi: {missingFields.map((f) => fieldLabels[f] ?? f).join(", ")}
            </p>
          )}
          <Button size="lg" className="w-full" disabled={missingFields.length > 0} onClick={() => form.id ? handleEdit(showAdd!) : handleAdd(showAdd!)}>
            {form.id ? "Update" : "Simpan"}
          </Button>
        </div>
      </Dialog>

      {/* Riwayat Maintenance & Downtime mesin (backlog #2) */}
      <Dialog open={!!showMachineHistory} onClose={() => setShowMachineHistory(null)} title={`Riwayat Mesin: ${showMachineHistory?.code ?? ""}`}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={histTab === "maintenance" ? "primary" : "outline"} onClick={() => switchHistTab("maintenance")}>🔧 Maintenance</Button>
            <Button size="sm" variant={histTab === "downtime" ? "primary" : "outline"} onClick={() => switchHistTab("downtime")}>⏸ Downtime</Button>
          </div>

          {/* Form tambah cepat */}
          {histTab === "maintenance" ? (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-semibold">Catat Maintenance Baru</p>
              <select className="w-full rounded-lg border px-3 py-2 text-sm bg-white" value={histForm.mType ?? "PERBAIKAN"} onChange={e => setHistForm({ ...histForm, mType: e.target.value })}>
                <option value="PERBAIKAN">Perbaikan</option>
                <option value="PREVENTIVE">Preventive</option>
              </select>
              <Input label="Deskripsi *" value={histForm.description ?? ""} onChange={e => setHistForm({ ...histForm, description: e.target.value })} placeholder="cth: Ganti pisau filter" />
              <Input label="Tanggal (opsional, default sekarang)" type="datetime-local" value={histForm.mAt ?? ""} onChange={e => setHistForm({ ...histForm, mAt: e.target.value })} />
              <Input label="Catatan" value={histForm.notes ?? ""} onChange={e => setHistForm({ ...histForm, notes: e.target.value })} />
              <Button size="sm" disabled={histSaving || !(histForm.description ?? "").trim() || (histForm.description ?? "").trim().length < 3} onClick={saveHist}>
                {histSaving ? "..." : "Simpan Maintenance"}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-semibold">Catat Downtime Baru</p>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Mulai *" type="datetime-local" value={histForm.startedAt ?? ""} onChange={e => setHistForm({ ...histForm, startedAt: e.target.value })} />
                <Input label="Selesai *" type="datetime-local" value={histForm.endedAt ?? ""} onChange={e => setHistForm({ ...histForm, endedAt: e.target.value })} />
              </div>
              <Input label="Alasan *" value={histForm.reason ?? ""} onChange={e => setHistForm({ ...histForm, reason: e.target.value })} placeholder="cth: Motor penggerak panas" />
              <Button size="sm" disabled={histSaving || !(histForm.startedAt ?? "") || !(histForm.endedAt ?? "") || (histForm.reason ?? "").trim().length < 3} onClick={saveHist}>
                {histSaving ? "..." : "Simpan Downtime"}
              </Button>
            </div>
          )}

          {histMsg && <p className={`text-sm ${histMsg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>{histMsg}</p>}

          {/* Daftar */}
          <div className="max-h-64 overflow-y-auto space-y-2">
            {histList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Belum ada catatan {histTab === "maintenance" ? "maintenance" : "downtime"}.</p>
            ) : histList.map((h: any) => (
              <div key={h.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                {histTab === "maintenance" ? (
                  <>
                    <div className="flex justify-between">
                      <Badge variant={h.maintenanceType === "PREVENTIVE" ? "info" : "warning"}>{h.maintenanceType}</Badge>
                      <span className="text-xs text-gray-400">{new Date(h.maintenanceAt).toLocaleString("id-ID")}</span>
                    </div>
                    <p className="mt-1 font-medium">{h.description}</p>
                    {h.notes && <p className="text-xs text-gray-500 mt-1">{h.notes}</p>}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">
                        {new Date(h.startedAt).toLocaleString("id-ID")} → {new Date(h.endedAt).toLocaleTimeString("id-ID")}
                      </span>
                      <span className="text-xs font-medium">
                        {Math.max(0, Math.round((new Date(h.endedAt).getTime() - new Date(h.startedAt).getTime()) / 60000))} menit
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{h.reason}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
