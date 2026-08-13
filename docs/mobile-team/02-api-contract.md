# 02 · API Contract (Mobile-Relevant Endpoints)

Kontrak REST API `/api/v1/*` untuk aplikasi mobile Flutter. Endpoint yang tidak relevan mobile (dashboard, master data admin, dispatch, dsb) sengaja tidak disertakan.

**Base URL**: (staging/prod URL akan diberikan PM)
**Format**: JSON UTF-8
**Auth**: JWT + refresh token

---

## 1. Konvensi Umum

### 1.1. Versioning
Path prefix `/api/v1`. Breaking change → `/api/v2` (paralel selama transisi).

### 1.2. Authentication
Header `Authorization: Bearer <accessToken>` wajib kecuali `/auth/login`.

### 1.3. Content-Type
Request `application/json`. Server tolak content-type lain dengan 415.

### 1.4. Timezone
Timestamp ISO 8601 dengan offset. Contoh: `2026-08-10T16:30:12+07:00`.

### 1.5. Error Format
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

### 1.6. HTTP Status Convention
- `200 OK` — success dengan body.
- `201 Created` — resource baru dibuat.
- `204 No Content` — success tanpa body.
- `400 Bad Request` — validation error, business rule violation.
- `401 Unauthorized` — token invalid/expired.
- `403 Forbidden` — permission/scope denied.
- `404 Not Found` — resource tidak ada atau tidak visible (RLS filter).
- `409 Conflict` — state conflict (mis. SESSION_EXISTS, SHIFT_HAS_ACTIVE_BOX).
- `429 Too Many Requests` — rate limit.

### 1.7. Idempotency-Key
POST/PATCH wajib menyertakan header `Idempotency-Key`. Format bebas (UUID/ULID); recommended: `<operation-prefix>-<ulid>`. Server dedup 24 jam.

### 1.8. Rate Limiting
Header response:
- `X-RateLimit-Limit: 100`
- `X-RateLimit-Remaining: 87`
Default 100 req/menit per user.

### 1.9. Field Casing
`camelCase` di request & response.

### 1.10. Client Version
Header `X-Client-Version: 1.2.0` wajib. Kalau < min supported → 426 UPGRADE_REQUIRED.

---

## 2. Authentication Endpoints

### `POST /auth/login`
**Permission**: — (public).
**Body**:
```json
{
  "username": "kecer",
  "password": "***",
  "otp": "123456",
  "deviceType": "MOBILE",
  "deviceId": "9f3a2b5c4d…",
  "deviceName": "Samsung SM-A125 · Alfi's phone"
}
```
Field:
- `otp` **wajib** untuk user dengan role SUPERADMIN (2FA).
- `deviceType`, `deviceId`, `deviceName` wajib untuk mobile (single-session enforcement).

