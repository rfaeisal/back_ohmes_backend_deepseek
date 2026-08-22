# Kontrak API Mobile (Rebuild v2) — Sumber Kebenaran: Kode Backend

> **Sumber kebenaran: kode backend branch `main` (2026-08-22)** — `src/app/api/v1/**/route.ts` + zod schema + service layer.
> Kalau ada beda dengan backend, **IKUTI backend** — bukan dokumen ini, bukan `docs/mobile-team/02-api-contract.md` (v1.3.0, banyak yang sudah usang/salah).
>
> Dokumen ini mencakup **45 endpoint** untuk rebuild aplikasi Flutter dari nol.

---

## Konvensi Umum

### Base URL
- **Produksi**: `https://ohmes.fzdev.my.id`
- Semua path endpoint ditulis relatif: `/api/v1/...`

### Authorization
- Header `Authorization: Bearer <accessToken>` wajib di semua endpoint kecuali `POST /auth/login` dan `POST /auth/refresh`.
- Semua route dibungkus `withAuth` atau `extractToken` (`src/lib/auth/middleware.ts`). Konsekuensi otomatis:

| Kode | Status | Kondisi |
|---|---|---|
| `UNAUTHORIZED` | 401 | Header `Authorization` tidak ada / bukan `Bearer ` |
| `TOKEN_EXPIRED` | 401 | JWT tidak valid / kedaluwarsa |
| `TOKEN_REVOKED` | 401 | Sesi di-revoke (force-logout) — access token langsung mati, tidak menunggu TTL |
| `FORBIDDEN` | 403 | User tidak punya permission yang diminta (message: `Permission '<x>' diperlukan.`) |
| `INTERNAL_ERROR` | 500 | Error tak terduga |

- SUPERADMIN (`isPrivileged=true`) lolos semua permission check.
- Sesi mobile: **1 user = 1 sesi MOBILE aktif** (single-session enforcement saat login, error `SESSION_EXISTS` 409).

### Error Envelope
Semua error memakai bentuk:
```json
{ "error": { "code": "CODE", "message": "...", "details": { } }, "requestId": "req_xxxx" }
```
- `details` hanya muncul kalau route menyertakannya (zod `flatten()` atau konteks ServiceError).
- **`requestId` TIDAK selalu ada** — beberapa error response mengembalikan tanpa `requestId` (dicatat per route di bawah). RequestId diambil dari header `X-Request-Id` kalau dikirim client, else digenerate `req_<8 char>`.
- Semua response (sukses maupun error) yang lewat `withAuth` diberi **response header `X-Request-Id`** — app mobile bisa pakai untuk tracing.

### Success Envelope
- **TIDAK ada unified success envelope.** GET list umumnya `{ "data": [...] }`; create/action umumnya return objek langsung. Bentuk aktual dicatat per endpoint.

### Header versi client
- **TIDAK ada** header `X-Client-Version`.
- **TIDAK ada** response `426 UPGRADE_REQUIRED`. (Doc lama v1.3.0 menulis ini — salah.)

### Idempotency
- Implementasi aktual: **hanya `POST /mobile/sync`** yang memakai idempotency store (per-item, key di dalam body item — bukan header).
- Route lain **tidak memproses** header `Idempotency-Key` (meskipun CLAUDE.md mewajibkan, kode belum mengimplementasikannya).
- Window dedup: 24 jam per `(userId, key)`.

### Konvensi payload
- `camelCase` di JSON request/response.
- Field opsional ditandai `?` di contoh payload.
- `plantId` pada umumnya **diambil dari scope JWT** (`ctx.user.plantIds[0]`) — client tidak boleh mengirim untuk filter; kalau dikirim tetap dipakai (mis. `GET /tsg-inventory/available?plantId=`), tapi scope server adalah final gate.

---

## Koreksi Kontrak Lama (v1.3.0 — `docs/mobile-team/02-api-contract.md`)

Daftar hal yang DULU ditulis salah/usang di doc lama:

- **`POST /shifts/:id/end` → aktual `PATCH /shifts/[id]/end`** (route `shifts/[id]/end/route.ts`). Permission `shift.end`. Body: `waste` **wajib tepat 4 kategori** (MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS, masing-masing dengan `kg` + `settlementStatus`) + `consumptions?` + `notes?`.
- **Master data GET = auth-only, tanpa query param**: `GET /machines`, `/products`, `/shift-templates`, `/shift-roles`, `/consumable-items`, `/spareparts`, `/tsg-suppliers`, `/users` semuanya tanpa query param dan tanpa `requiredPermission` (cukup login). Doc lama menulis `GET /users?plantId=…&role=…` dengan permission `shift.member.assign` — salah; aktual `GET /users` auth-only, limit 100.
- **QR type di response = uppercase enum**: `"TSG_BOX"` (bukan `"tsg_box"`), nilai: `MACHINE | TSG_BOX | BATCH | PACK`. Response resolve aktual `{type, entity, plantId, canAccess, nextAction}` — **bukan** `{type, box: {...}, hmacValid, ...}`. Dan `canAccess:false` dikembalikan **status 200**, BUKAN 403.
- **`GET /auth/me/sessions` TIDAK ADA** di kode. Lihat sesi user ada di `GET /super/users/[id]/sessions` (web SUPERADMIN). `GET /auth/me` hanya mengembalikan user + scope.
- **`GET /downtime-categories` TIDAK ADA.** Kategori downtime tidak punya endpoint list; nilai enum ada di zod route `shifts/[id]/downtime`.
- **`GET /shifts` pakai `limit` bukan `cursor`** — query param aktual: `plantId?`, `status?`, `from?`, `to?`, `limit?` (default 50, max 200; param `from`/`to` **diterima tapi diabaikan** di service). Response `{data, pagination: {hasMore}}` — `hasMore` = `data.length === limit` (limit-based, bukan cursor).
- **`GET /auth/me` TIDAK return token** — response aktual: `{user, activeScope, isPrivileged, plantIds}`. Doc lama menulis "sama seperti login, tanpa token" — salah.
- **Idempotency hanya di mobile/sync** (per-item di body). Header `Idempotency-Key` tidak diproses route lain; tidak ada middleware global idempotency di kode.
- **TIDAK ada `X-Client-Version` / 426** (lihat Konvensi Umum).
- **Error `requestId` tidak konsisten** — beberapa response error tanpa `requestId` (mis. `PATCH /auth/change-password` untuk USER_NOT_FOUND/INVALID_PASSWORD, `GET /supplier-sj/[id]` 404, `GET /supplier-sj/labels/[boxCode]` 404).
- **`POST /auth/login` response flat** — `{accessToken, refreshToken, expiresIn, user, roles, assignments, activeScope}` (bukan nested `data`). `roles` TIDAK ada di response refresh/switch-scope.
- **QR URI = `ohmes://{type}/{plantCode}/{entityCode}`** dengan type lowercase di URI (`ohmes://tsg_box/...`), QR dinamis (TSG_BOX/BATCH/PACK) wajib query `?h=<hmac>`.

