# 02 · User Stories — Per Role, Per Fase

User stories dalam format: **As a `<role>`, I want `<capability>`, so that `<benefit>`.**

**Konvensi ID**: `US-<fase>.<role-short>.<urut>` — mis. `US-1.OP.03` = user story ke-3 role operator di Fase 1.

Role short:
- **OP** = Operator Kecer / Ketua Kecer
- **SUP** = Supervisor Pabrik / Plant Manager
- **GDG** = Gudang
- **AREA** = Koordinator Area
- **HQA** = HQ Analyst
- **HQD** = HQ Admin
- **HQU** = HQ Auditor

Fase 0-1 = detail dengan acceptance criteria. Fase 2-4 = epic titles saja.

---

## FASE 0 — Foundation (Master Data & RBAC)

### HQ Admin (HQD)

**US-0.HQD.01** — Sebagai HQ Admin, saya ingin login ke sistem dengan kredensial saya, supaya bisa mengakses master data.
- **Acceptance**: POST `/auth/login` return access token + refresh token; token bisa dipakai request berikutnya.

**US-0.HQD.02** — Sebagai HQ Admin, saya ingin CRUD `Product`, supaya sistem punya katalog produk (Hummer + SKU lain).
- **Acceptance**: POST/GET/PATCH/DELETE `/products` berfungsi; unique code enforced; soft delete.

**US-0.HQD.03** — Sebagai HQ Admin, saya ingin mengonfigurasi `MachineTemplate` per kombinasi produk × tipe mesin, supaya toleransi yield spesifik per produk.
- **Acceptance**: POST `/machine-templates` dengan yield range 110-114% untuk (Hummer × MAKER); yang lama otomatis `is_current=false`.

**US-0.HQD.04** — Sebagai HQ Admin, saya ingin assign role ke user pada scope tertentu, supaya user hanya bisa akses data sesuai wewenangnya.
- **Acceptance**: POST `/user-assignments` create record; user yang di-assign bisa login dan hanya lihat data scope-nya.

**US-0.HQD.05** — Sebagai HQ Admin, saya ingin onboarding pabrik baru (buat Company/Region/Plant/Machine/ShiftTemplate/PlantProduct), supaya pabrik siap dipakai operasional.
- **Acceptance**: Sekuens CRUD selesai < 30 menit untuk 1 pabrik lengkap; user pabrik bisa langsung login dan lihat pabriknya.

### Sistem (background)

**US-0.SYS.01** — Sebagai sistem, saya ingin menolak akses user ke plant di luar scope-nya, supaya data antar pabrik tidak leak.
- **Acceptance**: RLS policy aktif di semua tabel operasional; test lintas plant return 0 rows.

**US-0.SYS.02** — Sebagai sistem, saya ingin mencatat setiap mutasi master data ke `audit_log`, supaya perubahan bisa ditelusuri.
- **Acceptance**: Setiap POST/PATCH/DELETE master data menghasilkan 1 record `audit_log` dengan `before`/`after` snapshot.

---

## FASE 1 — Pilot 1 Pabrik (Operasional Shift)

### Operator Kecer (OP)

**US-1.OP.01** — Sebagai Ketua Kecer, saya ingin memulai shift dengan memilih template shift, produk, mesin, dan anggota tim, supaya shift langsung tercatat lengkap.
- **Acceptance**: POST `/shifts/start` dengan payload lengkap → return `shiftId`, `RUNNING`, response menampilkan anggota tim yang tercatat.

**US-1.OP.02** — Sebagai Ketua Kecer, saya ingin sistem otomatis mendeteksi handoff dari shift sebelumnya, supaya carry-over TSG tidak hilang.
- **Acceptance**: Kalau ada `shift_handoff` unclaimed untuk mesin, response Start Shift menyertakan `claimedHandoff` dengan `sisaTsgKg` + `batanganSementaraKg`.

**US-1.OP.03** — Sebagai Operator Kecer, saya ingin membuka boks TSG baru dengan input berat boks, supaya tracking per boks dimulai.
- **Acceptance**: POST `/shifts/:id/boxes` dengan `tsgWeightKg` → return `boxId`, `boxNumber` auto-incremented per shift, `isPartial=true` kalau boks pertama shift dengan handoff.