**Response 200**:
```json
{
  "accessToken": "eyJhbGciOi…",
  "refreshToken": "rft_9f3a2b…",
  "expiresIn": 900,
  "user": {
    "id": "usr_4c1b",
    "fullName": "Andi Kecer",
    "username": "kecer"
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
Untuk SUPERADMIN: `expiresIn: 300` (5 menit), refresh 7 hari.

**Response 409 SESSION_EXISTS** (khusus deviceType=MOBILE):
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
Kalau `deviceId` sama dengan session existing → sistem otomatis revoke sesi lama & buat sesi baru (case: app restart / re-install di device sama). Single-session hanya berlaku untuk `deviceType='MOBILE'` — web boleh concurrent.

**Response 401 OTP**:
- `OTP_REQUIRED` — SUPERADMIN login tanpa `otp` field.
- `OTP_INVALID` — OTP salah atau expired (5 menit).

### `POST /auth/refresh`
**Body**:
```json
{ "refreshToken": "rft_9f3a2b…" }
```
**Response 200**: sama dengan login. Refresh token di-rotate (yang lama invalidated).

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
**Response 204**. Refresh token direvoke. User bisa langsung login lagi (single-session cleared).

### `GET /auth/me`
**Response 200**: sama seperti login, tanpa token.

### `GET /auth/me/sessions`
**Permission**: authenticated user. Lihat sesi milik sendiri (mobile + web).
**Response 200**:
```json
{
  "data": [
    {
      "sessionId": "sess_1a",
      "deviceType": "MOBILE",
      "deviceName": "Samsung SM-A125 · Alfi's phone",
      "isCurrent": true,
      "loginAt": "2026-08-10T06:00:12+07:00",
      "lastActiveAt": "2026-08-10T14:32:11+07:00",
      "status": "ACTIVE"
    }
  ]
}
```
User **tidak bisa revoke device lain** — itu harus SUPERADMIN. User hanya bisa logout dari device saat ini via `/auth/logout`.

---

## 3. Master Data (Read-Only untuk Mobile)

Mobile app konsumsi master data untuk populate picker/dropdown. Semua read-only.

### `GET /machines?plantId=…`
**Permission**: authenticated. List mesin di plant scope.

### `GET /products?plantId=…`
**Permission**: authenticated. List produk yang boleh diproduksi di plant.

### `GET /shift-templates?plantId=…`
**Permission**: authenticated. List template shift (Siang, Malam, dsb).

### `GET /shift-roles?plantId=…`
**Permission**: authenticated. List role tim shift.

### `GET /consumable-items?productId=…`
**Permission**: authenticated. List consumable per produk (Bobin, Filter, Tipping).

### `GET /spareparts`
**Permission**: authenticated. List sparepart (Nylon, Pisau Filter, dsb).

### `GET /downtime-categories`
**Permission**: authenticated. Enum kategori downtime.

### `GET /users?plantId=…&role=…`
**Permission**: `shift.member.assign`. Untuk picker anggota tim saat start shift.

---

## 4. Operational Endpoints (Fase 1)

### 4.1. Shift Lifecycle

#### `POST /shifts/start`
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

#### `PATCH /shifts/:id/members`
**Permission**: `shift.member.assign`. Add/remove/update role member selama shift RUNNING.
**Body**:
```json
{
  "add":    [{ "userId": "usr_new",  "shiftRoleId": "role_operator" }],
  "remove": ["usr_zaini"],
  "updateLeave": [{ "userId": "usr_ahmadi", "leaveMinutes": 60, "note": "Izin pengajian 18:30-19:30" }]
}
```

#### `POST /shifts/:id/end`
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

#### `POST /shifts/:id/handoff`
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

#### `GET /shifts/:id`
**Permission**: `shift.view`. Detail lengkap: report, members, waste, boxes, downtime, maintenance, handoff.

#### `GET /shifts?plantId=…&status=…&from=…&to=…&cursor=…`
**Permission**: `shift.view`. List dengan filter.

### 4.2. TSG Box

#### `POST /shifts/:id/boxes`
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
5. Kalau shift baru di-claim handoff dan ini boks pertama → `isPartial=true` dan `handoffId` dilink (dalam kasus ini `inventoryBoxId` optional).

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

#### `PATCH /boxes/:id`
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

#### `POST /boxes/:id/consumption`
**Permission**: `shift.consumption.log`.
```json
{
  "consumableItemId": "item_bobbin_hmr",
  "quantity": 1,
  "note": "Roll 3 habis"
}
```

#### `POST /shifts/:id/downtime`
**Permission**: `shift.downtime.log`.
```json
{
  "category": "GANTI_MATERIAL",
  "durationMinutes": 8,
  "linkedBoxId": "box_a1c",
  "description": "Ganti bobin roll 3"
}
```

#### `POST /shifts/:id/maintenance`
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

#### `POST /hlp/pack`
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

---

## 4A. WMS Inbound Endpoints (Untuk User Gudang Inbound)

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

## 6. QR Endpoints

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

Contoh untuk `tsg_box`:
```json
{
  "type": "tsg_box",
  "box": {
    "code": "TSG-240810-001",
    "tsgWeightKg": 15.20,
    "receivedAt": "2026-08-10T05:12:00+07:00",
    "inventoryBoxId": "inv_x9f2a"
  },
  "hmacValid": true,
  "nextAction": "OPEN_BOX"
}
```

Kalau `canAccess=false` (scan QR dari plant lain) → 403 `SCOPE_DENIED`.
Kalau HMAC salah → 400 `QR_INVALID`.

### `POST /qr/scan-log`
**Permission**: authenticated. Log setiap scan (untuk audit).
**Body**:
```json
{
  "uri": "ohmes://tsg/PLT-MLG-01/TSG-240810-001?w=15.20&h=8a7f2e",
  "success": true,
  "scannedAt": "2026-08-10T16:32:14+07:00"
}
```

---

## 8. Common Response Fields

Semua response utama menyertakan meta:
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

---

## 9. Endpoint yang TIDAK Dipakai Mobile (info konteks)

Endpoint berikut ada di backend tapi **bukan urusan mobile**:
- `/api/v1/shifts/:id/approve`, `/reopen`, `/correct` — supervisor/HQ Auditor via web.
- `/api/v1/dashboards/*` — dashboard supervisor/area/HQ via web.
- `/api/v1/reports/*` — export cukai via web HQ.
- `/api/v1/finished-goods/*`, `/cartons/*` — Gudang Outbound Fase 5 (bukan mobile awal).
- `/api/v1/dispatch/*` — Ekspedisi Fase 6.
- `/api/v1/super/*` (kecuali `/auth/me/sessions`) — SUPERADMIN privileged endpoints, ada web dashboard khusus.
- `/api/v1/audit-logs/*` — audit web view.
- Endpoint CRUD master data — hanya HQ_ADMIN via web (mobile hanya GET/read).

Kalau mobile butuh salah satu di atas → discuss dengan PM dulu.

---

## 10. Referensi (dalam paket ini)

- [`01-app-spec.md`](./01-app-spec.md) — auth flow, single-session, offline handling.
- [`03-qr-strategy.md`](./03-qr-strategy.md) — QR lifecycle & format URI.
- [`04-glossary.md`](./04-glossary.md) — istilah domain.
- [`05-rbac-mobile.md`](./05-rbac-mobile.md) — permission per role untuk endpoint di atas.
