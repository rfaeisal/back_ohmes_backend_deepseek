# 08 · Flow Monitoring & Dashboard — Mobile Flutter

Alur monitoring (dashboard + stok TSG + aksi ringan) untuk role manajemen di mobile Flutter (rebuild dari nol). **Tanpa spec layar detail** — dokumen ini mendefinisikan konteks per role, endpoint + permission, cara scope bekerja, dan makna setiap field KPI. Kontrak payload lengkap: `03-api-contract.md`.

Sumber kebenaran: kode aktif `src/app/api/v1/dashboards/plant/[plantId]/kpi/route.ts`, `src/app/api/v1/dashboards/area/[regionId]/kpi/route.ts`, `src/lib/services/area-dashboard.service.ts`, `src/lib/auth/scope-resolver.ts`, `src/db/seed.ts` (role-permission), dan `src/lib/services/wms-inbound.service.ts`.

---

## 1. Konteks per Role

| Role | Scope | Tugas di mobile |
|---|---|---|
| `PLANT_MANAGER` | PLANT | Dashboard pabrik (KPI produksi harian) + stok TSG pabriknya + **aksi ringan**: approve shift, approve receiving, writeoff, transfer, (FIFO override — lihat catatan §5). |
| `AREA_COORDINATOR` | REGION | Dashboard area (rollup semua pabrik dalam region) + stok TSG area. Read-only (tidak ada aksi mutasi di app ini). |
| `AREA_QA` | REGION | Sama seperti coordinator — dashboard area + stok TSG, **read-only**. Tidak punya aksi apa pun. |

> Operator lantai (`OPERATOR_KECER`, `SHIFT_SUPERVISOR`, dst.) **tidak** ada di mobile — mereka bekerja di tablet web. Mobile = pemantauan & approval untuk role di atas.

Permission relevan per role (dari `src/db/seed.ts`):

| Permission | PLANT_MANAGER | AREA_COORDINATOR | AREA_QA |
|---|---|---|---|
| `dashboard.plant.view` | ✅ | ✅ | ✅ |
| `dashboard.area.view` | ❌ (tidak di seed) | ✅ | ✅ |
| `tsg.inventory.view` | ✅ | ✅ | ✅ |
| `tsg.receiving.view` | ✅ | ✅ | ✅ |
| `shift.view` | ✅ | ✅ | ✅ |
| `shift.approve` | ✅ | ❌ | ❌ |
| `tsg.receiving.approve` | ✅ | ❌ | ❌ |
| `tsg.inventory.writeoff` | ✅ | ❌ | ❌ |
| `tsg.inventory.transfer` | ✅ | ❌ | ❌ |
| `tsg.inventory.allocate` / `allocate.override` | ✅ / ✅ | ❌ | ❌ |
| `supplier.sj.view` | ✅ | ✅ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ |

Test user: `plantmanager` (PLANT), `area.koordinator` (REGION), `areaqa` (REGION) — password `12345678`.

---

## 2. Alur Umum (per role)

### 2.1. PLANT_MANAGER

```
Buka app (login MOBILE) → Home dashboard pabrik:
  1. GET /dashboards/plant/{plantId}/kpi  (plantId = plantIds[0] dari token)
     → kartu KPI: produksi (tsgTotalKg, yieldPct), shift hari ini
       (total/running/completed/approved), waste 4 kategori, top downtime.
  2. Tap "Stok TSG" → GET /tsg-inventory/available
     → daftar boks FIFO (tertua di atas) per jenis.
  3. Tap "Receiving" → GET /tsg-receiving (approvalStatus PENDING muncul
     lebih dulu untuk ditindaklanjuti).
  4. Tap "Shift" → GET list shift hari ini → tap shift COMPLETED →
     POST /shifts/:id/approve { reviewNotes? } → shift APPROVED (LOCKED).
  5. Aksi stok: writeoff (PATCH /tsg-inventory/:id/writeoff + alasan),
     transfer (POST /tsg-transfers), approve receiving manual
     (POST /tsg-receiving/:id/approve).
Drill-down → detail per item; pull-to-refresh; semua mutasi konfirmasi dulu.
```

### 2.2. AREA_COORDINATOR & AREA_QA

```
Buka app → GET /dashboards/area/{regionId}/kpi?mode=day|week
  (regionId = activeScopeId dari token)
  → summary area (totalPlants, totalShifts, pendingApproval, runningShifts)
    + tabel per pabrik (shifts, waste, production, downtimeMinutes).
Tap pabrik → drill-down KPI pabrik (GET /dashboards/plant/{plantId}/kpi)
  → (opsional) lihat stok TSG pabrik (GET /tsg-inventory/available?plantId=)
Tidak ada tombol aksi mutasi — hanya lihat.
```

