# Catatan Diskusi Awal — MES Multi-Cabang (Hummer)

> **Tanggal**: 2026-08-10
> **Status**: Bahan diskusi sebelum PRD & skema data ditulis
> **File terkait**: [`draft.txt`](./draft.txt) (konsep awal single-plant), plan file di `~/.claude/plans/halo-synchronous-harp.md`
> **Blueprint interaktif**: https://claude.ai/code/artifact/bca76e88-04f7-4cd5-8b18-0554a47f3f9f

---

## 1. Konteks & Tujuan

Draft awal (`docs/draft.txt`) mendesain MES (Manufacturing Execution System) untuk **satu pabrik rokok**: 2 Mesin Maker + 1 HLP, produk "Homer" (sudah di-rename **Hummer**), dengan fokus real-time entry per Boks TSG dan kalkulasi yield & berat per batang.

User memutuskan sistem harus **diskalakan ke enterprise multi-cabang** sejak awal, dengan hirarki 3 level:

```
Kantor Pusat (Company)
  └── Koordinator Area (Region)
        └── Pabrik (Plant)
              └── Mesin (Machine)
```

Tujuan diskusi ini: mendapat konsensus pada keputusan fondasi supaya **multi-tenancy dan API-first bukan bolt-on kemudian**, sebelum menulis PRD dan skema data.

---

## 2. Ringkasan Proyek

| Aspek | Nilai |
|---|---|
| Skala target | 30+ pabrik heterogen (produk & konfigurasi mesin bisa berbeda) |
| Katalog produk | **Multi-merek** — Hummer sebagai produk utama, tapi katalog terbuka untuk SKU lain |
| Klien | Web tablet (Fase 1) + Flutter mobile dengan QR scanning (Fase 2) |
| Deployment | Online-first, single cloud instance |
| Multi-tenancy user | 1 user bisa akses multiple pabrik/area (multi-scope) |
| Approval workflow | 1 level: supervisor pabrik → LOCKED |
| Timezone | WIB seragam |
| Compliance | Industri rokok — audit trail, LOCKED, soft delete wajib |

---

## 3. Hasil Wawancara

### Q1. Skala target & keseragaman pabrik
**Jawaban**: Besar & heterogen (30+ pabrik, produk/mesin bervariasi).
**Implikasi**: Perlu master data governance ketat di pusat, agar konsistensi terjaga tanpa mengorbankan fleksibilitas per pabrik.

### Q2. Model akses & multi-tenancy user
**Jawaban**: Multi-scope — 1 user bisa akses beberapa pabrik/area.
**Implikasi**: Skema RBAC tidak boleh `role` tunggal di user table. Perlu tabel `UserAssignment(userId, scopeType, scopeId, roleId)`.

### Q3. Konektivitas pabrik ke pusat
**Jawaban**: Online-first, single cloud instance.
**Implikasi**: Tidak perlu arsitektur offline-first di backend. Namun mobile app (Fase 2) tetap harus punya local queue karena sinyal di lantai produksi tidak reliable.

### Q4. Documentation pack yang diharapkan
**Jawaban**: Semua — PRD, arsitektur, ERD multi-tenant, API + RBAC + roadmap. Plus: Fase 2 akan menggunakan **Flutter dengan QR scanning** (scan mesin, TSG, dsb).

### Q5. Approval workflow
**Jawaban**: 1 level saja — supervisor pabrik → LOCKED.

### Q6. Lokasi & timezone
**Jawaban**: Semua satu timezone (WIB).

### Q7. Prioritas dokumentasi
**Jawaban**: Fase 0 (foundation) + Fase 1 (pilot 1 pabrik) — detail penuh. Fase 2–4 hanya outline.

### Update penamaan & multi-produk
User mengoreksi: produk "Homer" diganti jadi **Hummer**, dan sistem harus mendukung **multi-produk / multi-merek**. Ini bukan sekadar rename — mesin sama boleh memproduksi produk berbeda antar shift.

---

## 4. Rekomendasi Arsitektural

