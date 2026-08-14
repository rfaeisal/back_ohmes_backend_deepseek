# 08 · Roadmap — 7 Fase Pengembangan (v2, dengan WMS Expansion)

Roadmap end-to-end dari foundation sampai distribusi. Fase dieksekusi berurutan; tiap fase punya **acceptance criteria** yang wajib lulus sebelum fase berikutnya dimulai.

> **Total estimasi**: 30–36 minggu (~7–8.5 bulan) dari kick-off Fase 0 sampai selesai Fase 6, dengan 1 tim fullstack (2–3 dev + 1 mobile dev di Fase 3).
> **Pilot pabrik untuk Fase 1**: rekomendasi 1 pabrik yang jaraknya dekat dengan tim dev (misalnya `PLT-MLG-01`) supaya iterasi cepat.
> **Perubahan dari v1**: Fase 1 sekarang include WMS Inbound (basic receiving + inventory FIFO). Tambah Fase 5 (WMS Outbound / Cartoning) dan Fase 6 (Distribusi Basic).

---

## Ringkasan

| Fase | Nama | Estimasi | Fokus | Klien |
|---|---|---|---|---|
| **0** | Foundation | 3–4 minggu | Multi-tenant schema, RBAC, auth, master data (termasuk WMS Inbound tables) | Backend only |
| **1** | Pilot 1 Pabrik: **MES Produksi + WMS Inbound Basic** | 6–8 minggu | Shift + boks + waste + handoff + **receiving TSG + inventory FIFO** | Web tablet |
| **2** | Rollout Multi-Pabrik + Area | 4 minggu | Rollup KPI, dashboard koordinator, approval workflow | Web dashboard |
| **3** | Mobile Flutter + QR | 6–8 minggu | Mobile app, QR generation/scanner (mesin + TSG boks), local queue | Flutter + web print |
| **4** | HQ Analytics | 4 minggu | Cross-plant KPI, OEE, waste analytics, inventory age, export cukai | Web dashboard HQ |
| **5** | **WMS Outbound (BARU)** | 4–5 minggu | Auto-receive pack dari HLP + cartoning + traceability karton↔pack | Web tablet gudang |
| **6** | **Distribusi Basic (BARU)** | 3 minggu | DispatchOrder + surat jalan PDF + tracking status karton | Web tablet ekspedisi |

---

## Fase 0 — Foundation (3–4 minggu)

### Goal
Skema multi-tenant, RBAC, autentikasi, dan CRUD master data siap — termasuk skeleton WMS Inbound. **Tidak ada fitur operasional**.

### In Scope
- Setup Next.js 15 + Drizzle + PostgreSQL 16 + JWT auth.
- Tabel tenancy: `Company`, `Region`, `Plant`, `User`, `UserAssignment`, `Role`, `Permission`, `RolePermission`, `AuthPolicy`.
- Tabel master produksi: `Product`, `PlantProduct`, `Machine`, `MachineTemplate`, `ConsumableItem`, `Sparepart`, `ShiftRole`, `ShiftTemplate`, `DowntimeCategory`, `RejectReason`.
- **Tabel master WMS Inbound: `TsgSupplier`** (basic CRUD).
- RLS policy semua tabel operasional (belum ada datanya, policy sudah aktif). Support session `app.bypass_rls` untuk SUPERADMIN.
- API endpoint: auth (`login` dengan 2FA support, `refresh`, `logout`, `me`), master data CRUD (hanya HQ_ADMIN), termasuk `/tsg-suppliers`.
- **Role SUPERADMIN aktif** + endpoint `/super/*` (audit, security-log, impersonate, force-logout, reset-password, superadmin.assign). Skema `auth_policy` untuk SUPERADMIN (5 menit + 2FA + max 3 aktif).
- Role baru: `GUDANG_INBOUND` (permission siap tapi belum ada fitur).
- Seed data: 1 company, 1 region, 1 plant (untuk pilot), 3 machine, 1 product, 3 shift template, 2 supplier contoh.
- Bootstrap SUPERADMIN pertama lewat `npm run seed:superadmin`.
- CI/CD pipeline (build, lint, test, migration deploy).
- `AuditLog` tabel aktif untuk semua mutasi master data + kolom `is_privileged`.
- **Security Log** tabel + service handler (login attempts, permission denied, session revoked, IP suspicious).
- 2FA integration (WhatsApp OTP via Twilio API atau TOTP library).

