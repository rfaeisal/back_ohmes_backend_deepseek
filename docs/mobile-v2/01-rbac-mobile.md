# 01 · RBAC untuk Mobile — Role & Permission

**Sumber kebenaran** untuk pertanyaan "role mana yang bisa login mobile + boleh ngapain saja". Diverifikasi terhadap `src/db/seed.ts` (rolePerms) dan route handlers (2026-08-22). Permission web-only (supervisor approve via web, report cukai, dsb.) tidak dibahas di sini.

---

## 1. Konsep

- **Role** — kumpulan permission. Contoh: `AREA_SJ_OFFICER`, `GUDANG_INBOUND`.
- **Permission** — izin granular `<resource>.<action>`. Contoh: `supplier.sj.create`, `tsg.inventory.view`.
- **Scope** — cakupan visibilitas: `GLOBAL` / `COMPANY` / `REGION` / `PLANT`, didapat dari `UserAssignment` (role + scope).
- **Evaluasi**: permission dibutuhkan & scope meng-cover resource → allow. SUPERADMIN (`isPrivileged`) selalu lolos.
- **Scope REGION → plant**: backend otomatis meng-expand scope REGION menjadi semua plant di region tersebut (`src/lib/auth/scope-resolver.ts`). Jadi role REGION (petugassj, koordinator area, QA) melihat data seluruh plant di region-nya — tanpa konfigurasi tambahan.

## 2. Role yang Bisa Login Mobile

| Role Code | Nama | Scope | Deskripsi di Mobile |
|---|---|---|---|
| `AREA_SJ_OFFICER` | Petugas Label Area (petugassj) | REGION | Full flow Surat Jalan supplier di gudang supplier: buat SJ, scan label = assign jenis + berat, tandai SHIPPED. Cetak pool label tetap **web** area office. |
| `GUDANG_INBOUND` | Gudang Inbound | PLANT | Receiving TSG + validasi jumlah vs SJ (`from-sj`). |
| `PLANT_MANAGER` | Plant Manager | PLANT | Dashboard pabrik + kondisi stok TSG + aksi ringan: approve shift, approve receiving, writeoff, transfer, FIFO override. |
| `AREA_COORDINATOR` | Koordinator Area | REGION | Dashboard area + kondisi stok TSG (monitoring). |
| `AREA_QA` | Area QA | REGION | Read-only: dashboard area + kondisi stok TSG. |
| `SUPERADMIN` | Super Admin | GLOBAL | Akses tak terbatas + 2FA + sesi pendek. Jarang login mobile, tapi bisa. |

**TIDAK login mobile** (web/tablet):

| Role | Di mana |
|---|---|
| `OPERATOR_KECER`, `OPERATOR_MEMBER` | Tablet web `/tablet` (start/end shift, buka boks, timbang, waste, HLP) |
| `SHIFT_SUPERVISOR` | Web `/admin/approvals` (approve shift) |
| `GUDANG_OUTBOUND` | Web (Fase 5 cartoning) |
| `EKSPEDISI` | Web (Fase 6 dispatch) |
| `HQ_ADMIN`, `HQ_ANALYST`, `HQ_AUDITOR` | Web |

## 3. Permission per endpoint mobile (diverifikasi dari kode)

### 3.1 Auth & umum — semua authenticated user
`POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` · `POST /auth/logout` · `POST /auth/switch-scope` · `PATCH /auth/change-password` · `POST /qr/resolve` · `POST /qr/scan-log` · `POST /mobile/sync` · `POST /mobile/push-register` · `GET /notifications`

### 3.2 Master data read — semua authenticated user
`GET /machines` · `/products` · `/shift-templates` · `/shift-roles` · `/consumable-items` · `/spareparts` · `/tsg-suppliers` · `/users` (auth-only, tanpa param)

### 3.3 Surat Jalan Supplier

| Permission | Endpoint | Role |
|---|---|---|
| `supplier.sj.create` | `POST /supplier-sj`, `PATCH /supplier-sj/:id` (→ SHIPPED), `GET /supplier-sj/options` | `AREA_SJ_OFFICER`, `AREA_COORDINATOR`* |
| `supplier.sj.view` | `GET /supplier-sj`, `GET /supplier-sj/:id`, `GET /supplier-sj/labels/:boxCode` | `AREA_SJ_OFFICER`, `AREA_COORDINATOR`*, `GUDANG_INBOUND`, `PLANT_MANAGER` |
| `supplier.sj.label` | `POST /supplier-sj/:id/boxes/weigh`, `POST /supplier-sj/labels/:boxCode/void` | `AREA_SJ_OFFICER`, `AREA_COORDINATOR`* |
| `supplier.sj.pool` | `GET/POST /supplier-sj/pool`, `POST /supplier-sj/pool/pdf` | `AREA_SJ_OFFICER` — **web only** (area office, print) |