**US-1.OP.04** — Sebagai Operator Kecer, saya ingin mencatat pemakaian bobin/filter/tipping saat memang terjadi (bukan setiap boks), supaya audit trail akurat tanpa entry redundant.
- **Acceptance**: POST `/boxes/:id/consumption` opsional; boks bisa selesai tanpa consumption record.

**US-1.OP.05** — Sebagai Operator Kecer, saya ingin log downtime setiap kali produksi berhenti dengan kategori jelas, supaya OEE bisa dianalisis.
- **Acceptance**: POST `/shifts/:id/downtime` dengan kategori enum + durasi menit; log ter-link ke boks aktif kalau ada.

**US-1.OP.06** — Sebagai Operator Kecer, saya ingin mencatat penggantian sparepart (nylon, pisau filter) saat maintenance, supaya biaya operasional tercatat.
- **Acceptance**: POST `/shifts/:id/maintenance` dengan sparepart + quantity → tercatat di `maintenance_event`.

**US-1.OP.07** — Sebagai Operator Kecer, saya ingin menekan tombol besar "Boks Selesai · Timbang" dan input berat output, supaya yield dihitung otomatis.
- **Acceptance**: PATCH `/boxes/:id` dengan `outputWeightKg` → response menyertakan `yieldPct` dan `indicator` (NORMAL/WARNING); indicator warning kalau di luar `machine_template.yieldRange`.

**US-1.OP.08** — Sebagai Operator HLP, saya ingin input pack lolos dan reject per batch, supaya berat rata-rata per batang bisa dihitung per Maker.
- **Acceptance**: POST `/hlp/pack` dengan `batchId` + `packsLolos` + `rejectBatangan` → server hitung `totalBatang` dan `beratPerBatangGram`.

**US-1.OP.09** — Sebagai Ketua Kecer, saya ingin mengakhiri shift dengan input waste 4 kategori dan izin tim, supaya data shift lengkap.
- **Acceptance**: POST `/shifts/:id/end` dengan array 4 waste (MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS) → status `COMPLETED`. Server tolak kalau kategori tidak lengkap atau ada boks aktif tanpa handoff.

**US-1.OP.10** — Sebagai Ketua Kecer, saya ingin timbang sisa TSG dan batangan sementara ketika mengakhiri shift dengan boks belum habis, supaya carry-over ter-attribusi bersih.
- **Acceptance**: POST `/shifts/:id/handoff` dengan `sisaTsgKg` + `batanganSementaraKg` → record `shift_handoff` dibuat, otomatis available untuk claim shift berikutnya.

### Supervisor Pabrik (SUP)

**US-1.SUP.01** — Sebagai Supervisor Pabrik, saya ingin melihat daftar shift yang menunggu approval, supaya bisa review satu-satu.
- **Acceptance**: GET `/shifts?plantId=…&status=COMPLETED` return list dengan basic KPI (yield, produksi, waste).

**US-1.SUP.02** — Sebagai Supervisor Pabrik, saya ingin melihat detail shift lengkap sebelum approve, supaya bisa verifikasi data masuk akal.
- **Acceptance**: GET `/shifts/:id` return report + members + waste + boxes + downtime + maintenance + handoff.

**US-1.SUP.03** — Sebagai Supervisor Pabrik, saya ingin approve shift dan kunci datanya, supaya masuk rollup.
- **Acceptance**: POST `/shifts/:id/approve` → status `APPROVED`, `approvedBy` tercatat, RLS block UPDATE selanjutnya. **Actor tidak boleh sama dengan `createdBy` (return 409).**

**US-1.SUP.04** — Sebagai Supervisor Pabrik, saya ingin reopen shift yang belum ter-approve kalau ada koreksi, supaya operator bisa perbaiki.
- **Acceptance**: POST `/shifts/:id/reopen` dari status `COMPLETED` → status `RUNNING`. Audit log mencatat alasan.

### Gudang Inbound (GDI) — WMS Inbound Fase 1