### Out of Scope
- Fitur operasional (shift report, boks, downtime) — masuk Fase 1.
- UI selain login + halaman master data sederhana.
- Mobile.

### Acceptance Criteria
- [ ] HQ_ADMIN bisa login lewat `/api/v1/auth/login`, terima JWT + refresh token.
- [ ] HQ_ADMIN bisa CRUD `Product`, `Machine`, `MachineTemplate` lewat API.
- [ ] User dengan role terbatas (mis. OPERATOR_KECER) yang belum di-assign scope → API tolak dengan 403 saat mengakses data plant lain.
- [ ] RLS policy terverifikasi lewat test: SELECT dari `shift_report` (walau kosong) hanya balik data plant sesuai session.
- [ ] **SUPERADMIN bootstrap**: CLI script bikin 1 SUPERADMIN pertama, bisa login dengan 2FA.
- [ ] **SUPERADMIN bypass RLS**: SELECT lintas company works dari endpoint `/super/audit`.
- [ ] **SUPERADMIN limit**: assign SUPERADMIN ke-4 → 400 `SUPERADMIN_LIMIT_REACHED`.
- [ ] **Privileged action tercatat**: impersonate + force-logout → audit log `is_privileged=true` + notif ke SUPERADMIN lain.
- [ ] **Session pendek SUPERADMIN**: JWT expiry 5 menit terverifikasi (bukan 15).
- [ ] Migration rollback berhasil di CI.
- [ ] Test coverage: minimal 70% di service layer.

### Risk
- **RLS policy salah setup** → data leak antar plant. Mitigasi: test suite khusus RLS, review manual senior dev.
- **Auth JWT rotation buggy** → user logout mendadak. Mitigasi: refresh token flow tested with expiry simulation.

---

## Fase 1 — Pilot 1 Pabrik: MES Produksi + WMS Inbound Basic (6–8 minggu)

### Goal
Satu pabrik pilot menjalankan **alur end-to-end dari receiving TSG sampai shift approved**: staff gudang inbound catat TSG masuk → operator kecer open boks dari inventory → produksi tercatat → shift APPROVED. Sistem enforce boks hanya dari inventory FIFO.

### In Scope

**MES Produksi**:
- Tabel operasional: `ShiftReport`, `ShiftMember`, `ShiftWaste`, `ShiftHandoff`, `TsgBoxProcess`, `TsgBoxConsumption`, `DowntimeLog`, `MaintenanceEvent`, `Batch`, `HlpPack`.
- API endpoint operasional lengkap (lihat [`06-api-spec.md`](./06-api-spec.md)).
- Tablet UI (Next.js RSC + Tailwind + Shadcn):
  - Login → pilih plant & machine.
  - Halaman "Start Shift" — pilih template, produk, tim.
  - Halaman utama: boks aktif + tombol besar "BOKS SELESAI · TIMBANG". — **Selesai (Agustus 2026)**: alur diganti sesi multi-boks 1–6 boks (lihat bawah).
  - Modal Tambah Consumables / Log Downtime / Log Maintenance.
  - Halaman "Akhiri Shift" — input waste 4 kategori + izin tim + handoff jika perlu.
  - Halaman "Approval" untuk supervisor.
- Kalkulasi yield & berat/batang server-side (dari `MachineTemplate` per produk).
- Idempotency-Key di semua POST.
- Dashboard sederhana per pabrik (list shift + status).

**WMS Inbound**:
- Tabel: `TsgReceiving`, `TsgReceivingBox`, `TsgInventory`.
- API endpoint: `/tsg-receiving`, `/tsg-inventory` (list, allocate, writeoff).
- Tablet UI Gudang Inbound:
  - Halaman "Terima TSG dari Supplier" — pilih supplier + input per boks (kode + berat).
  - Cetak label QR-ready (Fase 3 nanti generate QR).
  - Halaman "Inventory TSG" — filter status, FIFO sort by age.
  - Halaman "Alokasikan Boks" — kaitkan boks ke shift (opsional atau otomatis saat operator scan Fase 3).