Konsep layar (saran, tanpa detail): (1) **Home dashboard** — kartu KPI utama + daftar pabrik/plant untuk drill-down; (2) **Detail KPI** — grafik sederhana waste/downtime + breakdown shift; (3) **Stok TSG** — list FIFO dengan filter jenis & status, item bisa dibuka untuk aksi (role yang punya izin); (4) **Aksi/approval** — bottom-sheet konfirmasi dengan ringkasan sebelum submit.

---

## 3. Daftar Endpoint & Permission per Aksi

### 3.1. Baca (dashboard & stok)

| Endpoint | Permission | Catatan |
|---|---|---|
| `GET /api/v1/dashboards/plant/:plantId/kpi` | `dashboard.plant.view` | KPI harian per pabrik (`date` = hari ini server). |
| `GET /api/v1/dashboards/area/:regionId/kpi?date=&mode=day\|week&weekStart=` | `dashboard.area.view` | Rollup area. `mode=week` + `weekStart=YYYY-MM-DD` → agregat 7 hari. |
| `GET /api/v1/tsg-inventory/available?plantId=&limit=` | `tsg.inventory.view` | Stok boks AVAILABLE, **FIFO** (urut `createdAt` ASC = tertua di atas), default limit 20. |
| `GET /api/v1/tsg-receiving?from=&to=&includeBoxes=true` | `tsg.receiving.view` | Riwayat receiving; filter per tanggal (ISO). |
| `GET /api/v1/supplier-sj?status=` | `supplier.sj.view` | (PLANT_MANAGER/Coordinator) pantau SJ. |
| `GET /api/v1/tsg-transfers` | `tsg.inventory.view` | Riwayat transfer keluar pabrik. |

### 3.2. Aksi (mutasi) — wewenang role

| Aksi | Endpoint | Permission | Body | Syarat/pesan error kunci |
|---|---|---|---|---|
| Approve shift | `POST /api/v1/shifts/:id/approve` | `shift.approve` | `{ reviewNotes? }` | Shift COMPLETED → APPROVED (LOCKED, immutable; perubahan lanjut hanya via CORRECTION HQ_AUDITOR). Setelah approve, sistem otomatis membuat ekspektasi finished goods (idempotent). Error: `SHIFT_NOT_FOUND`, status tidak valid. |
| Approve receiving | `POST /api/v1/tsg-receiving/:id/approve` | `tsg.receiving.approve` | – (tanpa body) | Hanya `approvalStatus = PENDING` (receiving manual). Error: `RECEIVING_NOT_FOUND`, `RECEIVING_WRONG_PLANT`, `RECEIVING_ALREADY_APPROVED`. Inilah momen boks masuk inventory. |
| Writeoff boks | `PATCH /api/v1/tsg-inventory/:id/writeoff` | `tsg.inventory.writeoff` | `{ writeoffReason }` (wajib, min 1 karakter) | Boks rusak → `WRITTEN_OFF`. Error: `TSG_BOX_NOT_FOUND`, dll. dari service. |
| Transfer TSG | `POST /api/v1/tsg-transfers` | `tsg.inventory.transfer` | `{ destinationName, inventoryBoxIds[], notes? }` | Kirim boks ke pabrik lain (eksternal) → status `TRANSFERRED`. Error: `NO_PLANT_SCOPE`, `INVALID_BOX_WEIGHT` (tidak relevan di sini), service error 400. |
| (Update lokasi) | `PATCH /api/v1/tsg-inventory/:id` | `tsg.inventory.allocate` | `{ locationCode? }` | Hanya update lokasi hari ini (mis. RAK-A-01-03). |

### 3.3. Catatan penting — FIFO override

- **`tsg.inventory.allocate.override`** sudah dideklarasikan di seed untuk `PLANT_MANAGER` (dan SUPERADMIN), **tetapi belum ada endpoint yang mengeksekusi override FIFO** di backend saat ini — permission cadangan. Jangan bangun UI "pilih boks non-FIFO" sampai endpoint rilis.
- Alokasi boks ke shift dilakukan saat **buka boks di shift** (tablet web, `shift.box.open`) dengan enforce FIFO: boks yang dipilih harus `AVAILABLE`, kalau tidak → `TSG_BOX_NOT_AVAILABLE` ("Boks tidak tersedia di inventory. Cek daftar FIFO."). Di mobile, aksi yang relevan hanya stok view + writeoff/transfer/approve.
- Sesuai aturan bisnis: **override FIFO butuh alasan + audit log** — kalau endpoint override rilis, wajib ada field alasan yang dikirim dan tercatat di audit (`writeAudit`).