---

## 1. Auth (6 endpoint)

### `POST /api/v1/auth/login`
**Permission**: public (tanpa token) · **DeviceType**: MOBILE/WEB

Payload:
```json
{
  "username": "operator1",
  "password": "rahasia123",
  "deviceType": "MOBILE",
  "otp": "123456",
  "deviceId": "android-imei-...",
  "deviceName": "Samsung A15 · Alfi"
}
```
- `deviceType`: `"MOBILE" | "WEB"` — wajib.
- `otp`: opsional; **wajib** untuk SUPERADMIN (2FA). Bypass: env `OTP_BYPASS_CODE`, atau `"000000"` saat `NEXT_PUBLIC_APP_ENV=development`.
- `deviceId` / `deviceName`: opsional, disimpan ke `user_session`.

Response 200 (flat):
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "rt_...",
  "expiresIn": 900,
  "user": { "id": "uuid", "fullName": "Alfi", "username": "operator1", "isPrivileged": false },
  "roles": [ { "code": "OPERATOR_KECER", "isPrivileged": false } ],
  "assignments": [
    { "scopeType": "PLANT", "scopeId": "uuid", "scopeName": "", "roleCode": "OPERATOR_KECER" }
  ],
  "activeScope": { "scopeType": "PLANT", "scopeId": "uuid" }
}
```
- `expiresIn` = detik TTL access token: default 900 (15 menit), SUPERADMIN 300 (5 menit).
- `assignments[].scopeName` selalu `""` (belum di-resolve di kode).
- `activeScope` = assignment pertama user (atau scope yang terakhir dipakai via refresh).

Error:
- `400 VALIDATION_ERROR` (dengan `details`)
- `401 INVALID_CREDENTIALS` (username tidak ditemukan ATAU password salah)
- `401 OTP_REQUIRED` (SUPERADMIN tanpa `otp`)
- `401 OTP_INVALID` (OTP salah)
- `403 NO_ASSIGNMENT` (user belum punya role/assignment)
- `409 SESSION_EXISTS` (single-session mobile — sesi MOBILE lain masih aktif; `details.activeSession` berisi info sesi aktif) — **khusus untuk login deviceType MOBILE**
- `500 INTERNAL_ERROR`

### `POST /api/v1/auth/refresh`
**Permission**: public (tanpa token) · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "refreshToken": "rt_..." }
```

Response 200 — token di-rotate, refresh token lama invalid:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "rt_baru...",
  "expiresIn": 900,
  "user": { "id": "uuid", "fullName": "", "username": "" },
  "assignments": [ { "scopeType": "PLANT", "scopeId": "uuid", "scopeName": "", "roleCode": "..." } ],
  "activeScope": { "scopeType": "PLANT", "scopeId": "uuid" }
}
```
- Catatan: `user.fullName` dan `user.username` selalu **string kosong** di response ini (belum di-fetch). `roles` TIDAK ada di response ini.

Error:
- `400 VALIDATION_ERROR` ("Refresh token tidak valid.")
- `401 REFRESH_TOKEN_INVALID` (token invalid/expired → harus login ulang)
- `500 INTERNAL_ERROR`

### `GET /api/v1/auth/me`
**Permission**: auth-only (tanpa requiredPermission) · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{
  "user": { "id": "uuid", "fullName": "Alfi", "username": "operator1", "email": "alfi@hummer.co.id" },
  "activeScope": { "scopeType": "PLANT", "scopeId": "uuid" },
  "isPrivileged": false,
  "plantIds": ["uuid-plant"]
}
```

Error: `401 UNAUTHORIZED` · `404 USER_NOT_FOUND` · `500 INTERNAL_ERROR`

### `POST /api/v1/auth/logout`
**Permission**: auth-only (token opsional — logout tidak pernah gagal) · **DeviceType**: MOBILE/WEB — tanpa body

Response 200:
```json
{ "message": "Logout berhasil." }
```
- Response header tambahan: `Clear-Site-Data: "cookies", "storage"`.
- Semua sesi user di-revoke. Jika token invalid/tidak ada pun tetap return 200 (logout never fails).

Error: tidak ada (selalu 200).

### `POST /api/v1/auth/switch-scope`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "scopeType": "PLANT", "scopeId": "uuid" }
```
- `scopeType`: `"COMPANY" | "REGION" | "PLANT"`.
- Jika scope tidak ada di assignment user, server **silent fallback** ke assignment pertama (bukan error).

Response 200:
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900,
  "activeScope": { "scopeType": "PLANT", "scopeId": "uuid" },
  "assignments": [ { "scopeType": "PLANT", "scopeId": "uuid", "scopeName": "", "roleCode": "PLANT_MANAGER" } ],
  "plantIds": ["uuid-plant"]
}
```
- Refresh token TIDAK di-rotate di endpoint ini — simpan access token baru saja.

Error: `400 VALIDATION_ERROR` · `401 UNAUTHORIZED` · `500 INTERNAL_ERROR`

### `PATCH /api/v1/auth/change-password`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "oldPassword": "lama123", "newPassword": "baru45678" }
```
- `newPassword`: min 8 karakter.

Response 200:
```json
{ "success": true }
```

Error:
- `400 VALIDATION_ERROR` (dengan `requestId`)
- `404 USER_NOT_FOUND` (tanpa `requestId`)
- `400 INVALID_PASSWORD` ("Password lama salah." — tanpa `requestId`)
- `400 CHANGE_FAILED` (error internal update, tanpa `requestId`)

---

## 2. Master Data Read (8 endpoint)

Semua GET di seksi ini: **auth-only, tanpa query param, tanpa requiredPermission**. Kalau doc lama menulis query param / permission khusus → salah, ikuti yang ini.

### `GET /api/v1/machines`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "plantId": "uuid", "code": "MKR-01", "name": "Maker #1", "type": "MAKER" } ] }
```
- Semua kolom tabel `machine` (select penuh), max **50** baris. `type`: `MAKER | HLP`.

Error: standar auth (401/500). `403` tidak dipakai di GET ini.