- Perubahan `TsgBoxProcess`: tambah `inventoryBoxId` FK. Operator open boks → sistem cek `tsg_inventory.status = 'AVAILABLE'`, otherwise 400.
- FIFO enforcement + override permission (`tsg.inventory.allocate.override`).

### Out of Scope
- WMS Outbound (cartoning + receiving pack dari HLP) — masuk Fase 5.
- Distribusi (dispatch order + surat jalan) — masuk Fase 6.
- QC laboratorium TSG — bukan bagian sistem sama sekali.
- Multi-pabrik rollout — masuk Fase 2.
- Dashboard rollup Area/HQ — masuk Fase 2.
- Mobile Flutter — masuk Fase 3.
- QR scanning — masuk Fase 3 (tapi tabel `QRRegistry` sudah disiapkan schemanya).

### Acceptance Criteria
- [ ] Operator kecer di pilot bisa jalankan shift 8-13 jam tanpa crash / data loss.
- [ ] Input satu boks lengkap (buka + tambah 2 consumables + timbang selesai) selesai dalam < 60 detik di tablet.
- [ ] Yield boks & shift dihitung otomatis, indikator warna sesuai `MachineTemplate.yieldRange`.
- [ ] Handoff triggered saat end shift dengan boks aktif — supervisor bisa lihat handoff di dashboard.
- [ ] Shift APPROVED → tidak bisa di-UPDATE (RLS tolak). Verifikasi lewat manual SQL test.
- [ ] AuditLog memuat semua mutasi dengan `before` → `after` snapshot.
- [ ] **WMS Inbound**: staff gudang bisa terima kiriman 50-boks TSG dalam < 15 menit (< 20 detik per boks).
- [ ] **WMS Inbound**: operator buka boks yang tidak ada di inventory → ditolak dengan pesan jelas.
- [ ] **WMS Inbound**: FIFO enforcement — boks tertua diusulkan default; override menghasilkan audit log dengan alasan.
- [ ] 5 hari operasional pilot tanpa incident data (end-to-end receiving → shift APPROVED).

### Risk
- **Adopsi operator lambat** — form baru vs kertas terbiasa. Mitigasi: training + supervisor mendampingi minggu pertama.
- **Tablet baterai / koneksi drop** — mid-shift disconnect. Mitigasi: idempotency + local draft buffer sederhana (form state di localStorage).
- **Handoff flow bingung** — operator lama vs baru miskomunikasi. Mitigasi: SOP tertulis + banner UI jelas.

### Selesai (Agustus 2026) — Penambahan Pasca-Plan

- **Sesi multi-boks (1–6 boks)**: operator memilih sendiri boks TSG dari inventory (badge FIFO hanya saran, bukan auto-FIFO). Timbang batangan **kolektif** di akhir sesi — total dibagi proporsional bobot TSG tiap boks (`splitBatanganProportional`), sisa pembulatan ke boks terakhir.
- **Timbang kolektif + kode batch**: saat sesi ditimbang, dibuat record `batch` dengan kode `btc_<kodeMesin>_<YYYYMMDD>_<urutan>` (contoh `btc_MKR01_20260815_01`) sebagai penanda boks batangan yang akan masuk mesin HLP.
- **Event level sesi**: pemakaian consumable, downtime, dan maintenance bisa dicatat level sesi (tanpa pilih boks); alur per-boks tetap jalan untuk boks parsial handoff.
- **Halaman HLP tablet** (`/tablet/hlp`): pilih batch `btc_*` → pilih mesin HLP (filter `type = HLP`) → input packs lolos / isi per pack / reject batangan → preview total batang + berat per batang (gram) → riwayat packing. Quick link di `/tablet` untuk user dengan permission `hlp.pack`.
- **Validasi jenis mesin**: start shift produksi hanya di mesin `type = MAKER` (validasi server + filter UI). Enum `machine_type`: `MAKER` | `HLP`.