### 4.1. Hirarki organisasi & multi-tenancy
- **Single database, shared schema** dengan `plantId` di semua tabel operasional (bukan DB-per-pabrik — nightmare untuk 30+).
- **PostgreSQL Row-Level Security (RLS)** untuk isolasi otomatis — user hanya lihat data yang scope-nya boleh.
- Tabel `UserAssignment` (user × scope × role) — 1 user bisa punya beberapa assignment.
- **Level Area & HQ tidak menyimpan data operasional sendiri** — mereka baca agregat dari plant lewat materialized view.

### 4.2. RBAC yang scalable
Draft awal hanya punya `role`. Untuk enterprise perlu **Role + Permission + Scope**:

| Level | Role contoh | Scope |
|---|---|---|
| HQ | `HQ_ADMIN`, `HQ_ANALYST`, `HQ_AUDITOR` | Company |
| Area | `AREA_COORDINATOR`, `AREA_QA` | Region/Area |
| Plant | `PLANT_MANAGER`, `SHIFT_SUPERVISOR`, `OPERATOR_KECER`, `GUDANG` | Plant |

Permission granular (`shift.approve`, `masterdata.edit`, `report.export`) — bukan cek role langsung di code.

### 4.3. Master data governance
Master data dikelola pusat, di-cascade ke pabrik:
- `Product` — Hummer + SKU lain
- `PlantProduct` — produk apa boleh diproduksi di pabrik mana
- `MachineTemplate` — per kombinasi `(productId × machineType)`. Tolerance yield, target berat/batang, range warna indicator **berbeda per produk**
- `BOM` — bahan pendukung per produk
- `DowntimeCategory`, `RejectReason` — versioned

Pabrik hanya **assign**, tidak edit standar → kecuali override yang perlu approval area.

### 4.4. ORM: Drizzle (bukan Prisma)
- Support PostgreSQL RLS lebih native (Prisma masih awkward dengan RLS).
- Query builder lebih fleksibel untuk rollup/aggregation queries di dashboard HQ.
- Migration lebih transparan untuk audit compliance.

### 4.5. API-first (WAJIB — karena Flutter di Fase 2)
- **Jangan** hanya pakai Next.js Server Actions — Flutter tidak bisa konsumsi.
- Bangun **REST atau tRPC** endpoint untuk semua operasi. Web (Next.js) & Mobile (Flutter) → sama-sama konsumsi API layer yang sama.
- **Auth**: JWT + refresh token (bukan cookie session NextAuth default).
- **Idempotency key** di setiap POST (operator scan QR 2× karena lag → jangan double-record).

### 4.6. Strategi QR Code (Fase 2)

| QR type | Statis/Dinamis | Contoh payload | Print oleh |
|---|---|---|---|
| Machine | Statis, tempel di mesin | `ohmes://machine/{plantId}/{machineCode}` | Setup awal |
| TSG Box | Dinamis, print saat receiving | `ohmes://tsg/{plantId}/{boxCode}` | Gudang |
| Batch Tray Maker | Dinamis, print saat batch mulai | `ohmes://batch/{plantId}/{batchId}` | Operator Maker |
| Pack HLP output | Dinamis, per shift | `ohmes://pack/{plantId}/{packId}` | Operator HLP |

Tabel `QRRegistry` untuk track: siapa scan, kapan, dari device apa. QR dinamis pakai `hmac` pendek anti-forgery.

### 4.7. Compliance & audit
- **AuditLog** tabel: siapa mengubah apa, kapan, from-value → to-value.
- **Approval workflow**: `RUNNING → COMPLETED → APPROVED_BY_SUPERVISOR → LOCKED`.
- **Soft delete** semua tabel operasional. Data cukai jangan pernah hilang.

---

## 5. Aturan Multi-Produk (Penting)

Karena sistem mendukung multi-merek, ada beberapa aturan bisnis yang harus dijaga:

1. **`ShiftReport` terikat satu `productId`**. Field `brand String @default("Homer")` di draft asli → dihapus, diganti FK `productId` ke `Product`.

2. **Ganti produk di tengah shift tidak diizinkan**. Harus:
   - `end shift` dulu (status → COMPLETED)
   - `start shift` baru dengan `productId` berbeda
   - Alasan: jaga integritas kalkulasi yield & traceability batch.

