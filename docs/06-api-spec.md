# 06 · API Specification

Kontrak REST API `/api/v1/*` yang dikonsumsi Web (Next.js) dan Mobile (Flutter). Fase 1 lengkap; Fase 2–4 hanya outline.

**Base URL**: `https://mes.hummer.example/api/v1`
**Format**: JSON (request & response).
**Charset**: UTF-8.

---

## 1. Konvensi Umum

### 1.1. Versioning
Path prefix `/api/v1`. Breaking change → path `/api/v2` (paralel selama transisi). Non-breaking change (tambah field opsional) tetap di v1.

### 1.2. Authentication
Header `Authorization: Bearer <accessToken>` wajib untuk semua endpoint kecuali `/auth/login`.

### 1.3. Content-Type
Request body `application/json`. Server tolak content-type lain dengan 415.

### 1.4. Timezone
Semua timestamp ISO 8601 dengan offset. Contoh: `2026-08-10T16:30:12+07:00`. Server juga menerima UTC (`...Z`) dan mengonversi.

### 1.5. Error Format
Semua error response konsisten:
```json
{
  "error": {
    "code": "SHIFT_HAS_ACTIVE_BOX",
    "message": "Tidak bisa mengakhiri shift — masih ada 1 boks aktif.",
    "details": { "activeBoxIds": ["box_x9f"] }
  },
  "requestId": "req_2a7f9b"
}
```
Field `code` = enumeration stable (aman untuk error handling di klien). Field `message` = untuk display ke user (Bahasa Indonesia).

### 1.6. HTTP Status Convention
- `200 OK` — success dengan body.
- `201 Created` — resource baru dibuat.
- `204 No Content` — success tanpa body (mis. logout).
- `400 Bad Request` — validation error, business rule violation.
- `401 Unauthorized` — token invalid/expired.
- `403 Forbidden` — permission/scope denied.
- `404 Not Found` — resource tidak ada atau tidak visible (RLS filter).
- `409 Conflict` — state conflict (mis. approve shift yang belum COMPLETED).
- `429 Too Many Requests` — rate limit.
- `500 Internal Server Error` — bug server.

### 1.7. Pagination
Query params: `?limit=50&cursor=xyz`.
Response:
```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "abc",
    "hasMore": true
  }
}
```

### 1.8. Idempotency-Key
POST/PATCH wajib menyertakan header `Idempotency-Key`. Format bebas (UUID/ULID); recommended: `<operation-prefix>-<ulid>`. Server dedup 24 jam:
- Request pertama dengan key baru → proses normal, cache response.
- Request dengan key sama (dalam 24h) → balik cached response, status ditandai (`X-Idempotent-Replay: true`).