---

## Fase 2 — Rollout Multi-Pabrik + Dashboard Area (4 minggu)

### Goal
Rollout ke 5–10 pabrik lain di area yang sama. Koordinator area bisa lihat rollup KPI harian per pabrik.

### In Scope
- Onboarding pabrik: setup Plant, Machine, MachineTemplate, ShiftTemplate per lokasi.
- Materialized view `mv_area_daily_kpi`: refresh saat shift APPROVED.
- Dashboard Koordinator Area: — **Selesai (Agustus 2026)**; scope GLOBAL rollup semua pabrik (lihat bawah).
  - List pabrik + status (aktif, downtime, closing).
  - KPI harian: yield rata-rata, total produksi, waste 4 kategori, top downtime.
  - Drill-down ke pabrik → shift → boks.
- Notification: shift COMPLETED menunggu approval > 2 jam → notif ke supervisor.
- Approval workflow polish: reopen pre-approval, CORRECTION flow (skeleton).

### Out of Scope
- Cross-area comparison — masuk Fase 4.
- Mobile — masuk Fase 3.

### Acceptance Criteria
- [ ] 5 pabrik onboarded, masing-masing bisa jalankan shift bersamaan tanpa data contamination.
- [ ] Dashboard Area menampilkan rollup dalam < 3 detik.
- [ ] MV refresh berjalan otomatis di trigger APPROVED (test dengan >100 shift APPROVED per hari).
- [ ] RLS test lintas plant di area sama: koordinator bisa lihat semua; supervisor pabrik A tidak bisa lihat plant B.

### Risk
- **MV refresh lambat / lock** — dengan 30+ pabrik nanti. Mitigasi: incremental refresh, test dengan seed data volume tinggi.
- **Onboarding pabrik lama** — master data harus diinput. Mitigasi: import CSV tool untuk HQ_ADMIN.

### Selesai (Agustus 2026) — Penambahan Pasca-Plan

- **Area dashboard — scope GLOBAL**: scope dengan UUID kosong (`00000000-0000-0000-0000-000000000000`) rollup **semua** pabrik. Kartu per pabrik menampilkan shift hari ini (berjalan/approved), boks diproses, TSG diproses, hasil batangan, yield (warna hijau 110–114%), waste; plus grafik perbandingan TSG vs batangan dan waste antar pabrik.

---

## Fase 3 — Mobile Flutter + QR + Single-Session (6–8 minggu)

> **Detail lengkap**: [`13-mobile-app-spec.md`](./13-mobile-app-spec.md).
> **Aturan baru penting**: single-session enforcement — 1 user hanya boleh 1 sesi mobile aktif. Pindah device wajib lewat SUPERADMIN revoke.

### Goal
Aplikasi Flutter untuk entry lapangan dengan QR scanning + single-session enforcement. Backend siap terima request mobile (JWT sudah ada dari Fase 0).

### In Scope
- Print system: HQ_ADMIN generate QR statis untuk mesin & label untuk boks TSG di gudang.
- Tabel `QRRegistry` aktif (dari Fase 0 schema).
- Endpoint `/qr/resolve` (deep-link handler).
- App Flutter:
  - Login dengan `deviceType=MOBILE` + `deviceId` + `deviceName` (single-session enforced).
  - Handle 409 SESSION_EXISTS dengan modal info + tombol "Hubungi IT".
  - Home: pilih mesin (scan QR machine) → start shift.
  - Halaman boks aktif: scan QR boks TSG → auto-fill data receiving.
  - Tombol "Tambah pemakaian" / "Log maintenance" / "Timbang selesai".
  - Halaman "Sesi Saya" — user lihat sesi sendiri, logout dari device saat ini.
  - Local queue (SQLite/Drift): retry saat sinyal balik, dedup pakai Idempotency-Key.
  - Push notification (FCM Android / APNs iOS) untuk session revoked & approval pending.
- Anti-forgery: QR dinamis pakai HMAC pendek dari `entityId + createdAt`.
- **SUPERADMIN session management**: halaman "Kelola Sesi User" di web dashboard — view sessions + revoke tombol per session.