### `GET /api/v1/products`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "code": "HMR-MEN-01", "brand": "Hummer", "variant": "Menthol" } ] }
```
- Semua kolom tabel `product`, max **100** baris.

Error: standar auth.

### `GET /api/v1/shift-templates`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "plantId": "uuid", "code": "PAGI", "name": "Shift Pagi", "startTime": "06:00", "durationMinutes": 480, "isActive": true, "displayOrder": 0 } ] }
```
- Semua kolom tabel `shiftTemplate`, max **50** baris.

Error: standar auth.

### `GET /api/v1/shift-roles`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "code": "KECER", "name": "Kecermasan", "description": null } ] }
```
- Semua kolom tabel `shiftRole`, max **50** baris.

Error: standar auth.

### `GET /api/v1/consumable-items`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "code": "ROLL-01", "name": "Kertas Rol", "unit": "roll", "productId": null, "allowAtEndShift": false } ] }
```
- Diurutkan `code` ASC. Hanya field di atas yang di-select.

Error: standar auth.

### `GET /api/v1/spareparts`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "code": "NYLON", "name": "Nylon", "unit": "unit" } ] }
```
- Diurutkan `code` ASC.

Error: standar auth.

### `GET /api/v1/tsg-suppliers`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "code": "SUP-01", "name": "PT Kertas Jaya", "contactPerson": null, "contactPhone": null, "address": null, "isActive": true } ] }
```
- Semua kolom tabel `tsgSupplier`, diurutkan `name` ASC, max **100** baris.

Error: standar auth.

### `GET /api/v1/users`
**Permission**: auth-only · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{ "data": [ { "id": "uuid", "username": "operator1", "fullName": "Alfi", "email": null, "isActive": true, "createdAt": "2026-08-01T06:00:00.000Z" } ] }
```
- Hanya field di atas (tanpa `passwordHash`), diurutkan `createdAt` ASC, max **100** baris. Untuk picker anggota tim.

Error: standar auth.

---

## 3. Supplier SJ (11 endpoint)

### `POST /api/v1/supplier-sj`
**Permission**: `supplier.sj.create` · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "sjNumber": "SJ-001", "supplierId": "uuid", "plantId": "uuid" }
```
- `sjNumber`: 1–50 karakter. `plantId` = pabrik tujuan, **harus dalam scope user** (client kirim, server validasi).

Response 201:
```json
{ "sjId": "uuid", "sjNumber": "SJ-001", "status": "DRAFT", "poolAvailable": 12 }
```
- `poolAvailable` = sisa label pool AVAILABLE milik petugas ini (untuk UI guidance).

Error:
- `400 VALIDATION_ERROR`
- `403 PLANT_OUT_OF_SCOPE` ("Pabrik tujuan di luar scope anda.")
- `409` code ServiceError: `SUPPLIER_NOT_FOUND`, `SJ_NUMBER_EXISTS` ("Nomor surat jalan sudah terdaftar untuk supplier ini.")
- `500 INTERNAL_ERROR`

### `GET /api/v1/supplier-sj`
**Permission**: `supplier.sj.view` · **DeviceType**: MOBILE/WEB

Query param: `status` (opsional: `DRAFT | SHIPPED | RECEIVED`) — tanpa query param = semua status.

Response 200:
```json
{
  "data": [
    {
      "id": "uuid", "sjNumber": "SJ-001", "supplierId": "uuid", "supplierName": "PT Kertas Jaya",
      "plantId": "uuid", "plantCode": "PLT-KDR-01", "status": "DRAFT",
      "shippedAt": null, "receivedAt": null, "note": null, "createdAt": "2026-08-22T03:00:00.000Z"
    }
  ]
}
```
- Max **100** baris, diurutkan `createdAt` DESC.

Error: standar auth + permission.

### `GET /api/v1/supplier-sj/options`
**Permission**: `supplier.sj.create` · **DeviceType**: MOBILE/WEB — tanpa query param

Response 200:
```json
{
  "data": {
    "suppliers": [ { "id": "uuid", "code": "SUP-01", "name": "PT Kertas Jaya" } ],
    "plants": [ { "id": "uuid", "code": "PLT-KDR-01", "name": "Pabrik Kediri" } ]
  }
}
```
- `suppliers`: hanya yang `isActive=true` dan belum soft-deleted.
- `plants`: hanya plant dalam scope user (dari JWT `plantIds`).

Error: standar auth + permission.

### `GET /api/v1/supplier-sj/[id]`
**Permission**: `supplier.sj.view` · **DeviceType**: MOBILE/WEB

Response 200:
```json
{
  "id": "uuid", "sjNumber": "SJ-001", "supplierId": "uuid", "supplierName": "PT Kertas Jaya",
  "plantId": "uuid", "plantCode": "PLT-KDR-01", "status": "SHIPPED",
  "shippedAt": "2026-08-22T05:00:00.000Z", "receivedAt": null, "note": null,
  "createdAt": "2026-08-22T03:00:00.000Z",
  "boxes": [
    { "id": "uuid", "boxCode": "TSG-20260822-001", "tsgType": "REGULER", "labelStatus": "ASSIGNED",
      "supplierWeightKg": 15.2, "enteredAt": "2026-08-22T04:10:00.000Z" }
  ]
}
```
- `boxes` diurutkan tidak deterministik (tanpa orderBy).

Error:
- `404 SJ_NOT_FOUND` ("Surat jalan tidak ditemukan." — **tanpa `requestId`**)
- `400` (jika ServiceError lain, tanpa `requestId`)

### `PATCH /api/v1/supplier-sj/[id]`
**Permission**: `supplier.sj.create` · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "status": "SHIPPED" }
```
- Satu-satunya transisi yang didukung: `DRAFT → SHIPPED` (truk berangkat). Semua boks wajib sudah tertimbang.

Response 200:
```json
{ "sjId": "uuid", "status": "SHIPPED", "boxCount": 8 }
```

Error:
- `400 VALIDATION_ERROR` (dengan `details`)
- `400 INVALID_STATUS` ("Status tidak didukung.")
- `409` code ServiceError: `SJ_NOT_FOUND`, `SJ_NOT_DRAFT`, `SJ_EMPTY` ("Surat jalan belum punya boks."), `SJ_HAS_UNWEIGHED_BOXES` (detail jumlah label belum ditimbang)
- `500 INTERNAL_ERROR`

### `GET /api/v1/supplier-sj/pool`
**Permission**: `supplier.sj.pool` · **DeviceType**: WEB (area office) — tanpa query param

Response 200:
```json
{
  "data": {
    "available": 42, "assigned": 120, "voided": 3,
    "byPrintDate": [ { "date": "2026-08-22", "available": 20 }, { "date": "2026-08-21", "available": 22 } ]
  }
}
```
- `byPrintDate` diurutkan tanggal DESC.

Error: standar auth + permission.

### `POST /api/v1/supplier-sj/pool`
**Permission**: `supplier.sj.pool` · **DeviceType**: WEB (area office)

Payload:
```json
{ "count": 50 }
```
- `count`: integer 1–500.

Response 201:
```json
{ "boxCodes": ["TSG-20260822-042", "TSG-20260822-043"], "available": 92 }
```
- Format kode: `TSG-<YYYYMMDD>-<NNN>` (global sequence per hari, lintas petugas).

Error:
- `400 VALIDATION_ERROR`
- `409 POOL_COUNT_INVALID` ("Jumlah label harus 1–500.")

### `POST /api/v1/supplier-sj/pool/pdf`
**Permission**: `supplier.sj.pool` · **DeviceType**: WEB (area office)

Payload:
```json
{ "boxCodes": ["TSG-20260822-042", "TSG-20260822-043"] }
```
- 1–500 kode, masing-masing 1–50 karakter.

Response 200: **binary PDF** (bukan JSON)
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="pool-label-20260822.pdf"`
- `Cache-Control: no-store`
- Layout: 1 label = 1 halaman 100×75mm.

