# 05 · RBAC Matrix — Role × Permission × Scope

Model RBAC untuk MES multi-cabang: **Role + Permission + Scope Assignment**, bukan role tunggal di user table.

---

## 1. Konsep

### 1.1. Tiga Elemen
- **Role** — kumpulan Permission. Contoh: `PLANT_MANAGER`, `HQ_ANALYST`.
- **Permission** — izin granular untuk aksi tertentu. Format: `<resource>.<action>` atau `<resource>.<sub>.<action>`. Contoh: `shift.approve`, `masterdata.product.edit`.
- **Scope** — cakupan visibilitas: `COMPANY` / `REGION` / `PLANT`. Setiap user punya satu atau lebih **UserAssignment** yang memberikan `(role, scope)`.

### 1.2. Aturan Evaluasi
Untuk cek apakah user boleh melakukan aksi X pada resource Y:
1. Ambil semua `UserAssignment` aktif user (yang `revoked_at IS NULL`).
2. Untuk setiap assignment: role → daftar permission via `role_permission`.
3. Cek: apakah permission yang dibutuhkan (mis. `shift.approve`) ada di role dan scope-nya cover resource Y (mis. `shift.plantId` ada di plant yang bisa diakses).
4. Kalau **ada satu** assignment yang cukup → allow. Kalau tidak → deny (403).

### 1.3. Ekspansi Scope
- `COMPANY` scope → cover semua region & plant di company itu.
- `REGION` scope → cover semua plant di region itu.
- `PLANT` scope → hanya plant itu.

Resolver menghasilkan `current_plant_ids[]` yang di-inject ke session Postgres untuk RLS.

---

## 2. Daftar Role (Fase 0–6)

| Role Code | Nama | Scope Level | Deskripsi | Fase |
|---|---|---|---|---|
| `SUPERADMIN` | Super Admin | GLOBAL | **Akses tak terbatas ke semua company/region/plant. Bypass RLS. Wajib akses audit trail dan security log.** Hanya untuk vendor developer + 1-2 orang IT lead perusahaan. | 0 |
| `HQ_ADMIN` | HQ Admin | COMPANY | Kelola master data pusat, assign scope user, onboarding pabrik | 0 |
| `HQ_ANALYST` | HQ Analyst | COMPANY | Read-only ke semua data operasional untuk analisis | 0 |
| `HQ_AUDITOR` | HQ Auditor | COMPANY | CORRECTION shift yang sudah LOCKED, akses audit trail | 0 |
| `AREA_COORDINATOR` | Koordinator Area | REGION | Pantau pabrik dalam wilayah, drill-down ke shift | 2 |
| `AREA_QA` | Area QA | REGION | Kualitas produksi lintas pabrik di area (read + note) | 2 |
| `PLANT_MANAGER` | Plant Manager | PLANT | Kelola operasional pabrik, view semua shift + WMS | 1 |
| `SHIFT_SUPERVISOR` | Supervisor Pabrik | PLANT | Approve shift, review handoff | 1 |
| `OPERATOR_KECER` | Operator Kecer | PLANT | Ketua tim shift, input produksi & handoff | 1 |
| `OPERATOR_MEMBER` | Anggota Tim | PLANT | Anggota tim (tercatat di ShiftMember, akses baca) | 1 |
| `GUDANG_INBOUND` | Gudang Inbound | PLANT | **Receiving TSG dari supplier, kelola inventory FIFO** | 1 |
| `GUDANG_OUTBOUND` | Gudang Outbound | PLANT | **Terima pack dari HLP, cartoning, mapping karton↔pack** | 5 |
| `EKSPEDISI` | Ekspedisi | PLANT | **Dispatch karton, generate surat jalan PDF** | 6 |

> `GUDANG` (v1) di-split jadi `GUDANG_INBOUND` (Fase 1) & `GUDANG_OUTBOUND` (Fase 5). Migration: user existing dengan role `GUDANG` di-migrate ke `GUDANG_INBOUND` di Fase 1. `GUDANG_OUTBOUND` diberikan saat Fase 5 rollout.

### 2.1. SUPERADMIN — Peraturan Khusus

`SUPERADMIN` adalah role yang **memiliki semua permission tanpa terikat scope** (`scope_level = 'GLOBAL'`). Berbeda dari `HQ_ADMIN` yang scope-nya company-level; SUPERADMIN dapat:

- Melihat & memodifikasi data di semua company (kalau nanti ada multi-company).
- Bypass RLS via session variable `app.bypass_rls = true` (lihat [`04-data-model.md`](./04-data-model.md) §9.4).
- Impersonate user lain (login sebagai) untuk debugging.
- Full akses **audit trail** dan **security log** (aktivitas login, session, failed attempts, permission denied).
- Force logout user, revoke session, dan reset password user lain.

**Aturan compliance & operasional**:
1. **Jumlah SUPERADMIN dibatasi max 3**: vendor developer + 1-2 IT lead perusahaan. Assignment > 3 → block di service layer.
2. **Setiap aksi SUPERADMIN otomatis ke audit log dengan flag `is_privileged = true`** — highlighted di audit viewer.
3. **Login SUPERADMIN wajib 2FA** (WhatsApp OTP atau TOTP). Config dari master `auth_policy`.
4. **Assignment SUPERADMIN hanya bisa oleh SUPERADMIN existing** — bootstrap awal (first user) lewat CLI/seed script, bukan lewat UI.
5. **Session SUPERADMIN pendek**: JWT expiry 5 menit (bukan 15 menit default), refresh token 7 hari (bukan 30 hari).
6. **IP allowlist opsional** per environment — production bisa dibatasi IP kantor + VPN developer.

---

## 3. Daftar Permission

Grouping per resource. Format kode `resource.subresource.action`.

### 3.1. Shift (operasional)
| Permission | Deskripsi |
|---|---|
| `shift.start` | Mulai shift baru |
| `shift.member.assign` | Tambah/ubah anggota tim shift saat RUNNING |
| `shift.box.open` | Buka boks TSG baru |
| `shift.box.weigh` | Timbang hasil boks (input output) |
| `shift.consumption.log` | Log consumables event per boks |
| `shift.downtime.log` | Log downtime |
| `shift.maintenance.log` | Log maintenance/sparepart |
| `shift.waste.input` | Input waste 4 kategori di end shift |
| `shift.waste.settle` | Tandai waste `LUNAS` (setelah diserahkan gudang) |
| `shift.end` | Akhiri shift (status → COMPLETED) |
| `shift.handoff.create` | Buat record handoff saat end shift dengan boks aktif |
| `shift.approve` | Approve shift → LOCKED |
| `shift.reopen` | Reopen shift pre-approval (COMPLETED → RUNNING) |
| `shift.correct` | Buat CORRECTION record pasca-LOCKED |
| `shift.view` | Lihat detail shift |
| `shift.export` | Export data shift ke CSV/Excel |

### 3.2. HLP & Batch
| Permission | Deskripsi |
|---|---|
| `hlp.pack` | Input pack HLP untuk batch |
| `batch.view` | Lihat lineage batch |

### 3.3. TSG & WMS Inbound (Fase 1)
| Permission | Deskripsi |
|---|---|
| `tsg.receiving.create` | Register kedatangan TSG (header + list boks) |
| `tsg.receiving.view` | Lihat riwayat receiving TSG |
| `tsg.inventory.view` | Lihat inventory TSG dengan FIFO order |
| `tsg.inventory.allocate` | Alokasikan boks ke shift (auto-suggest FIFO) |
| `tsg.inventory.allocate.override` | Override FIFO — pilih boks non-tertua dengan alasan audit |
| `tsg.inventory.writeoff` | Tandai boks WRITTEN_OFF (rusak/hilang) dengan alasan |

### 3.4. WMS Outbound (Fase 5)
| Permission | Deskripsi |
|---|---|
| `finishedgoods.receive` | Confirm receipt pack dari HLP |
| `finishedgoods.dispute` | Report discrepancy count → trigger correction |
| `finishedgoods.view` | Lihat riwayat receiving pack |
| `cartoning.create` | Buat karton baru (OPEN) |
| `cartoning.add_pack` | Tambah pack ke karton OPEN |
| `cartoning.close` | Tutup karton (OPEN → READY) |
| `cartoning.view` | Lihat daftar karton + lineage traceability |

### 3.5. Distribusi (Fase 6)
| Permission | Deskripsi |
|---|---|
| `dispatch.order.create` | Buat draft dispatch order |
| `dispatch.order.dispatch` | Konfirmasi dispatch (DRAFT → DISPATCHED) |
| `dispatch.order.view` | Lihat riwayat dispatch |
| `dispatch.document.generate` | Generate PDF surat jalan |

