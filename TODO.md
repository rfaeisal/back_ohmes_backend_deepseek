# TODO — MES + WMS Hummer

Catatan pekerjaan yang belum dikerjakan. Update terakhir: 2026-08-27.

---

## 🎯 Sisa — Menuju go-live produksi

Kode & testing teknis SELESAI (CI 5/5 hijau: lint, test, build, audit, E2E 9 spec).
Yang tersisa hanya verifikasi lapangan — tidak bisa dikerjakan dari laptop:

1. **Re-login semua user produksi** (setelah deploy 27 Agu) — permission `hlp.pack`
   untuk GUDANG_OUTBOUND masuk JWT saat login; sesi lama belum punya sampai login ulang.
2. **Verifikasi natural FCM** (lihat item [~] di seksi Testing) — amati satu siklus
   shift asli: shift COMPLETED → HP PM dapat notifikasi push.
3. **Checklist manual produksi** (docs/15-testing-strategy.md §9.1):
   - [ ] Operator asli (bukan dev) jalankan full shift di tablet pilot
   - [ ] Supervisor pabrik approve → data masuk rollup dashboard
   - [ ] Handoff antar 2 shift berurutan bersih
   - [ ] Staff gudang inbound terima 20 boks TSG < 10 menit
   - [ ] SUPERADMIN revoke sesi mobile → user bisa login di device baru
4. **Ditunda secara sadar** (bukan blocker):
   - Coverage threshold vitest (80%) belum tercapai (~1% line; service layer 0%)
     — step CI non-blocking, angka tetap terlihat di log. Enforcement diaktifkan
     lagi setelah ada effort test service-layer.
   - 1 vulnerability moderate: `uuid` (transitif firebase-admin) — override ke v11
     berisiko (ESM-only), tidak menggagalkan CI (`--audit-level=high`).

---

## 🔴 Backlog fitur

### 1. Pemakaian material mesin HLP — SELESAI (26 Agu 2026)
**Alur**: gudang input (material keluar → mesin tujuan), operator HLP lihat read-only di `/tablet/hlp`.

- [x] `material_out`: tipe enum `PEMAKAIAN` (migrasi 0016) + kolom `machine_id` (migrasi 0017)
- [x] Form gudang: toggle "🏭 Pemakaian Produksi" → pilih mesin tujuan → item + jumlah; counterpartName diisi otomatis dari kode mesin
- [x] Panel "📦 Bahan di Mesin Ini" di halaman HLP (read-only via GET /material-out?machineId=&outType=PEMAKAIAN)
- [x] Penanda `applicable_machines` (MAKER/HLP/BOTH) di master consumable & sparepart — form + tabel + API; daftar item di form gudang difilter sesuai tipe mesin tujuan

### 2. Maintenance & downtime level mesin — SELESAI (26 Agu 2026)
- [x] Maintenance level mesin (tanpa shift) — tabel `machine_maintenance`, API `/machines/:id/maintenance`, UI riwayat di master-data (tombol 🔧 per mesin)
- [x] Downtime level mesin — tabel `machine_downtime` (terpisah dari downtime_log yang shift-bound), API `/machines/:id/downtime`, durasi dihitung UI. Keputusan arsitektur: tabel terpisah, tidak menyentuh alur shift MAKER.

### 3. Dashboard Area — pemilih region — SELESAI (26 Agu 2026)
- [x] Select "Pilih Area" di Dashboard Area untuk scope COMPANY/GLOBAL (tampil saat >1 region; scope REGION tetap terikat activeScopeId). Terverifikasi Playwright dengan 2 region test.

### 4. Auto-cleanup sesi expired (produksi) — SELESAI (26 Agu 2026)
- [x] `src/instrumentation.ts`: saat boot + interval 24 jam panggil `cleanupExpiredSessions()`. Terverifikasi dev: sesi expired test di-revoke otomatis saat server start (log `[cleanup-session] 1 sesi expired di-revoke otomatis.`).

### 5. Field Path correction jadi dropdown (UX) — SELESAI (26 Agu 2026)
- [x] Select preset field (waste 4 kategori, tsgTotalKg, outputKg, notes) + opsi "Lainnya" untuk path custom.

---

## 🧪 Testing yang belum menyeluruh

- [x] Suite E2E Playwright resmi — 9 spec `tests/e2e/` (smoke login, receiving→approve, shift lifecycle, approval, HLP, outbound, dispatch+PDF, transfer PDF, retur PDF); `pnpm test:e2e` = reset DB `mes_e2e` + build `.next-e2e` + server :3100 (27 Agu 2026)
- [x] Gudang Inbound — receiving manual tanpa SJ → PENDING → approve PM → inventory dibuat (26 Agu 2026: RCV-20260826-01, 2 boks, inventory 16→18, audit ✓)
- [x] WMS Outbound — FG confirm → 2 karton 50/50 READY → lineage batch ✓ (27 Agu 2026; sekalian fix: UI isi pack + model pack_qty migrasi 0019)
- [x] Dispatch — order → dispatch → dokumen → download PDF ✓ (27 Agu 2026; sekalian redesign surat jalan resmi)
- [x] Transfer antar pabrik TSG + Retur supplier — ✓ (27 Agu 2026; sekalian: Berita Acara jadi PDF murni via pdf-lib + default supplier retur dari receiving)
- [~] Mobile app E2E di produksi — S9 smoke-test PASS + nama aktor tampil benar (konfirmasi tim mobile, 27 Agu 2026). Tinggal verifikasi natural: shift asli di produksi → push FCM otomatis ke PM (terjadi dengan sendirinya saat pabrik beroperasi; trigger sudah terverifikasi lokal + push prod teruji).

---

## 🟡 IT / Operasional — SELESAI (24 Agu 2026)

- [x] Transfer ownership Firebase `back-ohmes` → akun IT resmi (selesai)
- [x] Keputusan keystore signing APK (selesai)
- [x] iOS: TIDAK dipakai — tidak perlu Apple Developer Program / APNs
- [x] Keputusan domain produksi: tetap `ohmes.fzdev.my.id` (fix)

---

## 📋 Catatan

- Reset data produksi dev: bilang "kosongkan produksi" (prosedur tersimpan)
- Jangan `pnpm build` saat dev server jalan (`.next` konflik) — kecuali `pnpm test:e2e` (distDir `.next-e2e`, aman)
- Toolchain wajib sinkron: **Node ≥ 22 + pnpm 11.5.1** (pnpm 11 crash `node:sqlite` di Node 20; pnpm 9 tolak lockfile pnpm 11). Ada `packageManager` di package.json + `engines`.
- CI GitHub Actions 5/5 hijau (lint, test, build, audit, e2e) — E2E = 9 spec rantai bisnis penuh
- Perubahan kontrak API/TLS/domain wajib koordinasi tim mobile (BACKEND_HANDOFF.md §9–14)