### Out of Scope
- Pack HLP QR — bisa masuk Fase 4 (traceability lanjutan).

### Acceptance Criteria
- [ ] Operator bisa jalankan shift lengkap hanya dari Flutter (tablet backup).
- [ ] Scan QR mesin → identifikasi + verifikasi scope < 1 detik.
- [ ] App bisa offline 15 menit, semua input masuk queue, otomatis sync saat online tanpa duplikasi.
- [ ] QR palsu (HMAC salah) ditolak server dengan 400.
- [ ] **Single-session mobile**: coba login di device kedua → 409 SESSION_EXISTS dengan info device lama.
- [ ] **SUPERADMIN revoke**: sesi mobile bisa di-revoke dari web dashboard; user langsung 401 di next request.
- [ ] **Login ulang setelah revoke**: user bisa login di device baru < 30 detik setelah SUPERADMIN revoke.
- [ ] **Same device re-login**: user uninstall & install ulang app di device sama (deviceId sama) → sesi lama auto-revoke, login sukses tanpa perlu SUPERADMIN.
- [ ] **Web tetap concurrent**: user aktif di mobile + web bersamaan tidak ada 409.

### Risk
- **Kamera QR jelek di device lama** — Mitigasi: fallback input manual code.
- **Sinkronisasi race condition** — dua device sama waktu. Mitigasi: server sebagai source of truth + optimistic UI + reconcile.

---

## Fase 4 — HQ Analytics (4 minggu)

### Goal
Dashboard HQ dengan cross-plant analytics, export cukai, OEE analysis, dan **inventory insight lintas pabrik**.

### In Scope
- Materialized view `mv_hq_monthly_rollup`: agregasi lintas area.
- Dashboard HQ:
  - Trendline yield per produk per pabrik per bulan.
  - OEE breakdown: availability, performance, quality per mesin.
  - Waste analysis: 4 kategori per pabrik, benchmark internal.
  - Top downtime causes lintas pabrik.
  - **Panel inventory age**: boks TSG > 30 hari perlu perhatian (per pabrik).
  - **Consumption rate**: kg TSG dipakai per hari per plant per produk.
- Export cukai: template Excel/CSV per periode, dengan digital signature audit.
- CORRECTION flow lengkap (HQ_AUDITOR bisa buat correction, audit trail).

### Out of Scope
- Predictive analytics / ML.
- Third-party integration (ERP, BI).

### Acceptance Criteria
- [ ] Dashboard HQ load < 5 detik untuk data 30 pabrik × 12 bulan.
- [ ] Export cukai satu bulan (30 pabrik) selesai < 30 detik dengan checksum audit.
- [ ] CORRECTION oleh HQ_AUDITOR → shift asli tetap intact, record correction terpaut, audit log lengkap.

### Risk
- **Query lambat cross-plant** — Mitigasi: pre-agregasi ke MV mingguan/bulanan, cache di CDN edge.
- **Cukai format berubah** — kebijakan regulator. Mitigasi: template terparametrisasi, versioned.

---

## Fase 5 — WMS Outbound (4–5 minggu)

### Goal
Gudang barang jadi terima pack dari HLP dan bundle jadi karton dengan traceability lineage.

### In Scope
- Tabel: `FinishedGoodsReceiving`, `Carton`, `CartonContent`.
- API endpoint: `/finished-goods` (receive, list, dispute), `/cartons` (create, add-pack, close).
- Trigger: saat shift status → APPROVED, sistem auto-create `FinishedGoodsReceiving` dengan `packsReceivedCount = sum(hlp_pack.packsLolos)`.
- Tablet UI Gudang Outbound:
  - Halaman "Terima dari HLP" — list shift APPROVED, confirm receipt / dispute count.
  - Halaman "Cartoning" — buat karton baru, tambahkan pack (scan atau pilih), tutup karton saat penuh.
  - Halaman "Cari Traceability" — scan/input kode karton → tampilkan lineage pack → batch → shift → produk.
- Role baru: `GUDANG_OUTBOUND` (aktif).