### 3.6.a. Super Admin (khusus)
| Permission | Deskripsi |
|---|---|
| `super.bypass_rls` | Session variable `app.bypass_rls=true`. Hanya di endpoint terpilih (audit, migration, debug). |
| `super.impersonate` | Login as user lain — session baru dengan actor asli tercatat di audit. |
| `super.force_logout` | Revoke session user lain (semua device). |
| `super.session.view` | Lihat semua session user lain (device, IP, aktivitas). |
| `super.session.revoke` | Revoke sesi spesifik (untuk pindah HP mobile). **Mandatory untuk unblock user yang kena SESSION_EXISTS.** |
| `super.reset_password` | Reset password user tanpa email flow. |
| `super.audit.read_all` | Baca semua audit log lintas company (bukan hanya scope). |
| `super.audit.security` | Akses security log: login attempts, permission denied, IP suspicious. |
| `super.superadmin.assign` | Assign role SUPERADMIN ke user lain (dibatasi max 3 aktif). |
| `super.database.migrate` | Trigger migration dari UI (default via CLI). |

### 3.6.b. Master Data
| Permission | Deskripsi |
|---|---|
| `masterdata.machine.edit` | CRUD machine |
| `masterdata.product.edit` | CRUD product |
| `masterdata.plant-product.assign` | Assign produk ke plant |
| `masterdata.machine-template.edit` | CRUD template (yield range dsb) |
| `masterdata.consumable.edit` | CRUD consumable item |
| `masterdata.sparepart.edit` | CRUD sparepart |
| `masterdata.shift-role.edit` | CRUD shift role (per plant / global) |
| `masterdata.shift-template.edit` | CRUD shift template per plant |
| `masterdata.downtime-category.edit` | CRUD downtime category (jarang berubah) |
| `masterdata.reject-reason.edit` | CRUD reject reason |
| `masterdata.plant.edit` | CRUD plant/region/company (onboarding) |
| `masterdata.tsg-supplier.edit` | CRUD supplier TSG |

### 3.5. Dashboard & Report
| Permission | Deskripsi |
|---|---|
| `dashboard.plant.view` | Dashboard per pabrik |
| `dashboard.area.view` | Dashboard rollup area |
| `dashboard.hq.view` | Dashboard rollup HQ |
| `report.export_cukai` | Export report cukai bulanan |
| `report.export_operational` | Export data operasional custom |

### 3.6. User & Audit
| Permission | Deskripsi |
|---|---|
| `user.create` | Create user baru |
| `user.assign_scope` | Assign role × scope ke user |
| `user.revoke_scope` | Revoke assignment |
| `audit.read` | Baca audit log |

---

## 4. Matriks Role × Permission

Legenda: **●** = allowed di scope role, **○** = denied.