---

## 4. Cara Scope Bekerja (PLANT vs REGION)

Mekanisme (`src/lib/auth/scope-resolver.ts`):

1. **Login/me** → server me-resolve `user_assignment` aktif → menghasilkan `activeScopeType` + `activeScopeId` + **`plantIds`** (daftar plant yang bisa diakses) yang masuk ke JWT payload dan response `GET /auth/me` (`{ activeScope: { scopeType, scopeId }, plantIds, ... }`).
2. **Ekspansi scope → plantIds**:
   - `PLANT` → `[scopeId]` (hanya pabrik itu).
   - `REGION` → **semua plant dalam region** (`plant.regionId = scopeId`).
   - `COMPANY` → semua plant di semua region-nya. `GLOBAL` → SUPERADMIN (bypass).
3. **Client tidak pernah mengirim plantId untuk filter** — nilai scope diambil dari token. Pengecualian teknis: `GET /tsg-inventory/available` menerima `?plantId=` opsional (default `plantIds[0]`) — tetap pakai nilai dari scope, bukan input bebas user.
4. **Mobile role REGION** (AREA_COORDINATOR/AREA_QA/AREA_SJ_OFFICER): untuk endpoint area, `regionId` path param = **`activeScopeId`** dari token (`GET /auth/me` → `activeScope.scopeId`). Untuk endpoint plant (drill-down), pilih `plantId` dari `plantIds`.
5. **Mobile role PLANT** (PLANT_MANAGER/GUDANG_INBOUND): `plantIds[0]` = pabriknya; area dashboard tidak relevan (role ini tidak punya `dashboard.area.view`).
6. **RLS** (`app.current_plant_ids` dari JWT) tetap final gate di setiap query — endpoint area sekalipun mengembalikan hanya data plant yang ada di scope user. Role REGION melihat data **semua pabrik di region-nya**, tidak lintas region.
7. **Switch scope**: user dengan banyak assignment bisa ganti active scope via `POST /auth/switch-scope` (server me-resolve ulang dan mengeluarkan token baru dengan plantIds baru) — relevan kalau 1 user pegang >1 region.

---

## 5. Definisi KPI (makna setiap field)

### 5.1. KPI Pabrik — `GET /dashboards/plant/:plantId/kpi` (permission `dashboard.plant.view`)

Response `{ plantId, date, shifts, production, waste, topDowntime }` — **date = hari ini (server, UTC → sesuaikan timezone UI)**, semua agregat hanya untuk tanggal itu.

**`shifts`** — ringkasan shift report hari ini:
| Field | Makna |
|---|---|
| `total` | Jumlah shift report yang tercatat hari ini |
| `byStatus.RUNNING` | Shift masih berjalan |
| `byStatus.COMPLETED` | Shift selesai **menunggu approve** (kandidat aksi PLANT_MANAGER) |
| `byStatus.APPROVED` | Shift disetujui = **LOCKED** (final) |

**`production`** — agregat dari tabel `tsg_box_process` (per boks yang diproses di mesin):
| Field | Makna | Rumus (dari kode) |
|---|---|---|
| `tsgTotalKg` | Total berat **TSG masuk** (input produksi) hari ini | `SUM(tsg_box_process.tsgWeightKg)`, 2 desimal |
| `batanganTotalKg` | Total berat **batangan jadi** (output) hari ini | `SUM(tsg_box_process.outputWeightKg)` |
| `yieldPct` | Efisiensi/rendemen produksi (%). **Kalkulasi server-side** — client dilarang menghitung sendiri | `outputTotal / tsgTotal × 100`, 2 desimal; `0` kalau tidak ada TSG |
| `boxes` | Jumlah boks yang diproses hari ini | `COUNT(tsg_box_process.id)` |

**`waste`** — **4 kategori wajib** (dari `shift_waste.category`; field yang tidak ada = 0):
| Field | Makna |
|---|---|
| `MENIR` | Limbah menir (butir kecil) |
| `RIJEKAN` | Limbah rijekan (daun kasar) |
| `DEBU_KASAR` | Limbah debu kasar |
| `DEBU_HALUS` | Limbah debu halus |

**`topDowntime`** — `[{ category, totalMinutes }]`, **top 5** kategori downtime terbesar hari ini (`SUM(durationMinutes)` DESC). `category` = nama kategori dari log downtime; tampilkan dengan satuan menit.