Error: `400 VALIDATION_ERROR`

### `GET /api/v1/supplier-sj/labels/[boxCode]`
**Permission**: `supplier.sj.view` · **DeviceType**: MOBILE (scan petugas area)

Response 200:
```json
{
  "boxCode": "TSG-20260822-001", "labelStatus": "ASSIGNED", "tsgType": "REGULER",
  "supplierWeightKg": 15.2, "enteredAt": "2026-08-22T04:10:00.000Z",
  "sjId": "uuid", "sjNumber": "SJ-001", "sjStatus": "SHIPPED",
  "supplierName": "PT Kertas Jaya", "plantCode": "PLT-KDR-01"
}
```
- Label pool (`labelStatus: "AVAILABLE"`) milik petugas lain diperlakukan sebagai tidak ada → `404 LABEL_NOT_FOUND` (kecuali SUPERADMIN `isPrivileged`).
- `tsgType` bisa `null` untuk label pool yang belum di-assign.

Error: `404 LABEL_NOT_FOUND` ("Label tidak ditemukan." — **tanpa `requestId`**)

### `POST /api/v1/supplier-sj/labels/[boxCode]/void`
**Permission**: `supplier.sj.label` · **DeviceType**: MOBILE/WEB — tanpa body

Response 200:
```json
{ "boxCode": "TSG-20260822-005", "labelStatus": "VOID" }
```

Error:
- `409 LABEL_NOT_FOUND` (termasuk label pool milik petugas lain, kecuali SUPERADMIN)
- `409 LABEL_NOT_AVAILABLE` ("Label ... tidak bisa di-VOID (status: ...).")
- `500 INTERNAL_ERROR`

### `POST /api/v1/supplier-sj/[id]/boxes/weigh`
**Permission**: `supplier.sj.label` · **DeviceType**: MOBILE (scan + timbang di gudang supplier)

Payload:
```json
{ "boxCode": "TSG-20260822-042", "tsgType": "REGULER", "supplierWeightKg": 15.2 }
```
- `tsgType`: `REGULER | MILD | PUTIHAN` — opsional di schema, **wajib saat label pool di-assign** (error `INVALID_TSG_TYPE` kalau kosong).
- `supplierWeightKg`: `> 0` dan `<= 100`.

Response 200:
```json
{ "boxId": "uuid", "boxCode": "TSG-20260822-042", "tsgType": "REGULER",
  "labelStatus": "ASSIGNED", "supplierWeightKg": 15.2, "enteredAt": "2026-08-22T04:10:00.000Z" }
```
- `labelStatus` tetap `ASSIGNED` untuk penimbangan ulang label yang sudah terikat SJ.

Error:
- `400 VALIDATION_ERROR`
- `409` code ServiceError: `SJ_NOT_FOUND`, `SJ_NOT_DRAFT`, `INVALID_BOX_WEIGHT`, `LABEL_NOT_FOUND`, `LABEL_VOIDED`, `LABEL_ALREADY_ASSIGNED` ("sudah terikat surat jalan lain"), `LABEL_ALREADY_WEIGHED` ("sudah ditimbang"), `INVALID_TSG_TYPE`
- `500 INTERNAL_ERROR`

---

## 4. Receiving & Inventory (7 endpoint)

### `GET /api/v1/tsg-receiving`
**Permission**: `tsg.receiving.view` · **DeviceType**: MOBILE/WEB

Query param:
- `from` (opsional, tanggal ISO `YYYY-MM-DD`) — filter `receivedAt >= from`
- `to` (opsional, tanggal ISO `YYYY-MM-DD`) — filter `receivedAt <= to 23:59:59`
- `includeBoxes` (`"true"` untuk menyertakan detail boks)
- `plantId` **tidak bisa** dipilih — selalu dari scope (`plantIds[0]`)

Response 200:
```json
{
  "data": [
    {
      "id": "uuid", "receivingCode": "RCV-20260822-01", "supplierId": "uuid",
      "receivedAt": "2026-08-22T05:30:00.000Z", "receivedBy": "uuid",
      "totalBoxCount": 8, "totalWeightKg": "121.6", "supplierDocRef": null,
      "source": "MANUAL", "approvalStatus": "PENDING", "notes": null,
      "supplierName": "PT Kertas Jaya", "supplierCode": "SUP-01",
      "boxes": [ { "id": "uuid", "boxCode": "TSG-20260822-001", "weightKg": "15.2", "tsgType": "REGULER", "boxSeq": 1 } ]
    }
  ]
}
```
- Max **200** baris, diurutkan `receivedAt` DESC. `boxes` hanya ada saat `includeBoxes=true`, diurutkan `boxSeq`.
- `totalWeightKg` / `weightKg` adalah string (kolom decimal/numeric).

Error: standar auth + permission.

### `POST /api/v1/tsg-receiving`
**Permission**: `tsg.receiving.create` · **DeviceType**: MOBILE/WEB

Payload:
```json
{
  "supplierId": "uuid",
  "supplierDocRef": "DOC-001",
  "receivedAt": "2026-08-22T05:30:00.000Z",
  "locationCode": "GUDANG-1",
  "boxes": [
    { "boxCode": "TSG-20260822-090", "weightKg": 15.2, "tsgType": "REGULER" }
  ],
  "notes": "Terima manual tanpa SJ"
}
```
- `receivedAt?` (datetime ISO) — default sekarang.
- `boxes`: min 1; `weightKg` antara 0.01–100; `tsgType?` default `"REGULER"`.
- `plantId` diambil dari scope user.