| Permission | HQ_ADMIN | HQ_ANALYST | HQ_AUDITOR | AREA_COORD | AREA_QA | PLANT_MGR | SUPERVISOR | OP_KECER | OP_MEMBER | GUDANG |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `shift.start` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.member.assign` | ● | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.box.open` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.box.weigh` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.consumption.log` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.downtime.log` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.maintenance.log` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.waste.input` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.waste.settle` | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ● |
| `shift.end` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.handoff.create` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `shift.approve` | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ |
| `shift.reopen` | ● | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ○ |
| `shift.correct` | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `shift.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `shift.export` | ● | ● | ● | ● | ○ | ● | ● | ○ | ○ | ○ |
| `hlp.pack` | ○ | ○ | ○ | ○ | ○ | ● | ● | ● | ○ | ○ |
| `batch.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ |
| `tsg.register_incoming` | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ○ | ● |
| `masterdata.machine.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.product.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.plant-product.assign` | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| `masterdata.machine-template.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.consumable.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.sparepart.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.shift-role.edit` | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| `masterdata.shift-template.edit` | ● | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| `masterdata.downtime-category.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.reject-reason.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `masterdata.plant.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `dashboard.plant.view` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| `dashboard.area.view` | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `dashboard.hq.view` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `report.export_cukai` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `report.export_operational` | ● | ● | ● | ● | ○ | ● | ● | ○ | ○ | ○ |
| `user.create` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `user.assign_scope` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `user.revoke_scope` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `audit.read` | ● | ● | ● | ● | ● | ● | ● | ○ | ○ | ○ |

**Catatan** untuk baris tertentu:
- `shift.start`, `shift.end`, `shift.approve` untuk `PLANT_MANAGER`/`SUPERVISOR`/`OP_KECER` — sesuai `shift_role.canApproveShift` / `.canEndShift` di master data. Sistem cek keduanya (permission + shift_role flag).
- `masterdata.shift-role.edit` untuk `PLANT_MANAGER`: hanya boleh edit shift_role dengan `plant_id = plant-nya`, bukan global.

### 4.1. Matriks Role WMS + Distribusi (permission baru dari expansion)

Legenda sama: **●** = allowed, **○** = denied. Role lain (HQ, AREA, PLANT_MGR, dst) mengikuti pola yang masuk akal — HQ_ADMIN dapat semua, PLANT_MANAGER dapat baca semuanya di plant-nya.

| Permission | HQ_ADMIN | PLANT_MGR | GUDANG_INBOUND | GUDANG_OUTBOUND | EKSPEDISI |
|---|:---:|:---:|:---:|:---:|:---:|
| `tsg.receiving.create` | ○ | ● | ● | ○ | ○ |
| `tsg.receiving.view` | ● | ● | ● | ○ | ○ |
| `tsg.inventory.view` | ● | ● | ● | ○ | ○ |
| `tsg.inventory.allocate` | ○ | ● | ● | ○ | ○ |
| `tsg.inventory.allocate.override` | ○ | ● | ○ | ○ | ○ |
| `tsg.inventory.writeoff` | ○ | ● | ● | ○ | ○ |
| `finishedgoods.receive` | ○ | ● | ○ | ● | ○ |
| `finishedgoods.dispute` | ○ | ● | ○ | ● | ○ |
| `finishedgoods.view` | ● | ● | ○ | ● | ● |
| `cartoning.create` | ○ | ● | ○ | ● | ○ |
| `cartoning.add_pack` | ○ | ● | ○ | ● | ○ |
| `cartoning.close` | ○ | ● | ○ | ● | ○ |
| `cartoning.view` | ● | ● | ○ | ● | ● |
| `dispatch.order.create` | ○ | ● | ○ | ○ | ● |
| `dispatch.order.dispatch` | ○ | ● | ○ | ○ | ● |
| `dispatch.order.view` | ● | ● | ○ | ● | ● |
| `dispatch.document.generate` | ○ | ● | ○ | ○ | ● |
| `masterdata.tsg-supplier.edit` | ● | ○ | ○ | ○ | ○ |

**Aturan enforcement tambahan** (layer aplikasi):
1. `tsg.inventory.allocate.override` — hanya bisa dipakai kalau user ada di `PLANT_MANAGER`. Setiap pemakaian tercatat di audit log dengan `reason`.
2. `finishedgoods.dispute` — kalau di-trigger, otomatis create pending task ke `SHIFT_SUPERVISOR` pabrik untuk verifikasi + optional CORRECTION shift.
3. Karton yang ditambah ke dispatch order harus status `READY` — enforced service + di UI hanya karton READY yang muncul di picker.

### 4.2. Matriks SUPERADMIN

SUPERADMIN dapat **semua** permission di semua kategori (§3.1-§3.6.b) — implisit di service. Selain itu punya permission eksklusif di §3.6.a:

| Permission Eksklusif | SUPERADMIN | HQ_ADMIN | (lain) |
|---|:---:|:---:|:---:|
| `super.bypass_rls` | ● | ○ | ○ |
| `super.impersonate` | ● | ○ | ○ |
| `super.force_logout` | ● | ○ | ○ |
| `super.reset_password` | ● | ○ | ○ |
| `super.audit.read_all` | ● | ○ | ○ |
| `super.audit.security` | ● | ○ | ○ |
| `super.superadmin.assign` | ● | ○ | ○ |
| `super.database.migrate` | ● | ○ | ○ |

**Guard clause di service**: kalau `SUPERADMIN` execute action, cek `is_privileged=true` di audit log dan **broadcast notification** ke SUPERADMIN lain (self-policing). Ini best practice: privileged actions harus visible antar SUPERADMIN.

---

## 5. Contoh Kombinasi User (Real-World Cases)

### 5.1. Operator sederhana
**Andi** — kecer di Pabrik Malang-1.
```
user_assignment:
  { userId: usr_andi, scopeType: PLANT, scopeId: PLT-MLG-01, roleId: OPERATOR_KECER }
