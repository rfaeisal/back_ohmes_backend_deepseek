# 02 · Auth & Session Management (Mobile)

Perilaku aktual backend (diverifikasi 2026-08-22). App Flutter wajib mengikuti aturan di sini.

---

## 1. Login

```
POST /api/v1/auth/login
```

Payload:

```json
{
  "username": "petugassj",
  "password": "12345678",
  "deviceType": "MOBILE",
  "deviceId": "uuid-device-yang-persisten",
  "deviceName": "Samsung A12 Alfi",
  "otp": "000000"
}
```

| Field | Wajib? | Keterangan |
|---|---|---|
| `deviceType` | ✅ | `MOBILE` untuk app Flutter. `WEB` hanya untuk pengujian/area office. |
| `deviceId` | ✅ untuk MOBILE | UUID persisten per instalasi (simpan di secure storage; jangan berubah saat app restart — kalau berubah dianggap device baru). |
| `deviceName` | ❌ | Untuk info di sesi (dipamerkan saat `SESSION_EXISTS`). |
| `otp` | SUPERADMIN saja | Saat ini **bypass** — kirim `000000` (env `OTP_BYPASS_CODE`). Verifikasi Twilio masih TODO di backend; jangan bangun UI kirim-ulang-OTP dulu. |

Response 200 (flat):

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "rft_...",
  "expiresIn": 900,
  "user": { "id": "...", "fullName": "...", "username": "...", "isPrivileged": false },
  "roles": [{ "code": "AREA_SJ_OFFICER", "isPrivileged": false }],
  "assignments": [{ "scopeType": "REGION", "scopeId": "...", "scopeName": "", "roleCode": "AREA_SJ_OFFICER" }],
  "activeScope": { "scopeType": "REGION", "scopeId": "..." }
}
```

Error penting:

| Status | Code | Artinya / Aksi app |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Payload tidak valid |
| 401 | `INVALID_CREDENTIALS` | Username/password salah — tampilkan pesan |
| 401 | `OTP_REQUIRED` | SUPERADMIN tanpa `otp` — tampilkan field OTP |
| 401 | `OTP_INVALID` | OTP salah |
| 403 | `NO_ASSIGNMENT` | User tidak punya role — "hubungi administrator" |
| 409 | `SESSION_EXISTS` | Sudah ada sesi mobile aktif di device LAIN — lihat §3 |

## 2. Token & TTL

| | User biasa | SUPERADMIN |
|---|---|---|
| Access token | `JWT_ACCESS_TOKEN_TTL_MINUTES` (default 15 menit) | **5 menit** |
| Refresh token | `JWT_REFRESH_TOKEN_TTL_DAYS` (default 30 hari) | **7 hari** |

- Access token = JWT berisi `plantIds`, `roleIds`, `permissions`, `activeScope`, `sessionId`. App TIDAK boleh mengubah payload — cukup simpan dan pakai.
- `expiresIn` (detik) ada di response login/refresh — jadwalkan refresh otomatis ~1 menit sebelum habis.

## 3. Single-session mobile

| Kondisi | Perilaku backend |
|---|---|
| Login pertama (belum ada sesi mobile) | ✅ Sukses |
| Login ulang di device SAMA (`deviceId` sama) | ✅ Sukses — sesi lama otomatis direvoke |
| Login di device BEDA saat sesi lama aktif | ❌ `409 SESSION_EXISTS` — response memuat info device aktif |
| SUPERADMIN revoke sesi lama | User bisa login lagi di device baru |
| Web session concurrent | ✅ Bebas — aturan ini hanya untuk `deviceType=MOBILE` |

App wajib: simpan `deviceId` persisten (flutter_secure_storage), dan pada `409` tampilkan modal: "Akun sedang dipakai di perangkat lain (nama, terakhir aktif). Hubungi IT untuk pindah perangkat." **Tidak ada self-service pindah device.**

## 4. Refresh token

```
POST /api/v1/auth/refresh
```

Payload: `{ "refreshToken": "rft_..." }`

Response 200:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "rft_BARU...",
  "expiresIn": 900,
  "user": { "id": "...", "fullName": "", "username": "" },
  "assignments": [...],
  "activeScope": { "scopeType": "REGION", "scopeId": "..." }
}
```

**PENTING**:
1. Refresh token **rotasi** — yang lama invalid setelah dipakai. Simpan yang BARU dari response, dan pakai saat refresh berikutnya.
2. `user.fullName`/`username` di response refresh **kosong** — jangan menimpa profil yang sudah di-cache dari login.
3. Error `401 REFRESH_TOKEN_INVALID` → sesi berakhir → clear queue? (queue tetap disimpan kalau berisi data; lihat `05-offline-sync.md` §4) → redirect ke login.
4. Race condition: kalau 2 request refresh jalan bersamaan, salah satu akan dapat `REFRESH_TOKEN_INVALID` — serialkan refresh lewat satu queue (single-flight) di sisi app.

## 5. Logout

```
POST /api/v1/auth/logout   (Authorization: Bearer <accessToken>)
```

Backend **me-revoke SEMUA sesi user** (bukan cuma sesi aktif) + response berisi header `Clear-Site-Data` (tidak relevan untuk native). Setelah logout: hapus token lokal, `unregister` push token (`POST /mobile/push-register` action `unregister`), hapus deviceId? — **jangan** hapus `deviceId` (dipakai untuk identitas device pada login berikutnya).

## 6. Switch scope (multi-assignment)

User dengan >1 assignment (mis. petugassj + gudang di plant berbeda) bisa ganti scope aktif:

```
POST /api/v1/auth/switch-scope
{ "scopeType": "PLANT", "scopeId": "<uuid>" }
```

Response: `{ accessToken, expiresIn, activeScope, assignments, plantIds }` — access token BARU dengan scope baru. Setelah switch: refresh semua data scope-dependent (SJ, stok TSG, dashboard).

## 7. Sesi & push token

- `POST /mobile/push-register` `{ pushToken, action: "register" | "unregister", sessionId? }` — panggil `register` setelah login sukses, `unregister` saat logout.
- **FCM server-side belum ada** — push belum dikirim backend. Notifikasi saat ini via polling `GET /notifications` (interval saran 2–5 menit; item: shift menunggu approval >2 jam, dsb.).

## 8. Change password

```
PATCH /api/v1/auth/change-password   (Authorization: Bearer)
{ "oldPassword": "...", "newPassword": "min 8 karakter" }
```

## 9. Aturan keamanan app-side

- Simpan access+refresh token di **flutter_secure_storage** (bukan shared_preferences).
- Jangan log token.
- Semua request API wajib `Authorization: Bearer <accessToken>` + `X-Request-Id` (uuid per request, opsional tapi direkomendasikan untuk tracing).