3. **`MachineTemplate` di-key oleh `(productId, machineType)`**. Tidak boleh hard-code konstanta seperti "110-114%" — harus lookup ke template. Produksi Hummer & SKU lain di mesin sama punya batas normal berbeda.

4. **Batch dan Pack membawa `productId` implicit lewat shift**. Traceability dari pack HLP → batch → shift → productId + machine + operator.

5. **Rollup HQ dipecah per produk** untuk perbandingan lintas SKU (tidak hanya agregat total).

---

## 6. Fase Pengembangan

| Fase | Nama | Estimasi | Deliverable utama |
|---|---|---|---|
| 0 | Foundation | 3–4 minggu | Multi-tenant schema, RBAC, auth JWT, master data CRUD |
| 1 | Pilot 1 pabrik | 4–6 minggu | Shift report + TSG box + downtime end-to-end (web) |
| 2 | Rollout multi-pabrik + Area | 4 minggu | Rollup KPI, dashboard koordinator, approval LOCKED |
| 3 | Mobile Flutter + QR | 6–8 minggu | API mobile, QR gen/scan, local queue |
| 4 | HQ Analytics | 4 minggu | Cross-plant KPI, OEE, waste analytics, export cukai |

Dokumen detail penuh: Fase 0 + Fase 1. Fase 2–4 hanya outline di documentation pack.

---

## 7. Rencana Documentation Pack

Setelah diskusi ini disetujui, rencananya menulis 10 file markdown di `docs/`:

```
docs/
├── README.md                          # Indeks & navigasi
├── 00-glossary.md                     # Istilah domain (TSG, HLP, Maker, dsb)
├── 01-prd.md                          # Product Requirements Document
├── 02-user-stories.md                 # User stories per role
├── 03-architecture.md                 # Arsitektur sistem & deployment
├── 04-data-model.md                   # ERD & schema Drizzle multi-tenant
├── 05-rbac-matrix.md                  # Permission matrix per role × resource
├── 06-api-spec.md                     # API contract
├── 07-qr-strategy.md                  # QR code lifecycle & payload
├── 08-roadmap.md                      # Roadmap 5 fase + acceptance criteria
└── 09-fase-1-pilot-spec.md            # Spesifikasi teknis Fase 1
```

Detail struktur & isi ada di plan file: `~/.claude/plans/halo-synchronous-harp.md`.

---

## 8. Blueprint Interaktif

Untuk visualisasi diskusi ini, tersedia halaman HTML interaktif dengan 6 panel:

**URL**: https://claude.ai/code/artifact/bca76e88-04f7-4cd5-8b18-0554a47f3f9f

| Panel | Isi |
|---|---|
| 01 · Hirarki & Skop | Pohon 3 level. Role picker → highlight scope |
| 02 · Workflow Shift | Stepper 7 langkah, contoh payload API per langkah |
| 03 · Data Flow | 4 lapis: Klien → API → DB → Konsumen agregat, dengan batas RLS |
| 04 · Business Flow | State machine `RUNNING → COMPLETED → APPROVED (LOCKED)` + CORRECTION |
| 05 · QR & Mobile | 4 jenis QR + contoh payload resolve |
| 06 · RBAC Matrix | Tabel permission representatif, sorot per role |

---

## 9. Temuan dari Form Manual Shift

User membagikan foto form pencatatan manual per-shift (referensi visual, tidak di-commit). Temuan-temuan yang menajamkan skema:

### 9.1. Struktur form (per baris = 1 boks TSG)
- Kolom: No boks, TSG (kg), Batangan (kg), Pemakaian (F/B/T — hanya diisi saat ganti), Sparepart (ad-hoc: Nylon, Pisau Filter, dsb).
- Contoh riil: shift malam 16:30–05:30, 26 boks, Total TSG 721.05 kg → Batangan 807.15 kg → yield 111.9% (masuk normal 110–114%).
- **Baris 1 anomali** (TSG 7.90 vs 29.xx lainnya) → boks parsial sisa shift sebelumnya — lihat §10.

### 9.2. Sidebar shift (ringkasan)
- Total TSG, Sisa TSG, **Menir**, **Rijekan** (kadang ditandai "lunas"), Debu Kasar, Debu Halus.
- **4 kategori waste terpisah** (bukan 3 seperti di draft). "Lunas" adalah **status audit** (sudah ditimbang/diserahkan) — dijadikan enum `settlementStatus ∈ { PENDING, LUNAS }`.