```
Effective scope: `[PLT-MLG-01]`. Bisa start/end shift di MKR-01/02 dan HLP-01 pabrik ini saja.

### 5.2. Koordinator area
**Budi** — koordinator Area Jatim.
```
user_assignment:
  { userId: usr_budi, scopeType: REGION, scopeId: AREA-JATIM, roleId: AREA_COORDINATOR }
```
Effective scope: expand ke semua plant di AREA-JATIM (misal 12 plant). Read-only ke operasional, akses dashboard area.

### 5.3. Multi-scope hybrid
**Citra** — Auditor HQ + Manager di Pabrik Kediri (transisi karir).
```
user_assignment:
  { userId: usr_citra, scopeType: COMPANY, scopeId: HMR, roleId: HQ_AUDITOR }
  { userId: usr_citra, scopeType: PLANT,   scopeId: PLT-KDR-01, roleId: PLANT_MANAGER }
```
Effective scope tergantung `activeScopeType` di sesi:
- Kalau aktif sebagai `HQ_AUDITOR@HMR` → semua plant, tapi hanya bisa `shift.correct`.
- Kalau aktif sebagai `PLANT_MANAGER@PLT-KDR-01` → satu plant, tapi bisa semua permission plant-level.

User switch scope lewat `POST /auth/switch-scope` — session baru dibuat, `activeScopeType/Id` diperbarui.

### 5.4. Supervisor lintas pabrik
**Dedi** — supervisor untuk 2 pabrik (Malang-1 dan Malang-2, dalam area sama).
```
user_assignment:
  { userId: usr_dedi, scopeType: PLANT, scopeId: PLT-MLG-01, roleId: SHIFT_SUPERVISOR }
  { userId: usr_dedi, scopeType: PLANT, scopeId: PLT-MLG-02, roleId: SHIFT_SUPERVISOR }
```
Effective scope: `[PLT-MLG-01, PLT-MLG-02]`. Bisa approve shift di dua pabrik.

---

## 6. Aturan Tambahan (Enforcement di Layer Aplikasi)

Beberapa aturan tidak bisa diekspresikan hanya di RLS + permission table — perlu logic di API service:

1. **`shift.approve` tidak boleh oleh user yang sama dengan `createdBy`** — supervisor tidak boleh approve shift-nya sendiri. Enforce di API layer.
2. **`shift.correct` hanya untuk shift `APPROVED`** — cek state sebelum ijinkan.
3. **`shift.end` tolak jika ada boks aktif dan `shift.handoff.create` belum di-call** — service layer chain requirement.
4. **`shift.waste.settle` (LUNAS) hanya boleh setelah shift COMPLETED** — jangan settle waste yang masih RUNNING.
5. **`shift.member.assign` di shift RUNNING** — boleh, tapi masuk audit log. Tidak boleh setelah COMPLETED.
6. **`masterdata.machine-template.edit`** membuat versi baru (`is_current` flip), bukan overwrite — dokumen ke `04-data-model.md` §5.1.

---

## 7. Testing Strategy RBAC

### 7.1. Unit test (per permission)
Untuk setiap permission di daftar, minimal 2 test:
- **Positive**: role yang punya permission dapat 200/201.
- **Negative**: role yang tidak punya permission dapat 403.

### 7.2. Integration test (multi-scope)
Skenario yang harus lolos:
- User dengan `PLANT` scope di plant A → SELECT `shift_report` dari plant B → 0 rows (RLS filter).
- User dengan `REGION` scope → SELECT dari plant di region tersebut → dapat data; dari region lain → 0 rows.
- User dengan `COMPANY` scope → SELECT dari semua plant di company → dapat data; dari company lain (kalau ada) → 0 rows.

### 7.3. Enforcement test
- Coba `UPDATE shift_report SET status = 'RUNNING' WHERE status = 'APPROVED'` sebagai SUPERVISOR → 0 rows updated (RLS block).
- Approve shift oleh user yang sama dengan `createdBy` → 400 (API layer block).

---

## 8. Referensi
- [`04-data-model.md`](./04-data-model.md) §4 — skema `user_assignment`, `role`, `permission`.
- [`04-data-model.md`](./04-data-model.md) §9 — RLS policy.
- [`06-api-spec.md`](./06-api-spec.md) — endpoint spesifik dengan permission requirement.