### 5.2. KPI Area — `GET /dashboards/area/:regionId/kpi` (permission `dashboard.area.view`)

Rollup **semua pabrik dalam satu region** (`src/lib/services/area-dashboard.service.ts`). Catatan khusus: `regionId` = `00000000-0000-0000-0000-000000000000` (zero UUID) berarti **GLOBAL** (semua pabrik) — jangan dipakai di UI mobile biasa.

`mode=day` (default) → `{ regionId, date, summary, plants }`:

**`summary`** (agregat seluruh region):
| Field | Makna |
|---|---|
| `totalPlants` | Jumlah pabrik dalam region |
| `activePlants` | Pabrik dengan ≥1 shift RUNNING |
| `totalShifts` | Total shift hari ini (semua pabrik) |
| `approvedShifts` | Shift APPROVED |
| `pendingApproval` | Shift **COMPLETED menunggu approve** (= `completedCount`) — untuk area read-only ini adalah angka yang dilaporkan ke koordinator, bukan aksi |
| `runningShifts` | Shift RUNNING |

**`plants[]`** — per pabrik `{ id, code, name }` +:
| Field | Makna |
|---|---|
| `shifts.total / approved / running` | Status shift pabrik itu hari ini |
| `waste` | Objek 4 kategori (MENIR/RIJEKAN/DEBU_KASAR/DEBU_HALUS), kg |
| `production.tsgKg` | TSG masuk (kg) |
| `production.outputKg` | Batangan jadi (kg) |
| `production.boxes` | Jumlah boks diproses |
| `production.yieldPct` | `outputKg / tsgKg × 100`; `null` kalau tidak ada data |
| `downtimeMinutes` | Total downtime (menit) hari ini |

`mode=week&weekStart=YYYY-MM-DD` → `getAreaKpiWeek`: loop 7 hari dari `weekStart` (waktu UTC+7), lalu:
- `summary` = **jumlah 7 hari** (bukan rata-rata) untuk totalShifts/approved/pending/running; `activePlants` dijumlahkan per hari.
- `plants[].production` = jumlah 7 hari; `yieldPct` dihitung ulang dari total (bukan rata-rata yield harian).
- `perDay.avgShiftsPerDay` = `totalShifts / activeDays` (hari yang punya shift); `perDay.activeDays` = jumlah hari dengan shift.
- `weekEnd` = tanggal hari ke-7.

### 5.3. KPI pabrik vs area di satu layar

PLANT_MANAGER hanya melihat KPI pabrik (`dashboard.plant.view`). AREA_COORDINATOR/QA melihat area (`dashboard.area.view`) dan bisa drill-down ke KPI pabrik mana pun di region-nya (`dashboard.plant.view` juga dimiliki keduanya). Jangan tampilkan tab yang permission-nya tidak dimiliki (cek via daftar permission user dari token/me).

---

## 6. Catatan Penting untuk Tim Mobile

1. **Aksi approval via mobile = wewenang yang sudah dimiliki role** (daftar lengkap di §3.2 dari `src/db/seed.ts`). UI hanya menampilkan aksi sesuai permission user (hide/disable); server tetap final gate (`FORBIDDEN` 403 kalau nekat).
2. **Shift APPROVED = LOCKED** — tampilkan badge; tidak ada tombol ubah/end di mobile. Perubahan hanya via CORRECTION (`HQ_AUDITOR`, web).
3. **Approve receiving** hanya untuk receiving `PENDING` (manual); receiving via SJ sudah APPROVED otomatis — jangan tampilkan tombol approve untuk SJ (akan gagal `RECEIVING_ALREADY_APPROVED`).
4. **Writeoff & transfer wajib alasan/konfirmasi**: `writeoffReason` wajib dikirim; transfer butuh daftar `inventoryBoxIds` (multi-select) + `destinationName`. Keduanya tercatat di audit log.
5. **Kalkulasi server-side**: yieldPct & semua agregat datang dari server. Client hanya render — jangan pernah menghitung ulang (operator tidak boleh bisa manipulasi via DevTools).
6. **Refresh**: data KPI berbasis tanggal server — tarik ulang saat app dibuka dan saat pull-to-refresh; jangan cache lintas hari tanpa re-fetch.
7. **Offline**: dashboard & stok bisa ditampilkan dari cache terakhir dengan indikator offline; aksi mutasi tetap lewat queue (`05-flow-offline-sync.md`) dengan Idempotency-Key.