### 9.3. Header & tim
- Ketua Kecer + Operator + Absensi 4–10 orang per shift + izin/waktu kerja individu.
- Bukan sekadar 1 `kecerId` seperti di draft. Perlu tabel `ShiftMember` many-to-many.

### 9.4. Dampak ke skema (dikunci diskusi)

| Aspek | Draft asli | Revisi setelah lihat form |
|---|---|---|
| Consumables | Total shift (`filterQty/bobbinQty/tippingQty` di `ShiftReport`) | **Event log per boks**: tabel `TsgBoxConsumption(tsgBoxId, consumableItemId, qty, loggedAt, note)`. Total shift = view agregat. |
| Waste | 3 field (`rejectKg/coarseDustKg/fineDustKg`) | **4 kategori** enum + tabel `ShiftWaste(shiftReportId, category, kg, settlementStatus, note)` |
| Maintenance | Tidak ada | Tabel `MaintenanceEvent(shiftReportId, tsgBoxId?, sparepartId, qty, loggedAt, note)` |
| Tim shift | 1 `kecerId` di `ShiftReport` | Tabel `ShiftRole` (fleksibel per pabrik) + `ShiftMember(shiftReportId, userId, shiftRoleId, leaveMinutes)` |
| Shift schedule | Enum `PAGI/SIANG/MALAM` hardcode | Tabel `ShiftTemplate(plantId, name, startTime, durationMinutes)` — fleksibel per pabrik, boleh 13 jam lintas midnight |

### 9.5. Dampak ke UI tablet
- Halaman input boks harus cepat — 26+ boks per shift, ~2 menit per entri.
- "Tambah pemakaian" & "Log maintenance" = tombol sekunder, tidak wajib per boks.
- Halaman "Akhiri shift" menampilkan 4 field waste + toggle "lunas" per baris.
- Halaman "Anggota shift" untuk pilih tim + input izin per anggota.

---

## 10. Shift Handoff — Carry-Over TSG Antar Shift

**Masalah nyata**: TSG dari shift sebelumnya sering belum habis di feeder. Batangan yang dihasilkan dari sisa itu tidak sempat ditimbang. Akibatnya, di form manual baris 1 shift baru terlihat anomali (TSG 7.90 kg → Batangan 27.90 kg, yield literal 353%).

**Keputusan (dikunci)**: **handoff eksplisit** di pergantian shift — bukan formula bercabang.

### 10.1. Tabel `ShiftHandoff`
```
ShiftHandoff:
  id                    UUID PK
  fromShiftId           FK → ShiftReport
  machineId             FK → Machine
  sisaTsgKg             Decimal(10,2)      // TSG tersisa di feeder saat handoff
  batanganSementaraKg   Decimal(10,2)      // Batangan hasil sisa itu, ditimbang
  weighedAt             DateTime
  claimedByShiftId      FK → ShiftReport?  // NULL sampai shift baru claim
```

### 10.2. Flow end shift (shift lama)
1. Operator tekan "Akhiri shift".
2. Sistem cek: ada boks aktif yang belum ditutup?
   - **Tidak** → lanjut normal (input waste + LOCKED).
   - **Ya** → **WAJIB isi form handoff**:
     - Timbang `sisaTsgKg` (TSG yang masih di feeder).
     - Timbang `batanganSementaraKg` (batangan dari sisa itu yang sudah nangkring di baki).
3. Batangan sementara ini **masuk ke akun shift lama** — shift lama tidak "kehilangan" produksinya.
4. Record `ShiftHandoff` dibuat dengan `claimedByShiftId = NULL`.

### 10.3. Flow start shift baru
1. Operator pilih mesin, tekan "Start Shift".
2. Sistem cek: ada `ShiftHandoff` unclaimed untuk mesin ini?
   - **Tidak** → mulai bersih, boks 1 normal.
   - **Ya** → sistem auto-claim: `handoff.claimedByShiftId = newShiftId`.