**US-1.GDI.01** — Sebagai staf Gudang Inbound, saya ingin catat pengiriman TSG dari supplier dengan input per boks (kode + berat), supaya inventory ter-update otomatis.
- **Acceptance**: POST `/tsg-receiving` dengan array boxes → sistem create `TsgReceiving` header + `TsgReceivingBox` per boks + `TsgInventory` per boks dengan status AVAILABLE. Total weight terhitung otomatis dari sum.

**US-1.GDI.02** — Sebagai staf Gudang Inbound, saya ingin melihat inventory TSG saya dengan urutan FIFO (tertua di atas), supaya alokasi ke shift bisa optimal.
- **Acceptance**: GET `/tsg-inventory/available?plantId=…` return list sorted by `createdAt ASC` dengan `ageInDays`.

**US-1.GDI.03** — Sebagai staf Gudang Inbound, saya ingin tandai boks WRITTEN_OFF kalau ada yang rusak/hilang, supaya inventory count tetap akurat.
- **Acceptance**: PATCH `/tsg-inventory/:id/writeoff` dengan reason → status berubah, audit log tercatat.

**US-1.GDI.04** — Sebagai staf Gudang Inbound, saya ingin tandai waste `LUNAS` setelah terima serah-terima dari operator, supaya akuntansi waste akurat.
- **Acceptance**: PATCH `/shifts/:id/waste/:category/settle` → `settlementStatus` PENDING → LUNAS, `settledAt` + `settledBy` tercatat.

### Sistem — WMS Inbound

**US-1.SYS.03** — Sebagai sistem, saya ingin menolak `POST /shifts/:id/boxes` yang bukan dari inventory AVAILABLE, supaya operator tidak bisa open boks "hantu".
- **Acceptance**: request tanpa `inventoryBoxId` atau dengan boks status ≠ AVAILABLE return 400 `TSG_BOX_NOT_AVAILABLE`.

---

## FASE 2 — Rollout Multi-Pabrik + Dashboard Area

**Epic**: Dashboard koordinator area yang menampilkan rollup real-time.

- **US-2.AREA.01** — Sebagai Koordinator Area, saya ingin melihat status semua pabrik dalam wilayah saya dalam satu halaman.
- **US-2.AREA.02** — Sebagai Koordinator Area, saya ingin drill-down dari agregat ke shift ke boks untuk investigasi anomali.
- **US-2.AREA.03** — Sebagai Koordinator Area, saya ingin bandingkan yield antar pabrik dalam periode waktu tertentu.
- **US-2.AREA.04** — Sebagai Supervisor Pabrik, saya ingin menerima notifikasi kalau ada shift yang menunggu approval > 2 jam.
- **US-2.HQD.01** — Sebagai HQ Admin, saya ingin onboarding pabrik baru dengan wizard (bukan lewat CRUD manual).

---

## FASE 3 — Mobile Flutter + QR Scanning

**Epic**: Operator entry lapangan lewat mobile dengan QR scan.

- **US-3.OP.01** — Sebagai Operator, saya ingin scan QR mesin untuk memulai shift.
- **US-3.OP.02** — Sebagai Operator, saya ingin scan QR boks TSG untuk otomatis fill data receiving gudang.
- **US-3.OP.03** — Sebagai Operator, saya ingin app tetap bisa dipakai saat sinyal drop, dan otomatis sync saat online kembali.
- **US-3.OP.04** — Sebagai Operator HLP, saya ingin scan QR batch tray untuk identifikasi asal-usul batangan yang akan dikemas.
- **US-3.GDG.01** — Sebagai Gudang, saya ingin cetak QR label boks TSG saat receiving.
- **US-3.HQD.01** — Sebagai HQ Admin, saya ingin generate QR mesin untuk dicetak dan tempel di mesin baru.

---

## FASE 5 — WMS Outbound

**Epic**: Gudang barang jadi terima pack dari HLP dan bundle jadi karton dengan traceability.