Response 201:
```json
{
  "receivingId": "uuid", "receivingCode": "RCV-20260822-02",
  "totalBoxCount": 8, "totalWeightKg": 121.6,
  "inventoryCreated": 0, "approvalStatus": "PENDING"
}
```
- `inventoryCreated: 0` — inventory dibuat saat approve (`POST /tsg-receiving/[id]/approve`).

Error:
- `400 VALIDATION_ERROR`
- `403 NO_PLANT_SCOPE` ("Tidak ada plant dalam scope.")
- `400` code ServiceError: `SUPPLIER_NOT_FOUND`, `SUPPLIER_INACTIVE`, `INVALID_BOX_WEIGHT`
- `500 INTERNAL_ERROR`

### `POST /api/v1/tsg-receiving/from-sj`
**Permission**: `tsg.receiving.create` · **DeviceType**: MOBILE (verifikasi di pabrik)

Payload:
```json
{ "supplierSjId": "uuid", "verifiedBoxCodes": ["TSG-20260822-042", "TSG-20260822-043"] }
```
- `verifiedBoxCodes?`: 1–500 kode label yang discan saat validasi jumlah. Default (kosong) = semua boks SJ.

Response 201:
```json
{
  "receivingId": "uuid", "receivingCode": "RCV-20260822-03",
  "totalBoxCount": 8, "totalWeightKg": 121.6,
  "inventoryCreated": 8, "sjStatus": "RECEIVED"
}
```
- Server langsung: membuat `tsg_receiving` (`source: "SJ"`, `approvalStatus: "APPROVED"`), membuat inventory AVAILABLE per boks, dan mengubah SJ jadi `RECEIVED`.

Error:
- `400 VALIDATION_ERROR`
- `403 NO_PLANT_SCOPE`
- `409` code ServiceError: `SJ_NOT_FOUND`, `SJ_WRONG_PLANT` ("ditujukan ke pabrik lain"), `SJ_NOT_SHIPPED`, `SJ_EMPTY`, `SJ_COUNT_MISMATCH` (jumlah label tidak sesuai SJ; `details` berisi `missingBoxCodes` / `unknownBoxCodes`)
- `500 INTERNAL_ERROR`

### `POST /api/v1/tsg-receiving/[id]/approve`
**Permission**: `tsg.receiving.approve` · **DeviceType**: MOBILE/WEB — tanpa body

Response 200:
```json
{ "receivingId": "uuid", "approvalStatus": "APPROVED", "inventoryCreated": 8 }
```

Error:
- `403 NO_PLANT_SCOPE`
- `409` code ServiceError: `RECEIVING_NOT_FOUND`, `RECEIVING_WRONG_PLANT`, `RECEIVING_ALREADY_APPROVED`
- `500 INTERNAL_ERROR`

### `GET /api/v1/tsg-inventory/available`
**Permission**: `tsg.inventory.view` · **DeviceType**: MOBILE/WEB

Query param:
- `plantId` (opsional — default scope `plantIds[0]`)
- `limit` (opsional — default 20)

Response 200 — **FIFO** (tertua di atas):
```json
{
  "data": [
    {
      "inventoryId": "uuid", "boxCode": "TSG-20260822-042", "weightKg": "15.2",
      "tsgType": "REGULER", "locationCode": null, "createdAt": "2026-08-22T06:00:00.000Z",
      "ageInDays": 0
    }
  ]
}
```
- Hanya `status = AVAILABLE`. `ageInDays` dihitung server (hari sejak masuk inventory).

Error: `403 NO_PLANT_SCOPE` · standar auth + permission.

### `PATCH /api/v1/tsg-inventory/[id]/writeoff`
**Permission**: `tsg.inventory.writeoff` · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "writeoffReason": "Boks basah terkena air" }
```

Response 200:
```json
{ "inventoryId": "uuid", "status": "WRITTEN_OFF" }
```

Error:
- `400 VALIDATION_ERROR`
- `409 INVENTORY_NOT_FOUND` · `409 INVENTORY_NOT_AVAILABLE` ("Hanya boks status AVAILABLE yang bisa di-writeoff.", dengan `details.currentStatus`)
- `500 INTERNAL_ERROR`

### `POST /api/v1/tsg-transfers`
**Permission**: `tsg.inventory.transfer` · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "destinationName": "Pabrik Jakarta", "inventoryBoxIds": ["uuid", "uuid"], "notes": "opsional" }
```
- `inventoryBoxIds`: min 1 id inventory AVAILABLE.

Response 201:
```json
{ "transferId": "uuid", "transferCode": "TRF-20260822-01", "totalBoxCount": 2, "totalWeightKg": 30.4 }
```
- Boks berubah status `AVAILABLE → TRANSFERRED`.

Error:
- `400 VALIDATION_ERROR`
- `403 NO_PLANT_SCOPE`
- `400` code ServiceError: `EMPTY_BOXES`, `INVENTORY_NOT_FOUND`, `INVENTORY_NOT_AVAILABLE` (dengan `details` per boks)
- `500 INTERNAL_ERROR`

> Juga ada `GET /api/v1/tsg-transfers` (permission `tsg.inventory.view`, tanpa query param, plant dari scope) → `{ "data": [ { id, transferCode, destinationName, totalBoxCount, totalWeightKg, notes, sentAt, sentByName, items: [{id, boxCode, weightKg}] } ] }` — max 50, `sentAt` DESC.

### `POST /api/v1/tsg-returns`
**Permission**: `tsg.inventory.transfer` · **DeviceType**: MOBILE/WEB

Payload:
```json
{ "supplierId": "uuid", "inventoryBoxIds": ["uuid"], "reason": "Kualitas TSG tidak sesuai", "notes": "opsional" }
```
- `reason`: min 3 karakter.

Response 201:
```json
{ "returnId": "uuid", "returnCode": "RTR-20260822-01", "totalBoxCount": 1, "totalWeightKg": 15.2 }
```
- Boks berubah status `AVAILABLE → RETURNED`.

Error:
- `400 VALIDATION_ERROR`
- `403 NO_PLANT_SCOPE`
- `400` code ServiceError: `EMPTY_BOXES`, `REASON_REQUIRED`, `SUPPLIER_NOT_FOUND`, `INVENTORY_NOT_FOUND`, `INVENTORY_NOT_AVAILABLE`
- `500 INTERNAL_ERROR`