3. Boks pertama shift baru otomatis flag `isPartial=true` dan `handoffId` FK ke `ShiftHandoff`.
4. Kolom TSG boks 1 = **TSG baru yang masuk** (bukan sisa lama — sisa sudah masuk sebagai carry).
5. Yield boks 1 dihitung saat boks habis: formula normal berlaku pada TOTAL (sisa+baru) vs TOTAL batangan sejak claim. Attribusi ke shift baru: hanya batangan yang ditimbang **setelah** claim.

### 10.4. Trade-off yang disetujui
- ✅ Attribusi batangan bersih ke shift asal — siap dipakai KPI operator jika HR memutuskan nanti.
- ✅ Formula yield tidak bercabang — tetap `(batangan / TSG) × 100%`, cuma dengan opening balance yang benar.
- ✅ Yield per shift jadi valid untuk dashboard HQ & Area.
- ⚠️ Menambah ~2 menit di pergantian shift untuk operator lama menimbang. **Disepakati sebagai investasi worth-it** demi kualitas data.

### 10.5. UI implikasi
- Halaman "Akhiri shift" bercabang: jalur normal vs jalur handoff (dengan form timbang).
- Halaman "Start shift" menampilkan banner "Carry-over dari shift sebelumnya: X kg TSG + Y kg batangan sementara" jika handoff aktif.

---

## 11. Scope Expansion — MES → MES + WMS End-to-End (2026-08-10, lanjut)

Setelah documentation pack v1 selesai, user bertanya alur dari **penerimaan supply TSG sampai barang siap distribusi**. Diskusi walkthrough 5 tahap end-to-end (Terima TSG → Simpan → Produksi → Simpan Barang Jadi → Distribusi) menghasilkan keputusan **MES di-expand jadi hybrid MES + WMS** karena tidak ada sistem WMS/ERP existing.

### 11.1. Keputusan Utama

| Aspek | Keputusan |
|---|---|
| **Sistem existing** | Belum ada WMS/ERP — semua manual/kertas. MES jadi tulang punggung digital pabrik. |
| **Strategi timeline** | Bertahap. Produksi + WMS Inbound bareng di Fase 1. WMS Outbound = Fase 5 (baru). Distribusi basic = Fase 6 (baru). |
| **WMS Inbound scope** | Receiving basic (supplier + berat per boks) + Inventory dengan location + FIFO. **Tanpa** QC lot, **tanpa** dispatch/allocation eksplisit. |
| **WMS Outbound scope** | Receiving pack dari HLP + Cartoning (bundle karton dengan mapping karton↔pack untuk traceability). **Tanpa** inventory location, **tanpa** quality hold. |
| **Distribusi scope** | Basic — surat jalan (DispatchOrder + DispatchItem + PDF). **Bukan** full order management / TMS. |

### 11.2. Roadmap Revisi

5 fase → **7 fase**, 21-29 minggu → **30-36 minggu**:

| Fase | Nama | Durasi | Perbedaan vs plan lama |
|---|---|---|---|
| 0 | Foundation | 3-4 mgg | + tabel WMS Inbound, role `GUDANG_INBOUND` |
| 1 | Pilot: MES Produksi + **WMS Inbound Basic** | **6-8 mgg** | Naik dari 4-6 mgg |
| 2 | Rollout Multi-Pabrik + Dashboard Area | 4 mgg | Sama |
| 3 | Mobile Flutter + QR | 6-8 mgg | QR TSG boks jadi critical (autoresolve dari inventory) |
| 4 | HQ Analytics | 4 mgg | Sama; tambah panel inventory age |
| 5 | **WMS Outbound** (BARU) | 4-5 mgg | Cartoning + traceability karton↔pack |
| 6 | **Distribusi Basic** (BARU) | 3 mgg | Surat jalan PDF |

### 11.3. Data Model Additions (High-Level)

**WMS Inbound (Fase 0-1)**:
- `tsg_supplier`, `tsg_receiving`, `tsg_receiving_box`, `tsg_inventory`
- Perubahan `tsg_box_process`: tambah `inventoryBoxId` FK.

**WMS Outbound (Fase 5)**:
- `finished_goods_receiving`, `carton`, `carton_content`

**Distribusi (Fase 6)**:
- `dispatch_order`, `dispatch_item`, `dispatch_document`

Detail lengkap ada di `docs/04-data-model.md` (patched).