\* `AREA_COORDINATOR` memegang `supplier.sj.*` di seed (cadangan petugas SJ), tapi **tidak masuk screen mobile** sesuai keputusan PM.

### 3.4 WMS Inbound — receiving & inventory

| Permission | Endpoint | Role |
|---|---|---|
| `tsg.receiving.create` | `POST /tsg-receiving`, `POST /tsg-receiving/from-sj` | `GUDANG_INBOUND`, `PLANT_MANAGER` |
| `tsg.receiving.view` | `GET /tsg-receiving` | `GUDANG_INBOUND`, `PLANT_MANAGER`, `AREA_SJ_OFFICER`, `AREA_COORDINATOR`, `AREA_QA` |
| `tsg.receiving.approve` | `POST /tsg-receiving/:id/approve` | `PLANT_MANAGER` |
| `tsg.inventory.view` | `GET /tsg-inventory/available` | `GUDANG_INBOUND`, `PLANT_MANAGER`, `AREA_COORDINATOR`, `AREA_QA` |
| `tsg.inventory.allocate` | `PATCH /tsg-inventory/:id` | `GUDANG_INBOUND`, `PLANT_MANAGER` (via tablet web untuk shift; di mobile hanya PLANT_MANAGER bila diperlukan) |
| `tsg.inventory.allocate.override` | (FIFO override, dalam allocate) | `PLANT_MANAGER` — wajib alasan, tercatat audit |
| `tsg.inventory.writeoff` | `PATCH /tsg-inventory/:id/writeoff` | `GUDANG_INBOUND`, `PLANT_MANAGER` |
| `tsg.inventory.transfer` | `POST /tsg-transfers` | `GUDANG_INBOUND`, `PLANT_MANAGER` |

### 3.5 Monitoring — dashboard & shift

| Permission | Endpoint | Role |
|---|---|---|
| `dashboard.plant.view` | `GET /dashboards/plant/:plantId/kpi` | `PLANT_MANAGER`, `AREA_COORDINATOR`, `AREA_QA` |
| `dashboard.area.view` | `GET /dashboards/area/:regionId/kpi` | `AREA_COORDINATOR`, `AREA_QA` |
| `shift.view` | `GET /shifts`, `GET /shifts/:id`, `GET /shifts/handoffs/unclaimed` | `PLANT_MANAGER`, `AREA_COORDINATOR`, `AREA_QA`, `AREA_SJ_OFFICER` |
| `shift.approve` | `POST /shifts/:id/approve` | `PLANT_MANAGER` |
| `shift.reopen` | `POST /shifts/:id/reopen` | `PLANT_MANAGER` |
| `shift.waste.settle` | `PATCH /shifts/:id/waste/:category` | `PLANT_MANAGER` |

Catatan: `AREA_COORDINATOR` & `AREA_QA` juga memegang `dashboard.plant.view` — dashboard pabrik bisa diakses dari region scope (pilih plant).

## 4. Multi-scope user

Login response berisi `assignments`. Kalau user punya >1 assignment (mis. petugassj + gudang di plant berbeda):
- App wajib tampilkan **picker scope aktif** setelah login.
- Pilihan disimpan di token (`activeScope`).
- Switch tanpa logout via `POST /auth/switch-scope` `{scopeType, scopeId}`.

## 5. Aturan enforcement app-side

1. **Sembunyikan tombol** yang user tidak punya permission-nya (mis. tombol "TANDAI SHIPPED" hanya bila `supplier.sj.create`).
2. **403** → pesan jelas: "Anda tidak berwenang. Hubungi administrator."
3. **409 SESSION_EXISTS** → modal info device lama + "Hubungi IT" (lihat `02-auth-session.md` §3).
4. **401 saat token expired** → auto-refresh sekali lalu retry; refresh juga 401 → logout + redirect login.
5. **Switch scope** → refresh semua data scope-dependent (SJ, stok TSG, dashboard).

## 6. Referensi

- Kontrak endpoint lengkap: [`03-api-contract.md`](./03-api-contract.md)
- Matrix RBAC sistem (web+semua role): `docs/05-rbac-matrix.md`
- Flow per role: [`06-flow-supplier-sj.md`](./06-flow-supplier-sj.md), [`07-flow-receiving.md`](./07-flow-receiving.md), [`08-flow-monitoring.md`](./08-flow-monitoring.md)