> Juga ada `GET /api/v1/tsg-returns` (permission `tsg.inventory.view`, tanpa query param, plant dari scope) → `{ "data": [ { id, returnCode, supplierName, supplierCode, totalBoxCount, totalWeightKg, reason, notes, returnedAt, returnedByName, items: [{id, boxCode, weightKg}] } ] }` — max 50, `returnedAt` DESC.

---

## 5. Monitoring & Shift (9 endpoint)

### `GET /api/v1/dashboards/plant/[plantId]/kpi`
**Permission**: `dashboard.plant.view` · **DeviceType**: WEB/MOBILE — tanpa query param (selalu "hari ini" server)

Response 200:
```json
{
  "plantId": "uuid",
  "date": "2026-08-22",
  "shifts": { "total": 2, "byStatus": { "RUNNING": 1, "COMPLETED": 1, "APPROVED": 0 } },
  "production": { "tsgTotalKg": 121.6, "batanganTotalKg": 98.5, "yieldPct": 81.0, "boxes": 8 },
  "waste": { "MENIR": 0, "RIJEKAN": 10.3, "DEBU_KASAR": 0, "DEBU_HALUS": 0 },
  "topDowntime": [ { "category": "MAKAN_ISTIRAHAT", "totalMinutes": 30 } ]
}
```
- `yieldPct` = output/tsg × 100 (dibulatkan 2 desimal).
- `topDowntime`: max 5 kategori, urut total menit DESC.

Error: standar auth + permission.

### `GET /api/v1/dashboards/area/[regionId]/kpi`
**Permission**: `dashboard.area.view` · **DeviceType**: WEB/MOBILE

Query param:
- `date` (opsional, `YYYY-MM-DD`) — default hari ini server
- `mode` (opsional, `day | week`) — default `day`
- `weekStart` (opsional, `YYYY-MM-DD`) — dipakai saat `mode=week` (Minggu = hari pertama, waktu +07:00)

Response 200 (mode `day`):
```json
{
  "regionId": "uuid",
  "date": "2026-08-22",
  "summary": { "totalPlants": 3, "activePlants": 1, "totalShifts": 4, "approvedShifts": 2, "pendingApproval": 1, "runningShifts": 1 },
  "plants": [
    {
      "id": "uuid", "code": "PLT-KDR-01", "name": "Pabrik Kediri",
      "shifts": { "total": 2, "approved": 1, "running": 1 },
      "waste": { "MENIR": 0, "RIJEKAN": 10.3, "DEBU_KASAR": 0, "DEBU_HALUS": 0 },
      "production": { "tsgKg": 121.6, "outputKg": 98.5, "boxes": 8, "yieldPct": 81.0 },
      "downtimeMinutes": 30
    }
  ]
}
```
- `yieldPct` bisa `null` (tidak ada produksi).
- **GLOBAL scope**: `regionId = 00000000-0000-0000-0000-000000000000` (atau kosong) → rollup semua pabrik tanpa filter region.
- Jika tidak ada plant di region: `{ "regionId": "...", "date": "...", "plants": [], "summary": null }`.

Response 200 (mode `week`):
```json
{
  "regionId": "uuid",
  "weekStart": "2026-08-16",
  "weekEnd": "2026-08-22",
  "summary": { "totalPlants": 3, "activePlants": 5, "totalShifts": 20, "approvedShifts": 12, "pendingApproval": 5, "runningShifts": 3 },
  "perDay": { "avgShiftsPerDay": 4.0, "activeDays": 5 },
  "plants": [ { "id": "uuid", "code": "PLT-KDR-01", "name": "Pabrik Kediri",
      "shifts": { "total": 10, "approved": 6, "running": 0 },
      "waste": { "MENIR": 0, "RIJEKAN": 50.1, "DEBU_KASAR": 0, "DEBU_HALUS": 0 },
      "production": { "tsgKg": 600.0, "outputKg": 480.0, "boxes": 40, "yieldPct": 80.0 },
      "downtimeMinutes": 150 } ]
}
```
- `weekEnd` = tanggal hari ke-7 (kode memakai `daily[6]?.date`).

Error: standar auth + permission.

### `GET /api/v1/shifts`
**Permission**: `shift.view` · **DeviceType**: MOBILE/WEB

Query param:
- `plantId` (opsional)
- `status` (opsional: `RUNNING | COMPLETED | APPROVED`)
- `from` / `to` (opsional — **diterima tapi DIABAIKAN** di service; jangan diandalkan)
- `limit` (opsional, default 50, **max 200**) — **bukan cursor**

Response 200:
```json
{
  "data": [
    {
      "id": "uuid", "plantId": "uuid", "machineId": "uuid", "productId": "uuid",
      "shiftTemplateId": "uuid", "reportDate": "2026-08-22",
      "actualStart": "2026-08-22T06:00:00.000Z", "actualEnd": null,
      "status": "RUNNING", "createdBy": "uuid", "approvedBy": null,
      "approvedAt": null, "reviewNotes": null, "notes": null,
      "boxesCount": 4, "yieldPct": 81.0
    }
  ],
  "pagination": { "hasMore": false }
}
```
- `boxesCount` (int) dan `yieldPct` (bisa `null`) dihitung server per shift.
- `pagination.hasMore` = `data.length === limit` — **limit-based, bukan cursor**. Untuk halaman berikutnya naikkan `limit` (atau filter status/tanggal).
- Urutan: `reportDate` DESC, `actualStart` DESC.

Error: standar auth + permission.

### `GET /api/v1/shifts/[id]`
**Permission**: `shift.view` · **DeviceType**: MOBILE/WEB

Response 200 — detail lengkap:
```json
{
  "id": "uuid", "plantId": "uuid", "machineId": "uuid", "productId": "uuid",
  "shiftTemplateId": "uuid", "reportDate": "2026-08-22",
  "actualStart": "2026-08-22T06:00:00.000Z", "actualEnd": null,
  "status": "COMPLETED", "createdBy": "uuid", "approvedBy": null,
  "approvedAt": null, "reviewNotes": null, "notes": null,
  "machineCode": "MKR-01", "shiftTemplateName": "Shift Pagi",
  "productName": "Hummer HMR-MEN-01",
  "members": [ { "id": "uuid", "userId": "uuid", "shiftRoleId": "uuid", "leaveMinutes": 0, "note": null, "userName": "Alfi", "roleName": "Kecermasan" } ],
  "wastes": [ { "id": "uuid", "shiftReportId": "uuid", "category": "RIJEKAN", "kg": "10.3", "settlementStatus": "LUNAS" } ],
  "boxes": [ { "id": "uuid", "shiftReportId": "uuid", "boxNumber": 1, "tsgWeightKg": "15.2", "outputWeightKg": "12.3" } ],
  "handoffs": [],
  "consumptions": [ { "id": "uuid", "boxId": "uuid", "consumableItemId": "uuid", "quantity": "0.5", "note": null, "itemName": "Kertas Rol" } ],
  "shiftConsumptions": [ { "id": "uuid", "consumableItemId": "uuid", "quantity": "2", "note": null, "itemName": "Karton", "isShiftLevel": true } ],
  "downtimes": [ { "id": "uuid", "shiftReportId": "uuid", "category": "MAKAN_ISTIRAHAT", "durationMinutes": 30 } ],
  "maintenances": [ { "id": "uuid", "sparepartId": "uuid", "quantity": 1, "note": null, "itemName": "Nylon" } ],
  "yieldPct": 81.0
}
```
- `productName` = `"{brand} {code}"` atau `null`.
- `boxes` diurutkan `boxNumber` ASC; `wastes` / `downtimes` / `handoffs` tanpa urutan tertentu.
- Tipe angka yang bersumber kolom numeric bisa string (mis. `kg`), konsisten dengan Drizzle/Postgres.