### 11.4. Peran Baru

3 role baru: `GUDANG_INBOUND` (Fase 1), `GUDANG_OUTBOUND` (Fase 5), `EKSPEDISI` (Fase 6). Detail permission di `docs/05-rbac-matrix.md`.

### 11.5. Aturan Kunci

1. **TSG box wajib dari inventory**: operator tidak bisa open boks yang tidak terdaftar di `tsg_inventory` status `AVAILABLE`.
2. **FIFO enforcement**: sistem sarankan boks tertua; override diperbolehkan tapi tercatat audit log.
3. **Auto-receive pack HLP**: setelah shift APPROVED, `finished_goods_receiving` auto-create dari sum `hlp_pack.packsLolos`.
4. **Karton lineage**: satu karton bisa isi pack dari beberapa shift. Traceability: karton → list pack → batch → shift → operator/mesin/produk.
5. **Dispatch manual**: staff ekspedisi input customer + pilih karton. Sistem generate PDF surat jalan.

### 11.6. Dokumentasi Terkait

**File di-patch**: `01-prd.md`, `02-user-stories.md`, `04-data-model.md`, `05-rbac-matrix.md`, `06-api-spec.md`, `08-roadmap.md`, `09-fase-1-pilot-spec.md`, `README.md`.

**File baru**:
- `10-wms-inbound-spec.md` — spec detail Fase 1 WMS Inbound
- `11-wms-outbound-spec.md` — spec detail Fase 5
- `12-dispatch-spec.md` — spec detail Fase 6

---

## 12. Role SUPERADMIN (2026-08-10 lanjut)

Ditambahkan role `SUPERADMIN` — vendor developer + IT lead perusahaan (max 3 aktif). Karakteristik:

**Akses**:
- Tak terbatas lintas company/region/plant (`scope_level = 'GLOBAL'`).
- Bypass RLS di endpoint tertentu (audit, migration, debug).
- Impersonate user lain untuk debugging.
- **Full akses audit trail dan security log** (login attempts, permission denied, IP suspicious, privileged actions).

**Permission eksklusif** (§3.6.a di `05-rbac-matrix.md`):
- `super.bypass_rls`, `super.impersonate`, `super.force_logout`, `super.reset_password`, `super.audit.read_all`, `super.audit.security`, `super.superadmin.assign`, `super.database.migrate`.

**Aturan compliance**:
- Max 3 aktif per system.
- 2FA wajib (WhatsApp OTP atau TOTP).
- Session pendek: JWT 5 menit, refresh 7 hari.
- Bootstrap awal lewat CLI (`npm run seed:superadmin`), bukan UI.
- Semua aksi tercatat audit `is_privileged=true` + broadcast ke SUPERADMIN lain.

**Skema tambahan**:
- Tabel `auth_policy(roleId, accessTokenTtlMinutes, refreshTokenTtlDays, require2fa, ipAllowlist, maxActiveAssignments)`.
- Kolom baru di `role`: `is_privileged: boolean` (true untuk SUPERADMIN).
- Kolom baru di `audit_log`: `is_privileged: boolean` untuk filter privileged actions.

---

## 13. Single-Session Mobile Enforcement (2026-08-10 lanjut)

Aturan tambahan untuk aplikasi mobile Flutter (Fase 3):

**Rule inti**: satu user **hanya boleh 1 sesi aktif di mobile** pada satu waktu. Coba login di device kedua → **409 SESSION_EXISTS**. Untuk pindah device, **SUPERADMIN wajib revoke sesi lama** — user tidak bisa self-service.

**Kenapa**:
- Compliance — aksi produksi harus tertaut ke fisik operator di lantai.
- Anti-share credential — mengurangi risiko sharing akun antar rekan.
- Insiden compromise — SUPERADMIN bisa revoke tanpa perlu ganti password dulu.

**Aturan**:
| Kondisi | Perilaku |
|---|---|
| Login pertama kali (belum ada session mobile) | ✅ Sukses |
| Login di device sama (deviceId sama) | ✅ Sukses, sesi lama auto-revoke (case: app restart, re-install) |
| Login di device berbeda dengan sesi mobile masih aktif | ❌ 409 SESSION_EXISTS + info device aktif + instruksi kontak SUPERADMIN |
| SUPERADMIN revoke sesi lama | User bisa login di device baru |
| Web session concurrent | ✅ Diperbolehkan — aturan hanya untuk `deviceType='MOBILE'` |