### Out of Scope
- Inventory location detail karton (rak/palet).
- Quality hold untuk karton.
- Auto-generate PDF label karton (bisa Fase 6 sinkron).

### Acceptance Criteria
- [ ] Setiap shift APPROVED otomatis muncul di "Terima dari HLP" gudang outbound dalam < 30 detik.
- [ ] Dispute count workflow: gudang input actual count berbeda dari `packsLolos` → membuat correction task ke supervisor pabrik.
- [ ] Karton bisa berisi pack dari beberapa shift (multi-batch bundling).
- [ ] Scan karton → tampilkan lineage lengkap dalam < 2 detik.

### Risk
- **Discrepancy pack HLP vs receive gudang** — sering. Mitigasi: flow dispute clear, correction lewat CORRECTION shift.
- **Karton besar dengan puluhan pack** — perlu bulk-add UI (misalnya scan barcode roll bukan per-pack).

---

## Fase 6 — Distribusi Basic (3 minggu)

### Goal
Karton yang sudah READY di gudang outbound bisa di-dispatch ke customer dengan surat jalan PDF.

### In Scope
- Tabel: `DispatchOrder`, `DispatchItem`, `DispatchDocument`.
- API endpoint: `/dispatch/orders` (create, add-carton, dispatch, list), `/dispatch/documents/:id/pdf` (generate + download).
- Tablet UI Ekspedisi:
  - Halaman "Buat Dispatch" — input customer (nama, alamat), driver, kendaraan, pilih karton (READY status).
  - Halaman "Dispatch Aktif" — order yang belum dispatched.
  - Cetak surat jalan PDF (template dengan letterhead pabrik, list karton, tanda tangan).
- Server-side PDF generation (mis. `puppeteer` atau `pdfkit`).
- Role baru: `EKSPEDISI`.

### Out of Scope
- Order management (customer di-input manual, bukan dari CRM).
- Invoice / tagihan.
- Track & trace pengiriman (TMS).
- Delivered confirmation dari customer.

### Acceptance Criteria
- [ ] Buat dispatch order + pilih 20 karton + generate PDF selesai < 3 menit.
- [ ] PDF surat jalan valid: nomor unik, tanggal, customer info, list karton dengan kode, ttd digital (kalau perlu).
- [ ] Karton status auto-update DISPATCHED saat order.
- [ ] Tidak bisa dispatch karton yang belum status READY (400 dengan pesan jelas).

### Risk
- **Template surat jalan berbeda per pabrik** — Mitigasi: template terparametrisasi, versioned per plant.
- **Customer data tidak konsisten** — Mitigasi: opsi save customer sebagai "quick-fill" di database (tabel `dispatch_customer` opsional Fase 6.5).

---

## Dependensi Lintas Fase

```
Fase 0 (Foundation)
    ├─→ Fase 1 (Pilot MES+Inbound) ─→ Fase 2 (Rollout) ─→ Fase 4 (Analytics)
    │                                                          │
    │                              ├─→ Fase 5 (WMS Outbound) ─→ Fase 6 (Distribusi)
    │                              │
    └──────────────────────────────→ Fase 3 (Mobile)
```

- Fase 3 hanya butuh Fase 0 (schema + auth). Bisa **paralel dengan Fase 2** kalau ada mobile dev.
- Fase 4 butuh Fase 2 (multi-pabrik onboarded).
- Fase 5 butuh Fase 1 (butuh `hlp_pack` data untuk auto-receive) tapi tidak butuh Fase 2 dst.
- Fase 6 butuh Fase 5 (butuh `carton` yang READY).

## Metrik Sukses Program

- **Time-to-close shift**: dari end-shift → APPROVED < 30 menit rata-rata (baseline manual: 2 jam+).
- **Akurasi laporan**: mismatch antara total boks vs sidebar shift < 0.5% (baseline manual: ~3%).
- **Waste visibility**: 100% shift APPROVED punya data 4 kategori waste (baseline manual: hanya sidebar coret-coret).
- **Operator satisfaction**: > 70% operator preferable tablet vs kertas setelah 1 bulan pemakaian.