Error: `404 SHIFT_NOT_FOUND` (dengan `requestId`) · standar auth + permission.

### `POST /api/v1/shifts/[id]/approve`
**Permission**: `shift.approve` · **DeviceType**: WEB (supervisor) — bisa juga mobile supervisor

Payload:
```json
{ "reviewNotes": "Semua oke" }
```
- Body boleh `{}` (`reviewNotes` opsional).

Response 200:
```json
{ "shiftId": "uuid", "status": "APPROVED", "approvedAt": "2026-08-22T08:00:00.000Z", "approvedBy": "uuid" }
```
- Side effect: `autoCreateFinishedGoods(shiftId)` — ekspektasi receiving pack HLP (idempotent; aman approve ulang setelah reopen).

Error:
- `400 VALIDATION_ERROR`
- `409` code ServiceError: `SHIFT_NOT_FOUND`, `SHIFT_NOT_COMPLETED` ("Hanya shift COMPLETED yang bisa di-approve."), `SELF_APPROVAL` ("Tidak bisa approve shift sendiri. Harus supervisor lain.")
- `500 INTERNAL_ERROR`

### `POST /api/v1/shifts/[id]/reopen`
**Permission**: `shift.reopen` · **DeviceType**: WEB (supervisor) — pre-approval only

Payload:
```json
{ "reason": "Pencatatan ulang produksi" }
```

Response 200:
```json
{ "shiftId": "uuid", "status": "RUNNING" }
```

Error:
- `400 VALIDATION_ERROR`
- `409 SHIFT_NOT_FOUND` · `409 SHIFT_NOT_COMPLETED` ("Hanya shift COMPLETED yang bisa di-reopen.")
- `500 INTERNAL_ERROR`

### `GET /api/v1/shifts/handoffs/unclaimed`
**Permission**: `shift.view` · **DeviceType**: MOBILE — tanpa query param (plant dari scope)

Response 200:
```json
{
  "data": [
    {
      "id": "uuid", "machineId": "uuid", "machineCode": "MKR-01", "machineName": "Maker #1",
      "fromShiftId": "uuid", "sisaTsgKg": "3.2", "batanganSementaraKg": "1.1",
      "weighedAt": "2026-08-22T13:55:00.000Z", "note": null
    }
  ]
}
```
- Filter: `claimedByShiftId IS NULL`; kalau user punya plant scope, filter plant juga. Urut `weighedAt` ASC.

Error: standar auth + permission.

### `PATCH /api/v1/shifts/[id]/waste/[category]`
**Permission**: `shift.waste.settle` · **DeviceType**: MOBILE/WEB

`[category]` path param: `MENIR | RIJEKAN | DEBU_KASAR | DEBU_HALUS`

Payload (opsional — boleh body kosong):
```json
{ "settledAt": "2026-08-22T14:00:00.000Z" }
```

Response 200:
```json
{ "shiftId": "uuid", "category": "RIJEKAN", "settlementStatus": "LUNAS" }
```

Error:
- `400 INVALID_CATEGORY` ("Kategori harus salah satu: MENIR, RIJEKAN, DEBU_KASAR, DEBU_HALUS")
- `409 SHIFT_NOT_COMPLETED` ("Shift harus COMPLETED dulu sebelum settle waste.")
- `500 INTERNAL_ERROR`

### `GET /api/v1/notifications`
**Permission**: auth-only (tanpa requiredPermission) · **DeviceType**: MOBILE — tanpa query param

Response 200:
```json
{
  "data": [
    { "shiftId": "uuid", "plantId": "uuid", "machineId": "uuid",
      "reportDate": "2026-08-21", "endedAt": "2026-08-21T14:00:00.000Z", "pendingHours": 18 }
  ],
  "total": 3
}
```
- Isi: shift `COMPLETED` yang `actualEnd` lebih dari 2 jam lalu (belum di-approve), filter plant dalam scope user, max 20.
- `pendingHours` dibulatkan ke integer.

Error: standar auth (401/500).

---

## 6. QR (2 endpoint)

### `POST /api/v1/qr/resolve`
**Permission**: auth-only · **DeviceType**: MOBILE (deep-link handler scan)

Payload:
```json
{ "uri": "ohmes://tsg_box/PLT-KDR-01/TSG-20260822-001?w=100&h=3f9a..." }
```
- Format URI: `ohmes://{type}/{plantCode}/{entityCode}` — `type` lowercase di URI (`machine`, `tsg_box`, `batch`, `pack`).
- QR dinamis (TSG_BOX/BATCH/PACK) **wajib** menyertakan query `h=<hmac>` — tanpa itu `400 QR_HMAC_REQUIRED`. QR statis MACHINE tanpa `h`.

Response 200 — **`canAccess: false` tetap status 200, BUKAN 403**:
```json
{
  "type": "TSG_BOX",
  "entity": { "id": "uuid", "uri": "ohmes://tsg_box/PLT-KDR-01/TSG-20260822-001", "plantId": "uuid", "code": "TSG-20260822-001", "weightKg": "15.2" },
  "plantId": "uuid",
  "canAccess": false,
  "nextAction": "OPEN_BOX"
}
```
- `type`: `MACHINE | TSG_BOX | BATCH | PACK` (uppercase).
- `entity`: selalu `{id, uri, plantId}`; untuk `TSG_BOX` ditambah `code` (boxCode) + `weightKg` (dari receiving, untuk auto-fill).
- `nextAction` mapping: `MACHINE → START_SHIFT`, `TSG_BOX → OPEN_BOX`, `BATCH → HLP_PACK`, `PACK → VIEW_PACK`, selain itu `UNKNOWN`.
- App harus cek `canAccess` — kalau `false`, tampilkan blokir/tidak bisa akses (jangan treat sebagai error).