**Skema baru** di `user_session`:
- `deviceType` enum `{MOBILE, WEB}` NOT NULL
- `deviceId`, `deviceName`, `pushToken`, `lastActiveAt`
- `revokedBy`, `revokedReason`
- **Partial unique index**: `WHERE device_type = 'MOBILE' AND revoked_at IS NULL` — enforce single-session di DB level (bukan hanya service).

**Endpoint baru**:
- `GET /super/users/:id/sessions` — SUPERADMIN lihat sesi user
- `POST /super/sessions/:id/revoke` — SUPERADMIN revoke sesi spesifik
- `POST /super/users/:id/sessions/mobile/revoke` — SUPERADMIN revoke semua sesi mobile user
- `GET /auth/me/sessions` — user lihat sesi sendiri (tidak bisa revoke device lain)

**Permission baru**: `super.session.view`, `super.session.revoke`.

**File dokumentasi baru**: `docs/13-mobile-app-spec.md` — spec detail mobile app.

---

## 14. Langkah Selanjutnya

1. **User review** blueprint interaktif & dokumen ini.
2. Jika ada koreksi/tambahan: update artifact + dokumen ini.
3. Setelah disetujui: tulis 10 file documentation pack (rencana di plan file).
4. Setelah documentation pack selesai: scaffolding Fase 0 (multi-tenant schema, RBAC, auth JWT, master data).

**Belum dilakukan** (menunggu approval):
- Menulis 10 file documentation pack
- Menulis kode aplikasi
- Migration files Drizzle
- Konfigurasi deployment

---

## 15. Redesign Role Aplikasi Mobile — Flutter (2026-08-22)

**Keputusan**: aplikasi mobile Flutter (Fase 3) **dibangun ulang dari nol** oleh tim mobile dengan role pengguna yang berbeda dari desain awal.

**Role mobile (baru)**:
- `AREA_SJ_OFFICER` (petugassj) — full flow Surat Jalan supplier di gudang supplier: buat SJ, scan label = assign jenis + berat, tandai SHIPPED. Pool label printing tetap web area office.
- `GUDANG_INBOUND` — receiving TSG + validasi vs SJ (`from-sj`).
- `PLANT_MANAGER` — dashboard pabrik + kondisi stok TSG + aksi ringan (approve shift, approve receiving, writeoff, transfer, FIFO override).
- `AREA_COORDINATOR` — dashboard area + kondisi stok TSG.
- `AREA_QA` — read-only dashboard area + stok TSG.
- `SUPERADMIN` — teknis bisa (2FA, sesi pendek), jarang.

**Tidak di mobile**: `OPERATOR_KECER`/`OPERATOR_MEMBER` (tablet web `/tablet` sudah ada & lebih ergonomis untuk entry boks), `SHIFT_SUPERVISOR`, `GUDANG_OUTBOUND` (F5), `EKSPEDISI` (F6), `HQ_*` (web).

**Rasional**: (1) operator lantai sudah punya UI tablet web yang berjalan; (2) petugas area bekerja di gudang supplier (luar pabrik) sehingga benar-benar butuh mobile; (3) manajemen butuh monitoring di lapangan (dashboard + stok TSG).

**Dampak teknis**: **NOL perubahan backend** — semua permission yang dibutuhkan sudah ada di seed (`src/db/seed.ts`), RLS REGION→plant sudah didukung `src/lib/auth/scope-resolver.ts`. Perubahan murni dokumentasi.

**Deliverable**: documentation pack baru `docs/mobile-v2/` (v2.0.0, 15 file) — kontrak kerja tim mobile, diverifikasi langsung dari kode backend (model produksi Box Session, `mobile/sync` batch, QR `tsg_box`, dst.). Pack lama `docs/mobile-team/` (v1.3.0) jadi arsip historis.

---

*Dokumen ini adalah snapshot diskusi awal — akan digantikan/ditambahkan dokumen resmi dari documentation pack setelah disepakati.*