### 1.9. Rate Limiting
Header response:
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: 87`
- `X-RateLimit-Reset: 1723284000`

Default 100 req/menit per user. Endpoint intensif (mis. `/dashboards/*`) 30 req/menit.

### 1.10. Field Casing
Request & response menggunakan `camelCase`. Database internal `snake_case` — dikonversi oleh serializer.

---

## 2. Authentication Endpoints

### `POST /auth/login`
**Permission**: — (public).
**Body**:
```json
{
  "username": "andi.kecer",
  "password": "***",
  "otp": "123456",
  "deviceType": "MOBILE",
  "deviceId": "9f3a2b5c4d…",
  "deviceName": "Samsung SM-A125 · Alfi's phone"
}
```
Field:
- `otp` **wajib** untuk user dengan role SUPERADMIN (2FA). Untuk role lain, optional (dukungan opt-in di future).
- `deviceType` wajib: `"MOBILE"` atau `"WEB"`.
- `deviceId` + `deviceName` wajib kalau `deviceType = "MOBILE"` (untuk single-session enforcement).

**Response 409 SESSION_EXISTS** (khusus deviceType=MOBILE):
Kalau user sudah punya session aktif di device mobile lain (deviceId berbeda), sistem tolak:
```json
{
  "error": {
    "code": "SESSION_EXISTS",
    "message": "Akun Anda sedang aktif di device lain. Hubungi Super Admin untuk memutus sesi.",
    "details": {
      "activeSession": {
        "deviceName": "Samsung SM-A125 · Alfi's phone",
        "deviceId": "9f3a2b… (masked)",
        "lastActiveAt": "2026-08-10T14:32:11+07:00",
        "ipAddressMasked": "203.194.***.***",
        "loginAt": "2026-08-10T06:00:12+07:00"
      }
    }
  }
}
```
Kalau `deviceId` sama dengan session existing → sistem otomatis revoke sesi lama & buat sesi baru (case: app restart, re-install di device sama). Aturan single-session hanya untuk `deviceType = MOBILE`; web boleh concurrent (mis. tablet + PC office).
**Response 200**:
```json
{
  "accessToken": "eyJhbGciOi…",
  "refreshToken": "rft_9f3a2b…",
  "expiresIn": 900,
  "user": {
    "id": "usr_4c1b",
    "fullName": "Andi Kecer",
    "username": "andi.kecer"
  },
  "assignments": [
    {
      "scopeType": "PLANT",
      "scopeId": "PLT-MLG-01",
      "scopeName": "Pabrik Malang 1",
      "roleCode": "OPERATOR_KECER"
    }
  ],
  "activeScope": {
    "scopeType": "PLANT",
    "scopeId": "PLT-MLG-01"
  }
}
```
Untuk SUPERADMIN: `expiresIn: 300` (5 menit), refresh 7 hari; `activeScope.scopeType = "GLOBAL"`. Kalau `otp` salah atau tidak dikirim untuk SUPERADMIN → 401 `OTP_REQUIRED` atau `OTP_INVALID`.
Kalau user punya banyak assignment, `activeScope` diset ke default (pilihan terakhir, atau assignment pertama).

### `POST /auth/refresh`
**Body**:
```json
{ "refreshToken": "rft_9f3a2b…" }
```
**Response 200**: sama dengan login. Refresh token di-rotasi (yang lama di-invalidate).

### `POST /auth/switch-scope`
**Permission**: user harus punya assignment ke scope target.
**Body**:
```json
{
  "scopeType": "PLANT",
  "scopeId": "PLT-MLG-02"
}
```
**Response 200**: token baru dengan `activeScope` yang baru.

### `POST /auth/logout`
**Response 204**. Refresh token direvoke.

### `GET /auth/me`
**Response 200**: sama seperti login, tanpa token.

---

## 3. Master Data Endpoints (Fase 0)

Semua endpoint di grup ini butuh permission `masterdata.*` sesuai resource. Detail permission di [`05-rbac-matrix.md`](./05-rbac-matrix.md).

Pattern umum RESTful:
- `GET /<resource>` — list dengan pagination
- `GET /<resource>/:id` — detail
- `POST /<resource>` — create
- `PATCH /<resource>/:id` — update
- `DELETE /<resource>/:id` — soft delete (set `deletedAt`)

Resources:
- `/companies`, `/regions`, `/plants`
- `/users`, `/user-assignments`
- `/roles`, `/permissions`
- `/products`, `/plant-products`
- `/machines`, `/machine-templates`
- `/consumable-items`, `/spareparts`
- `/shift-roles`, `/shift-templates`
- `/downtime-categories`, `/reject-reasons`
- `/tsg-suppliers` (WMS Inbound master, Fase 0)

Sample:

### `POST /products`
**Permission**: `masterdata.product.edit`.
**Body**:
```json
{
  "code": "PRD-HMR-STD",
  "brand": "Hummer",
  "variant": "STD"
}
```
**Response 201**: created object.

### `POST /machine-templates`
**Permission**: `masterdata.machine-template.edit`.
**Body**:
```json
{
  "productId": "prd_hmr_std",
  "machineType": "MAKER",
  "yieldMinPct": 110.00,
  "yieldMaxPct": 114.00,
  "targetBeratPerBatangGram": 1.020
}
```
**Response 201**. Server otomatis flip `is_current=false` di template lama untuk kombinasi (productId, machineType) yang sama.

### `POST /user-assignments`
**Permission**: `user.assign_scope`.
**Body**:
```json
{
  "userId": "usr_andi",
  "scopeType": "PLANT",
  "scopeId": "PLT-MLG-01",
  "roleCode": "OPERATOR_KECER"
}
```

### `DELETE /user-assignments/:id`
**Permission**: `user.revoke_scope`. Soft delete (set `revokedAt`).

---

## 4. Operational Endpoints (Fase 1)

Grup ini menangani siklus shift end-to-end.

### 4.1. Shift Lifecycle

### `POST /shifts/start`
**Permission**: `shift.start`.
**Body**:
```json
{
  "machineId": "mch_mkr01",
  "productId": "prd_hmr_std",
  "shiftTemplateId": "tpl_mlg_malam",
  "members": [
    { "userId": "usr_alfi",   "shiftRoleId": "role_ketua" },
    { "userId": "usr_ahmadi", "shiftRoleId": "role_operator" },
    { "userId": "usr_didik",  "shiftRoleId": "role_operator" },
    { "userId": "usr_zaini",  "shiftRoleId": "role_pembantu" }
  ]
}
```
Server otomatis cek `shift_handoff` unclaimed untuk `machineId` — kalau ada, di-claim.

**Response 201**:
```json
{
  "shiftId": "shf_2b9f1a",
  "status": "RUNNING",
  "reportDate": "2026-08-10",
  "actualStart": "2026-08-10T16:30:12+07:00",
  "product": { "id": "prd_hmr_std", "brand": "Hummer", "yieldRange": "110-114%" },
  "template": { "code": "shift_malam", "start": "16:30", "durationMinutes": 780 },
  "members": [ /* ...4 items dengan roleCode dan name */ ],
  "claimedHandoff": {
    "handoffId": "hof_prev_1a",
    "sisaTsgKg": 7.20,
    "batanganSementaraKg": 6.10,
    "note": "Carry-over dari shift PAGI — boks 1 akan partial"
  }
}
```

### `PATCH /shifts/:id/members`
**Permission**: `shift.member.assign`. Add/remove/update role member selama shift RUNNING.
**Body**:
```json
{
  "add":    [{ "userId": "usr_new",  "shiftRoleId": "role_operator" }],
  "remove": ["usr_zaini"],
  "updateLeave": [{ "userId": "usr_ahmadi", "leaveMinutes": 60, "note": "Izin pengajian 18:30-19:30" }]
}
```

### `POST /shifts/:id/end`
**Permission**: `shift.end`.
**Body**:
```json
{
  "waste": [
    { "category": "MENIR",      "kg": 0.85,  "settlementStatus": "LUNAS" },
    { "category": "RIJEKAN",    "kg": 10.30, "settlementStatus": "LUNAS" },
    { "category": "DEBU_KASAR", "kg": 10.80, "settlementStatus": "PENDING" },
    { "category": "DEBU_HALUS", "kg": 36.55, "settlementStatus": "PENDING" }
  ],
  "notes": "Debu halus naik 12% dari rerata"
}
```
Server validasi:
- 4 kategori waste lengkap.
- Tidak ada boks aktif (`completedAt IS NULL`), atau `handoff` sudah dibuat.

**Response 200**:
```json
{
  "shiftId": "shf_2b9f1a",
  "status": "COMPLETED",
  "actualEnd": "2026-08-11T05:30:33+07:00"
}
```
**Response 409**:
```json
{ "error": { "code": "SHIFT_HAS_ACTIVE_BOX", "message": "…", "details": { "activeBoxIds": ["box_x"] } } }
```

### `POST /shifts/:id/handoff`
**Permission**: `shift.handoff.create`.
**Body**:
```json
{
  "sisaTsgKg": 15.95,
  "batanganSementaraKg": 14.20,
  "note": "Boks 27 sisa sekitar 50%"
}
```
**Response 201**:
```json
{
  "handoffId": "hof_1a2b",
  "weighedAt": "2026-08-11T05:28:10+07:00",
  "sisaTsgKg": 15.95,
  "batanganSementaraKg": 14.20,
  "claimedByShiftId": null
}
```

### `POST /shifts/:id/approve`
**Permission**: `shift.approve`. Actor **tidak boleh** sama dengan `createdBy` (409).
**Body**:
```json
{ "reviewNotes": "Fine dust perlu ditindaklanjuti" }
```
**Response 200**:
```json
{
  "shiftId": "shf_2b9f1a",
  "status": "APPROVED",
  "lockedAt": "2026-08-11T06:05:12+07:00",
  "approvedBy": "usr_supervisor_a",
  "rollupRefreshed": true
}
```

### `POST /shifts/:id/reopen`
**Permission**: `shift.reopen`. Hanya boleh saat status `COMPLETED` (pre-approval).
**Body**: `{ "reason": "Salah input waste" }`

### `POST /shifts/:id/correct`
**Permission**: `shift.correct`. Hanya `HQ_AUDITOR` untuk shift `APPROVED`.
**Body**:
```json
{
  "correctionFields": [
    { "path": "waste.MENIR.kg", "newValue": 1.20, "reason": "Salah timbang, revisi berdasarkan re-weigh gudang" }
  ]
}
```
Server membuat record `shift_correction` (link ke shift asli), **tidak** UPDATE shift asli. Audit log lengkap.

### `GET /shifts/:id`
**Permission**: `shift.view`. Detail lengkap: report, members, waste, boxes, downtime, maintenance, handoff.

### `GET /shifts?plantId=…&status=…&from=…&to=…&cursor=…`
**Permission**: `shift.view`. List dengan filter.

### 4.2. TSG Box

### `POST /shifts/:id/boxes`
**Permission**: `shift.box.open`.
**Body**:
```json
{
  "inventoryBoxId": "inv_x9f2a"
}
```
Field `inventoryBoxId` **wajib** — merujuk ke `tsg_inventory.id` dengan status `AVAILABLE`. Server:
1. Cek inventory `AVAILABLE` di plant sesuai scope. Kalau tidak → 400 `TSG_BOX_NOT_AVAILABLE`.
2. Auto-fill `boxCode` & `tsgWeightKg` dari inventory record.
3. Update `tsg_inventory.status = 'USED'`, set `usedAt`.
4. Assign `boxNumber` otomatis (max+1 per shift).
5. Kalau shift baru di-claim handoff dan ini boks pertama → `isPartial=true` dan `handoffId` dilink (dalam kasus ini `inventoryBoxId` optional — boks parsial tidak dari inventory).

**Response 201**:
```json
{
  "boxId": "box_a1c",
  "boxNumber": 1,
  "boxCode": "TSG-20260808-042",
  "tsgWeightKg": 29.70,
  "isPartial": false,
  "handoffId": null,
  "inventoryBoxId": "inv_x9f2a",
  "openedAt": "2026-08-10T16:35:00+07:00"
}
```

**Response 400** (kalau boks tidak available):
```json
{ "error": { "code": "TSG_BOX_NOT_AVAILABLE", "message": "Boks tidak tersedia di inventory. Cek FIFO list.", "details": { "inventoryBoxId": "inv_x9f2a", "currentStatus": "USED" } } }
```

### `PATCH /boxes/:id`
**Permission**: `shift.box.weigh`. Timbang hasil boks.
**Body**:
```json
{
  "outputWeightKg": 16.85
}
```
Server hitung `yieldPct` dari MachineTemplate produk shift.

**Response 200**:
```json
{
  "boxId": "box_a1c",
  "outputWeightKg": 16.85,
  "yieldPct": 110.86,
  "indicator": "NORMAL",
  "yieldRange": "110-114%",
  "completedAt": "2026-08-10T17:12:44+07:00"
}
```
Kalau yield keluar range, `indicator: "WARNING"` dan response menyertakan pertanyaan wajib alasan.

### 4.3. Event Log (Consumables, Downtime, Maintenance)

### `POST /boxes/:id/consumption`
**Permission**: `shift.consumption.log`.
```json
{
  "consumableItemId": "item_bobbin_hmr",
  "quantity": 1,
  "note": "Roll 3 habis"
}
```

### `POST /shifts/:id/downtime`
**Permission**: `shift.downtime.log`.
```json
{
  "category": "GANTI_MATERIAL",
  "durationMinutes": 8,
  "linkedBoxId": "box_a1c",
  "description": "Ganti bobin roll 3"
}
```

### `POST /shifts/:id/maintenance`
**Permission**: `shift.maintenance.log`.
```json
{
  "sparepartId": "sp_pisau_filter",
  "quantity": 1,
  "linkedBoxId": "box_a1c",
  "note": "Preventive"
}
```

### 4.4. HLP Pack

### `POST /hlp/pack`
**Permission**: `hlp.pack`.
```json
{
  "batchId": "btc_mkr01_20260810_03",
  "hlpMachineId": "mch_hlp01",
  "packsLolos": 820,
  "isiPerPack": 20,
  "rejectBatangan": 147
}
```
Server hitung: `totalBatang = 820*20 + 147 = 16547`. `beratPerBatangGram` dihitung dari agregat batangan Maker yang mengirim batch.

**Response 201** dengan hasil kalkulasi.

### 4.5. Waste Settlement (setelah shift COMPLETED)

### `PATCH /shifts/:id/waste/:category/settle`
**Permission**: `shift.waste.settle`.
```json
{ "settledAt": "2026-08-11T07:00:00+07:00" }
```
Update `settlementStatus` dari `PENDING` → `LUNAS`, catat `settledBy` dari session.

---

## 4A. WMS Inbound Endpoints (Fase 1)

### `POST /tsg-receiving`
**Permission**: `tsg.receiving.create`.
**Body**:
```json
{
  "supplierId": "sup_jawa_01",
  "supplierDocRef": "SJ-SUP-2026-081",
  "receivedAt": "2026-08-10T05:12:00+07:00",
  "boxes": [
    { "boxCode": "TSG-20260810-001", "weightKg": 29.75 },
    { "boxCode": "TSG-20260810-002", "weightKg": 29.80 },
    { "boxCode": "TSG-20260810-003", "weightKg": 30.10 }
  ]
}
```
**Response 201**:
```json
{
  "receivingId": "rcv_1a2b",
  "receivingCode": "RCV-MLG-20260810-01",
  "totalBoxCount": 3,
  "totalWeightKg": 89.65,
  "inventoryCreated": 3
}
```
Server otomatis buat `tsg_inventory` untuk setiap boks dengan status `AVAILABLE`.

### `GET /tsg-receiving?plantId=…&from=…&to=…`
**Permission**: `tsg.receiving.view`.

### `GET /tsg-inventory/available?plantId=…&limit=20`
**Permission**: `tsg.inventory.view`. Return boks status `AVAILABLE` sorted `createdAt ASC` (FIFO).
**Response 200**:
```json
{
  "data": [
    { "inventoryId": "inv_x", "boxCode": "TSG-20260808-042", "weightKg": 29.70, "ageInDays": 2, "locationCode": "RAK-A-01" },
    { "inventoryId": "inv_y", "boxCode": "TSG-20260809-011", "weightKg": 30.05, "ageInDays": 1, "locationCode": "RAK-A-02" }
  ]
}
```

### `PATCH /tsg-inventory/:id/writeoff`
**Permission**: `tsg.inventory.writeoff`.
**Body**:
```json
{ "writeoffReason": "Boks basah karena kebocoran atap" }
```

---

## 4B. WMS Outbound Endpoints (Fase 5)

### `POST /finished-goods/:shiftId/confirm`
**Permission**: `finishedgoods.receive`. Untuk shift status APPROVED — sistem sudah auto-create `finished_goods_receiving` dengan `packsExpectedCount`.
**Body**:
```json
{ "packsActualCount": 820 }
```
**Response 200**: kalau match → `status: "CONFIRMED"`. Kalau beda → `status: "DISPUTED"` dan trigger correction task.

### `POST /finished-goods/:shiftId/dispute`
**Permission**: `finishedgoods.dispute`.
**Body**:
```json
{ "packsActualCount": 815, "disputeNotes": "Kurang 5 pack, kemungkinan kerusakan saat transit" }
```

### `POST /cartons`
**Permission**: `cartoning.create`.
**Body**:
```json
{ "productId": "prd_hmr_std", "capacityPack": 50 }
```
**Response 201**: `{ cartonId, code: "CTN-MLG-20260810-001", status: "OPEN" }`.

### `POST /cartons/:id/add-pack`
**Permission**: `cartoning.add_pack`.
**Body**:
```json
{ "hlpPackId": "pack_shf_2b9f1a_042" }
```
Validasi: pack punya produk sama dengan carton; belum di-carton lain (unique).

### `POST /cartons/:id/close`
**Permission**: `cartoning.close`. Tutup karton (OPEN → READY). Validasi: `actualPackCount > 0`.

### `GET /cartons/:code/lineage`
**Permission**: `cartoning.view`. Return traceability lengkap:
```json
{
  "cartonCode": "CTN-MLG-20260810-001",
  "actualPackCount": 48,
  "contents": [
    {
      "hlpPackId": "pack_shf_2b9f1a_042",
      "batchId": "btc_MKR01_20260810_03",
      "machineCode": "MKR-01",
      "shiftReportId": "shf_2b9f1a",
      "reportDate": "2026-08-10",
      "productCode": "PRD-HMR-STD"
    }
  ]
}
```

---

## 4C. Dispatch Endpoints (Fase 6)

### `POST /dispatch/orders`
**Permission**: `dispatch.order.create`.
**Body**:
```json
{
  "customerName": "Distributor Jaya Abadi",
  "customerAddress": "Jl. Merdeka 45, Surabaya",
  "customerContact": "081234567890",
  "driverName": "Pak Karto",
  "vehicleNo": "N 1234 XY",
  "cartonIds": ["car_a1", "car_b2", "car_c3"]
}
```
**Response 201**:
```json
{
  "orderId": "do_1a2b",
  "orderCode": "DO-MLG-20260810-001",
  "status": "DRAFT",
  "cartonCount": 3
}
```

### `POST /dispatch/orders/:id/dispatch`
**Permission**: `dispatch.order.dispatch`. Konfirmasi dispatch (DRAFT → DISPATCHED). Semua karton status → `DISPATCHED`.

### `POST /dispatch/orders/:id/documents/:docType`
**Permission**: `dispatch.document.generate`. Generate PDF surat jalan.
**Response 200**:
```json
{
  "docId": "doc_xxx",
  "docNumber": "SJ-MLG-20260810-001",
  "pdfUrl": "https://blob.example/sj-mlg-20260810-001.pdf",
  "generatedAt": "2026-08-10T15:30:00+07:00"
}
```

### `GET /dispatch/orders?plantId=…&status=…`
**Permission**: `dispatch.order.view`.

---

## 5. Dashboard & Report (Fase 1–2)

### `GET /dashboards/plant/:plantId/kpi?date=YYYY-MM-DD`
**Permission**: `dashboard.plant.view`.
**Response 200**:
```json
{
  "plantId": "PLT-MLG-01",
  "date": "2026-08-10",
  "shifts": {
    "total": 2,
    "byStatus": { "APPROVED": 1, "COMPLETED": 1 }
  },
  "production": {
    "tsgTotalKg": 1420.5,
    "batanganTotalKg": 1580.2,
    "yieldPct": 111.24
  },
  "waste": {
    "MENIR": 1.85,
    "RIJEKAN": 22.10,
    "DEBU_KASAR": 25.60,
    "DEBU_HALUS": 68.30
  },
  "topDowntime": [
    { "category": "GANTI_MATERIAL", "totalMinutes": 45 }
  ]
}
```

### `GET /dashboards/area/:regionId/kpi?date=YYYY-MM-DD` — Fase 2

### `GET /dashboards/hq/kpi?from=…&to=…&groupBy=product|plant|month` — Fase 4

### `POST /reports/cukai?from=…&to=…&format=csv|xlsx` — Fase 4
Async: response 202 dengan `jobId`. Poll `GET /reports/:jobId` sampai `status=ready`, lalu download dari `downloadUrl`.

---

## 6. QR Endpoints (Fase 3)

### `POST /qr/resolve`
**Permission**: authenticated user. Server verifikasi scope.
**Body**:
```json
{ "uri": "ohmes://machine/PLT-MLG-01/MKR-01" }
```
**Response 200**: tergantung type. Contoh untuk `machine`:
```json
{
  "type": "machine",
  "machine": {
    "id": "mch_mkr01",
    "code": "MKR-01",
    "type": "MAKER",
    "plantId": "PLT-MLG-01"
  },
  "nextAction": "START_SHIFT",
  "canAccess": true
}
```

### `POST /qr/generate`
**Permission**: `masterdata.machine.edit` (static QR) atau khusus per type.
**Body**:
```json
{
  "type": "MACHINE",
  "entityId": "mch_mkr01"
}
```
**Response 201**: `{ qrId, uri, hmac?, generatedAt }`.

### `POST /qr/scan-log` — audit scan (Flutter kirim setelah scan sukses).

---

## 7. Audit Endpoints

### `GET /audit-logs?entityTable=…&entityId=…&from=…&to=…`
**Permission**: `audit.read`. List audit log dengan filter (scoped).

### `GET /audit-logs/user/:userId?from=…&to=…`
**Permission**: `audit.read`. Aktivitas user (scoped).

## 7A. SUPERADMIN Endpoints (Fase 0)

Semua endpoint di grup ini butuh role `SUPERADMIN` dan **bypass RLS** aktif. Semua respons di-audit dengan `is_privileged=true` + broadcast notification ke SUPERADMIN lain.

### `GET /super/audit?from=…&to=…&entityTable=…&companyId=…`
**Permission**: `super.audit.read_all`. Baca audit log **lintas company** (bukan hanya scope).

### `GET /super/security-log?type=…&from=…&to=…`
**Permission**: `super.audit.security`. Types: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `OTP_FAILED`, `PERMISSION_DENIED`, `SESSION_REVOKED`, `IP_SUSPICIOUS`, `PRIVILEGED_ACTION`.
**Response 200**:
```json
{
  "data": [
    { "type": "LOGIN_FAILED", "username": "andi.kecer", "ipAddress": "1.2.3.4", "userAgent": "…", "occurredAt": "2026-08-10T14:00:00+07:00", "reason": "Password salah 3× berturut" },
    { "type": "PRIVILEGED_ACTION", "actorUserId": "usr_super_1", "action": "super.impersonate", "targetUserId": "usr_supervisor_a", "occurredAt": "2026-08-10T14:15:12+07:00" }
  ]
}
```

### `POST /super/impersonate`
**Permission**: `super.impersonate`.
**Body**: `{ "userId": "usr_supervisor_a", "reason": "Reproduce bug shift approval" }`
**Response 200**: JWT baru dengan claim `impersonatorId` = SUPERADMIN asli. Semua aksi selanjutnya di audit membawa dua field: `actorUserId` (target) + `impersonatorId`.

### `POST /super/users/:id/force-logout`
**Permission**: `super.force_logout`. Revoke semua refresh token user.

### `POST /super/users/:id/reset-password`
**Permission**: `super.reset_password`.
**Body**: `{ "newPassword": "***", "requireChangeOnNextLogin": true }`
Response: 204. Password lama di-invalidate, semua session di-revoke, user diminta ganti password di login berikutnya.

### `POST /super/superadmin/assign`
**Permission**: `super.superadmin.assign`.
**Body**: `{ "userId": "usr_it_lead_2", "reason": "Suksesi backup" }`
Server cek: `COUNT(role=SUPERADMIN AND active) < 3`. Kalau ≥ 3 → 400 `SUPERADMIN_LIMIT_REACHED`.

### `GET /super/users/:userId/sessions`
**Permission**: `super.session.view`. Lihat semua session aktif user (mobile + web).
**Response 200**:
```json
{
  "data": [
    {
      "sessionId": "sess_1a",
      "deviceType": "MOBILE",
      "deviceName": "Samsung SM-A125 · Alfi's phone",
      "deviceId": "9f3a2b… (masked)",
      "ipAddress": "203.194.12.55",
      "userAgent": "MesHummer/1.2.0 (Android 12; SM-A125)",
      "loginAt": "2026-08-10T06:00:12+07:00",
      "lastActiveAt": "2026-08-10T14:32:11+07:00",
      "expiresAt": "2026-09-09T06:00:12+07:00",
      "status": "ACTIVE"
    }
  ]
}
```

### `POST /super/sessions/:sessionId/revoke`
**Permission**: `super.session.revoke`. Revoke satu sesi spesifik (mobile atau web).
**Body**:
```json
{ "reason": "User request pindah HP baru" }
```
**Response 204**. Session status → `REVOKED`, refresh token invalid. `revokedBy` + `revokedReason` tercatat + audit log privileged.

### `POST /super/users/:userId/sessions/mobile/revoke`
**Permission**: `super.session.revoke`. Convenience: revoke **semua** session mobile aktif user.
**Body**: `{ "reason": "Suspected credential compromise" }`
**Response 200**: `{ "revokedCount": 1 }`.

### `GET /auth/me/sessions`
**Permission**: authenticated user. Lihat sesi milik sendiri saja (mobile + web). User bisa logout dari sesi saat ini via `/auth/logout` — **tidak bisa** revoke sesi mobile lain (harus SUPERADMIN).

### `POST /super/database/migrate`
**Permission**: `super.database.migrate`. Trigger migration Drizzle (default via CLI). Untuk emergency saja.

### `GET /super/privileged-feed`
Tidak perlu permission khusus tapi hanya visible untuk SUPERADMIN. Return feed live privileged actions dari SUPERADMIN lain (self-policing UI).

---

## 8. Common Response Fields

Semua response dengan resource utama menyertakan meta:
```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_2a7f9b",
    "timestamp": "2026-08-10T16:30:12+07:00",
    "activeScope": { "scopeType": "PLANT", "scopeId": "PLT-MLG-01" }
  }
}
```

`requestId` juga di-log server-side untuk correlation troubleshoot.

---

## 9. WebSocket / Server-Sent Events (Fase 2+)

Real-time update untuk dashboard supervisor & area:
- `SSE /events/shifts/plant/:plantId` — status shift changes (RUNNING → COMPLETED → APPROVED).
- Payload event: `{ shiftId, oldStatus, newStatus, timestamp }`.

Fase 1 tidak butuh SSE; dashboard poll `GET /shifts` tiap 30 detik.

---

## 10. Referensi
- [`04-data-model.md`](./04-data-model.md) — skema entitas yang di-return API.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) — matriks permission per endpoint.
- [`07-qr-strategy.md`](./07-qr-strategy.md) — detail QR lifecycle.
- [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) — business rules yang di-enforce endpoint.
