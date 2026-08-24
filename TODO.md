# TODO — MES + WMS Hummer

Catatan pekerjaan yang belum dikerjakan. Update terakhir: 2026-08-24.

---

## 🔴 Backlog fitur

### 1. Pemakaian material mesin HLP (dibahas 24 Agu 2026)
**Alur**: gudang input (material keluar → mesin tujuan), operator HLP lihat read-only di `/tablet/hlp`.

- [ ] `material_out`: tambah tipe enum `PEMAKAIAN` + kolom opsional `machine_id`
- [ ] Form gudang: material keluar → tipe "Pemakaian Produksi" → pilih mesin tujuan → item + jumlah (stok berkurang otomatis)
- [ ] Panel "Bahan di mesin ini" di halaman HLP (read-only, daftar material yang dikeluarkan gudang ke HLP-01)
- [ ] **Penanda mesin berlaku di master consumable DAN sparepart** (MAKER / HLP / keduanya) — form gudang hanya tampilkan item yang relevan untuk mesin tujuan

### 2. Maintenance & downtime level mesin (pertimbangan — belum diputuskan)
- [ ] Maintenance level mesin (tanpa shift) — catatan perbaikan/preventive per mesin
- [ ] Downtime level mesin untuk HLP — perlu keputusan arsitektur (downtime_log sekarang terikat shift_report; HLP tidak punya shift)

### 3. Dashboard Area — pemilih region
- [ ] Batasan: user scope COMPANY melihat region pertama saja; butuh pemilih region di UI kalau HQ punya >1 region

### 4. Auto-cleanup sesi expired (produksi)
- [ ] `user_session` tumbuh tiap login tanpa pembersihan — fungsi `cleanupExpiredSessions()` sudah ada di `lib/auth` tapi tidak ada yang memanggil berkala. Perlu job terjadwal (cron Coolify / Vercel) atau panggil saat server start. Temuan saat audit halaman Sessions (378 sesi numpuk di dev).

### 5. Field Path correction jadi dropdown (UX)
- [ ] Halaman Corrections: Field Path masih free-text (`waste.MENIR.kg`) — auditor harus hafal nama path. Ganti dengan dropdown field yang tersedia (waste per kategori, pemakaian material, dll) saat membuat koreksi.

---

## 🧪 Testing yang belum menyeluruh

- [ ] Gudang Inbound — receiving manual tanpa SJ (approve → inventory dibuat)
- [ ] WMS Outbound — finished goods, cartoning, lineage
- [ ] Dispatch — order → dispatch → surat jalan download
- [ ] Transfer antar pabrik TSG + Retur supplier TSG (dokumen Berita Acara cetak)
- [ ] Mobile app E2E di produksi (shift asli → push FCM otomatis)

---

## 🟡 IT / Operasional — SELESAI (24 Agu 2026)

- [x] Transfer ownership Firebase `back-ohmes` → akun IT resmi (selesai)
- [x] Keputusan keystore signing APK (selesai)
- [x] iOS: TIDAK dipakai — tidak perlu Apple Developer Program / APNs
- [x] Keputusan domain produksi: tetap `ohmes.fzdev.my.id` (fix)

---

## 📋 Catatan

- Reset data produksi dev: bilang "kosongkan produksi" (prosedur tersimpan)
- Jangan `pnpm build` saat dev server jalan (`.next` konflik)
- Perubahan kontrak API/TLS/domain wajib koordinasi tim mobile (BACKEND_HANDOFF.md §9–14)