- **US-5.GDO.01** — Sebagai staf Gudang Outbound, saya ingin melihat notifikasi shift APPROVED yang belum saya confirm, supaya tidak ada pack yang lolos audit.
- **US-5.GDO.02** — Sebagai staf Gudang Outbound, saya ingin confirm actual pack count vs expected — kalau beda, sistem trigger dispute → correction task.
- **US-5.GDO.03** — Sebagai staf Gudang Outbound, saya ingin buat karton baru dan tambahkan pack ke dalamnya dengan bulk-scan atau bulk-select.
- **US-5.GDO.04** — Sebagai staf Gudang Outbound, saya ingin tutup karton (READY) saat penuh, supaya bisa siap dispatch.
- **US-5.GDO.05** — Sebagai QA / auditor, saya ingin scan kode karton dan lihat lineage lengkap (batch → shift → operator/mesin/produk), supaya bisa investigasi kalau ada isu QA.

## FASE 6 — Distribusi Basic

**Epic**: Karton READY di-dispatch dengan surat jalan PDF.

- **US-6.EKS.01** — Sebagai staf Ekspedisi, saya ingin buat dispatch order dengan input customer + pilih karton READY.
- **US-6.EKS.02** — Sebagai staf Ekspedisi, saya ingin generate surat jalan PDF dari dispatch order untuk dicetak.
- **US-6.EKS.03** — Sebagai staf Ekspedisi, saya ingin konfirmasi dispatch (kirim keluar) — sistem auto-update karton status → DISPATCHED.
- **US-6.EKS.04** — Sebagai plant manager, saya ingin lihat daftar dispatch order per hari untuk kroscek volume keluar.

## FASE 4 — HQ Analytics & Compliance

**Epic**: Dashboard HQ dan export cukai + CORRECTION flow.

- **US-4.HQA.01** — Sebagai HQ Analyst, saya ingin melihat trendline yield per produk per pabrik per bulan.
- **US-4.HQA.02** — Sebagai HQ Analyst, saya ingin melihat OEE breakdown per mesin dengan drill-down downtime.
- **US-4.HQA.03** — Sebagai HQ Analyst, saya ingin analisis waste lintas pabrik (4 kategori) untuk benchmarking.
- **US-4.HQA.04** — Sebagai HQ Analyst, saya ingin export data cukai bulanan dalam format CSV/Excel siap kirim regulator.
- **US-4.HQU.01** — Sebagai HQ Auditor, saya ingin membuat CORRECTION record untuk shift yang sudah LOCKED dengan alasan tertulis.
- **US-4.HQU.02** — Sebagai HQ Auditor, saya ingin melihat audit trail lengkap satu shift untuk kebutuhan audit eksternal.

---

## Cross-Cutting Stories (Semua Fase)

**US-X.ALL.01** — Sebagai user apa pun, saya ingin logout dari semua device saya, supaya kalau kehilangan device bisa revoke akses.
- **Acceptance**: POST `/auth/logout-all` → semua refresh token user di-revoke.

**US-X.ALL.02** — Sebagai user multi-scope, saya ingin switch antar scope tanpa harus logout-login, supaya lebih cepat.
- **Acceptance**: POST `/auth/switch-scope` return token baru dengan `activeScope` yang baru.

**US-X.ADMIN.01** — Sebagai HQ Admin, saya ingin melihat siapa yang sedang login aktif di sistem, supaya bisa force-logout kalau perlu.
- **Acceptance**: GET `/admin/sessions` list session aktif; DELETE `/admin/sessions/:id` untuk force logout.

## SUPERADMIN Stories (Fase 0+)

**US-0.SUP.01** — Sebagai vendor developer, saya ingin login sebagai SUPERADMIN dengan 2FA, supaya bisa akses cross-tenant untuk debugging tanpa risiko keamanan.
- **Acceptance**: POST `/auth/login` + verify 2FA OTP → JWT expiry 5 menit + refresh 7 hari; kalau tanpa 2FA verify, 401.

**US-0.SUP.02** — Sebagai SUPERADMIN, saya ingin melihat audit trail lintas company, supaya bisa investigasi isu.
- **Acceptance**: GET `/super/audit?from=…&to=…&entityTable=…` (bypass RLS) — return semua record cross-tenant.

**US-0.SUP.03** — Sebagai SUPERADMIN, saya ingin melihat security log (login attempts, permission denied), supaya bisa deteksi anomali.
- **Acceptance**: GET `/super/security-log?type=LOGIN_FAILED|PERMISSION_DENIED|SESSION_REVOKED&from=…&to=…`.