Error:
- `400 VALIDATION_ERROR`
- `400 QR_INVALID_URI` ("Format URI tidak valid")
- `400 QR_HMAC_REQUIRED` ("QR dinamis memerlukan parameter h")
- `400 QR_INVALID` ("QR tidak valid (HMAC tidak cocok)" — QR palsu)
- `404 QR_NOT_FOUND` ("QR tidak terdaftar di sistem.")
- `500 INTERNAL_ERROR`

### `POST /api/v1/qr/scan-log`
**Permission**: auth-only · **DeviceType**: MOBILE

Payload:
```json
{ "uri": "ohmes://tsg_box/PLT-KDR-01/TSG-20260822-001?w=100&h=3f9a...", "deviceInfo": "Samsung A15" }
```
- `deviceInfo?`: string opsional.

Response 200:
```json
{ "uri": "ohmes://tsg_box/PLT-KDR-01/TSG-20260822-001?w=100&h=3f9a...", "scanned": true, "at": "2026-08-22T06:00:12.000Z" }
```

Error:
- `400 VALIDATION_ERROR`
- `404 QR_NOT_FOUND` ("QR tidak terdaftar.")
- `500 INTERNAL_ERROR`

---

## 7. Offline & Push (2 endpoint)

### `POST /api/v1/mobile/sync`
**Permission**: auth-only · **DeviceType**: MOBILE (upload queue offline)

Payload:
```json
{
  "items": [
    {
      "idempotencyKey": "op-20260822-0001-uuid",
      "method": "POST",
      "path": "/api/v1/boxes/weigh",
      "body": { "inventoryBoxId": "uuid", "weightKg": 12.4 },
      "queuedAt": "2026-08-22T05:00:00.000Z"
    }
  ],
  "deviceId": "android-imei-..."
}
```
- `items`: 1–50 item.
- Item: `idempotencyKey` (string ≥ 1), `method` (`POST | PATCH`), `path` (string ≥ 1), `body` (object bebas), `queuedAt?` (datetime ISO).

Response 200:
```json
{
  "processed": 2,
  "replays": 1,
  "results": [
    { "idempotencyKey": "op-20260822-0001-uuid", "status": 200, "isReplay": false },
    { "idempotencyKey": "op-20260822-0002-uuid", "status": 200, "isReplay": true }
  ]
}
```
- `isReplay: true` = key sudah diproses dalam 24 jam terakhir untuk user ini → tidak diproses ulang; `status` = status response cached.
- **PENTING — baca baik-baik**: route ini **masih placeholder** untuk eksekusi item. Semua item baru diproses "simplified" dan selalu diberi `status: 200` (`{success: true}` disimpan sebagai cache) — **belum di-dispatch ke route handler asli per path**. Jangan mengandalkan `status` item untuk menentukan sukses bisnis sebelum backend melengkapi dispatch; tetap pakai idempotencyKey sebagai acuan sync status.

Error:
- `400 VALIDATION_ERROR` ("Format sync tidak valid." dengan `details`)
- `500 SYNC_FAILED` ("Gagal memproses sync.")
- standar auth (401/403 tidak dipakai — route auth-only)

### `POST /api/v1/mobile/push-register`
**Permission**: auth-only · **DeviceType**: MOBILE

Payload:
```json
{ "pushToken": "fcm-token-...", "action": "register", "sessionId": "uuid" }
```
- `action`: `register | unregister`. `sessionId?`: uuid.
- **Catatan**: `sessionId` diterima di schema tapi **TIDAK dipakai** di query — update berlaku untuk **semua** sesi `deviceType=MOBILE` milik user.

Response 200:
```json
{ "success": true, "action": "register" }
```

Error:
- `400 VALIDATION_ERROR`
- `500 PUSH_REGISTER_FAILED` ("Gagal register push token.")
- standar auth

---

## Lampiran: Catatan Implementasi yang Harus Diketahui Tim Mobile

1. **`GET /auth/me`** adalah sumber kebenaran identitas+scope setelah login/refresh — jangan parse JWT sendiri.
2. **Access token TTL pendek** (15 menit; SUPERADMIN 5 menit) — refresh token TTL 30 hari (SUPERADMIN 7 hari). Wajib punya auto-refresh dengan retry queue (401 `TOKEN_EXPIRED` → refresh → retry 1×).
3. **Sesi di-revoke** (force-logout admin / login device lain) → akses langsung mati dengan `TOKEN_REVOKED` 401 — app harus logout paksa ke layar login.
4. **`SESSION_EXISTS` 409** saat login MOBILE = ada sesi MOBILE lain aktif (single-session). Flow: tampilkan konfirmasi "revoke sesi lama" — revoke hanya bisa lewat SUPERADMIN (`POST /super/users/[id]/sessions/mobile/revoke`), app mobile TIDAK bisa revoke sendiri.
5. **Nilai numeric dari kolom numeric Postgres bisa berupa string** (`"15.2"`) — parse defensif di semua response (lihat `weightKg`, `totalWeightKg`, `kg`, `quantity`).
6. **`from`/`to` di `GET /shifts` diabaikan** server — kalau butuh filter tanggal, kombinasi `status` + `limit`/sorting yang tersedia.
7. **Permission codes**: `supplier.sj.create`, `supplier.sj.view`, `supplier.sj.label`, `supplier.sj.pool`, `tsg.receiving.create`, `tsg.receiving.view`, `tsg.receiving.approve`, `tsg.inventory.view`, `tsg.inventory.writeoff`, `tsg.inventory.transfer`, `shift.view`, `shift.approve`, `shift.reopen`, `shift.waste.settle`, `shift.end`, `dashboard.plant.view`, `dashboard.area.view`. Master data GET dan `auth/*`, `qr/*`, `mobile/*`, `notifications` cukup login (tanpa permission khusus).
8. Endpoint web-only (tidak perlu diimplementasi mobile): `POST` master data (`masterdata.*.edit`), `admin/onboard-plant`, `super/*`, `reports/*`, `dispatch/*`, `shifts/start`, `shifts/[id]/end`, `shifts/[id]/boxes`, `box-sessions/*`, `cartons/*`, `boxes/*`, `hlp/*`, `batches`, `material-*`, `companies`, `plants`, `regions`, `user-assignments`, `users/[id]`, `shift-roster`, `audit`, `qr/generate`, `dashboards/hq/*`, `dashboards/oee/*`.