**US-0.SUP.04** — Sebagai SUPERADMIN, saya ingin impersonate user lain untuk mereproduksi bug, supaya troubleshooting lebih cepat.
- **Acceptance**: POST `/super/impersonate` dengan `userId` → JWT actor asli disimpan di claim `impersonatorId`; semua aksi audit dengan `is_privileged=true` + `impersonator_id`.

**US-0.SUP.05** — Sebagai SUPERADMIN, saya ingin force-logout user tertentu, supaya kalau ada akun kompromise bisa langsung diamankan.
- **Acceptance**: POST `/super/users/:id/force-logout` → semua refresh token user di-revoke.

**US-0.SUP.06** — Sebagai SUPERADMIN, saya ingin diberi tahu (in-app notification) saat SUPERADMIN lain melakukan privileged action, supaya self-policing terjaga.
- **Acceptance**: privileged action trigger notification ke SUPERADMIN lain yang aktif; ada halaman "Privileged Activity Feed".

**US-0.SUP.07** — Sebagai SUPERADMIN, saya ingin assign SUPERADMIN baru (dibatasi max 3 total aktif), supaya suksesi terjaga.
- **Acceptance**: POST `/super/superadmin/assign` → cek count aktif < 3, otherwise 400.

**US-0.SUP.08** — Sebagai SUPERADMIN, saya ingin melihat semua sesi aktif user (mobile + web) di satu halaman, supaya bisa cepat identifikasi mana yang harus di-revoke.
- **Acceptance**: GET `/super/users/:id/sessions` return list dengan deviceType, deviceName, lastActive, IP.

**US-0.SUP.09** — Sebagai SUPERADMIN, saya ingin revoke sesi mobile user tertentu (untuk kasus pindah HP), supaya user bisa login di device baru.
- **Acceptance**: POST `/super/sessions/:id/revoke` dengan reason → session status REVOKED, notif ke SUPERADMIN lain (self-policing).

**US-3.OP.05** — Sebagai Operator, saya ingin diberitahu jelas saat coba login di device baru padahal sesi lama masih aktif, supaya paham langkah selanjutnya (kontak SUPERADMIN).
- **Acceptance**: POST `/auth/login` dengan deviceType=MOBILE + deviceId berbeda dari sesi aktif → 409 SESSION_EXISTS dengan info device lama + instruksi kontak SUPERADMIN.

**US-3.OP.06** — Sebagai Operator, saya ingin melihat sesi milik saya sendiri di setting app, supaya tahu apakah ada anomali.
- **Acceptance**: GET `/auth/me/sessions` return sesi mobile + web milik user (bukan bisa revoke device lain — itu tetap harus SUPERADMIN).

**US-3.SYS.04** — Sebagai sistem, saya ingin enforce single-session mobile per user secara DB-level (bukan hanya service), supaya race condition tidak menghasilkan dobel session.
- **Acceptance**: Partial unique index `WHERE device_type = 'MOBILE' AND revoked_at IS NULL` — insert kedua akan gagal di DB level walau service race.

**US-0.SYS.03** — Sebagai sistem, saya ingin bootstrap SUPERADMIN pertama lewat CLI script (bukan UI), supaya chicken-and-egg auth problem terselesaikan.
- **Acceptance**: `npm run seed:superadmin --username ... --email ...` → password auto-generate + print sekali di terminal.

---

## Ringkasan Prioritas Delivery

| Fase | Jumlah Stories | Prioritas Delivery |
|---|---|---|
| Fase 0 | 6 detailed (HQD 5 + SYS 1) | P0 — fondasi wajib |
| Fase 1 | 15 detailed (OP 10 + SUP 4 + GDG 2) | P0 — pilot value |
| Fase 2 | 5 epic | P1 — post-pilot |
| Fase 3 | 6 epic | P1/P2 — mobile bisa paralel |
| Fase 4 | 6 epic | P2 — value bertingkat |
| Cross | 3 detailed | P1 — dibundle sesuai fase relevan |

---

## Referensi
- [`01-prd.md`](./01-prd.md) §4 — fitur per level (mapping ke user story).
- [`06-api-spec.md`](./06-api-spec.md) — endpoint yang mendukung setiap acceptance.
- [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) — flow tablet detail untuk stories Fase 1.
