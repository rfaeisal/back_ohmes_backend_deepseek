# 05 — Offline Sync & Push (Mobile v2)

> **Sumber kebenaran**: kode aktual backend `back_ohmes_backend_deepseek`.
> File rujukan: `src/app/api/v1/mobile/sync/route.ts`, `src/app/api/v1/mobile/push-register/route.ts`, `src/lib/idempotency/index.ts`, `src/lib/utils/index.ts`, `src/app/api/v1/notifications/route.ts`, `src/db/schema/audit.ts` (tabel `idempotency_key`).
> Update terakhir: 2026-08-22.

---

## 1. Ringkasan Eksekutif (Baca Dulu)

1. **Satu-satunya** endpoint yang memakai idempotency adalah `POST /api/v1/mobile/sync` — lewat **field body `idempotencyKey` per item**, bukan header. **Jangan kirim header `Idempotency-Key` ke endpoint lain** — tidak di-enforce.
2. Endpoint sync saat ini **belum mengeksekusi mutasi bisnis** — item divalidasi, di-dedup via idempotency store, lalu return `status: 200` placeholder. Tim backend harus wiring dispatch ke route handler per `path` sebelum produksi (komentar kode: *"Untuk production: dispatch ke route handler sesuai path"*). Arsitektur mobile di doc ini tetap berlaku; kontrak respons yang digambarkan sudah final.
3. Push notification: backend **hanya menyimpan token** (`push_token` di `user_session`), **belum ada FCM send**. Notifikasi saat ini = polling `GET /api/v1/notifications`.

---

## 2. Arsitektur Offline Queue (Flutter)

### 2.1 Komponen

- **Local queue**: SQLite via `sqflite` atau `drift`. Satu tabel `pending_ops`:
  - `id` (auto-increment), `idempotencyKey` (string), `method` (`POST`/`PATCH`), `path` (string), `body` (JSON text), `queuedAt` (ISO 8601), `attempts` (int), `lastAttemptAt` (nullable), `status` (`PENDING`/`SYNCED`/`DROPPED`).
  - Device ID terpisah (dikirim sebagai `deviceId` di batch, opsional).
- **Kondisi item masuk queue** — request dikirim lewat wrapper HTTP yang menangkap:
  - Network error (tidak ada koneksi, DNS fail, socket error)
  - Timeout (client-side, mis. 15 detik — tidak ada timeout khusus di backend)
  - HTTP 5xx (kecuali `SYNC_FAILED` dari sync itu sendiri — itu berarti seluruh batch gagal, lihat §3.5)
  - **Jangan** queue: 400 (VALIDATION_ERROR — bug app, harus fix + drop), 401/403 (masalah sesi, lihat §5), 404 (data tidak ada — kemungkinan sudah dihapus, verifikasi manual).

### 2.2 Retry Policy (rekomendasi — tidak di-atur oleh server)

- **Backoff eksponensial**: `5s → 15s → 60s → 5m → 15m (cap)`, reset setelah satu flush sukses. Batasi `attempts` per sesi online.
- **Max age item**: buang item yang `queuedAt` lebih tua dari batas (rekomendasi 7 hari) → tandai `DROPPED` + beri tahu operator input ulang. Jangan hapus diam-diam item yang dibutuhkan bisnis (mis. end shift).
- **Flush saat online**: listener konektivitas (`connectivity_plus`) → trigger flush. Juga flush saat app resume.
- Urutan flush: per `queuedAt` ascending; **jangan parallel** untuk item yang saling dependen (mis. `shf-end` setelah `shf-start`).

### 2.3 Alur Lengkap

```
Operator aksi (mis. open box) → request langsung → sukses? selesai.
                                              └─ gagal (network/5xx/timeout)
                                                   → simpan {method, path, body, idempotencyKey} di local queue
                                                          ↓ (saat online)
                                                   POST /mobile/sync (batch 1–50)
                                                          ↓
                                              per-item: isReplay? → pakai status cache (jangan reproses)
                                                        baru → proses → hapus item dari queue
                                                        error → seluruh batch retry belakangan
```

---

## 3. Kontrak `POST /api/v1/mobile/sync`

Auth: JWT (`withAuth`).

### 3.1 Request

```json
{
  "items": [
    {
      "idempotencyKey": "box-open-550e8400-e29b-41d4-a716-446655440000",
      "method": "POST",
      "path": "/api/v1/boxes/open",
      "body": { "boxCode": "TSG-240810-001", "weightKg": 15.2 },
      "queuedAt": "2026-08-22T05:59:00.000Z"
    }
  ],
  "deviceId": "9f3a2b… (opsional)"
}
```

| Field item | Wajib | Validasi zod | Keterangan |
|---|---|---|---|
| `idempotencyKey` | ya | `string().min(1)` | Format `<prefix>-<uuid>` — lihat §3.3 |
| `method` | ya | enum `["POST", "PATCH"]` | GET tidak boleh di-queue |
| `path` | ya | `string().min(1)` | Path API, mis. `/api/v1/boxes/open` |
| `body` | ya | `record(unknown)` | Payload asli request |
| `queuedAt` | tidak | `string().datetime()` | ISO 8601; untuk log |
| `items` (batch) | ya | `array().min(1).max(50)` | **1–50 item per batch** |
| `deviceId` | tidak | `string()` | Opsional, untuk identifikasi device |

> Tidak ada batasan ukuran body per item di zod — praktik baik tetap jaga batch kecil (≤50 item, body ringan).

### 3.2 Response 200

```json
{
  "processed": 1,
  "replays": 0,
  "results": [
    { "idempotencyKey": "box-open-550e…", "status": 200, "isReplay": false }
  ]
}
```

| Field | Makna |
|---|---|
| `processed` | Jumlah item diproses (termasuk replay) |
| `replays` | Jumlah item yang ternyata duplikat (sudah pernah diproses) |
| `results[]` | Satu entry per item, urutan sama dengan request |
| `results[].status` | HTTP status hasil item. `isReplay:true` → status dari **cached response** pertama kali |
| `results[].isReplay` | `true` = item ini duplikat key dalam 24 jam → server tidak memproses lagi, return hasil tersimpan |

### 3.3 Idempotency Key per Item

- Format: **`<prefix>-<uuid>`** (mis. `box-open-550e8400-e29b-41d4-a716-446655440000`). Validasi aktual: panjang **8–128 karakter** dan minimal 2 segmen dipisah `-`; prefix bebas asalkan deskriptif.
- Daftar prefix resmi (dari `src/lib/utils/index.ts`): `shf-start`, `shf-end`, `shf-approve`, `shf-reopen`, `shf-correct`, `box-open`, `box-weigh`, `box-consumption`, `shift-downtime`, `shift-maintenance`, `shift-handoff`, `hlp-pack`, `tsg-receiving`, `tsg-writeoff`, `carton-create`, `carton-close`, `dispatch-create`, `dispatch-confirm`, `qr-generate`, `qr-resolve`. **Gunakan prefix ini sesuai operasi** supaya key deskriptif.
- **Dedup scope**: unik per `(userId, key)` — dua user boleh pakai key yang sama; satu user tidak boleh pakai key sama untuk operasi berbeda.
- **Dedupe window: 24 jam** — `checkIdempotency` membandingkan `createdAt + 24h`; `storeIdempotency` set `expiresAt = now + 24h`; ada cleanup job harian (`cleanupExpiredIdempotencyKeys`).
- Replay: key yang sama + window masih berlaku → server return cached `{status, body}` dengan `isReplay: true`, **tanpa mengeksekusi ulang** (amankan dari double-submit saat retry).
- Key yang **invalid format tidak di-dedup** — `isValidIdempotencyKey` false → diproses normal (risiko duplikat, jadi selalu generate key valid).
- **Client harus generate key baru sekali per operasi** (bukan per percobaan) — key dibentuk saat item pertama kali dibuat dan tetap sama di tiap retry item itu.

### 3.4 Error Response

| Kode | Status | Makna |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Format batch/item tidak lolos zod — perbaiki, jangan retry mentah |
| `SYNC_FAILED` | 500 | Exception saat proses batch — retry belakangan |
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Sesi bermasalah — lihat §5 |

Format: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.

### 3.5 Partial Success & Retry Semantik

- **Saat ini tidak ada error per-item** — hasil per item selalu `{status, isReplay}`; kalau satu item menyebabkan exception, **seluruh batch** gagal `500 SYNC_FAILED`.
- Aturan client:
  - Batch sukses (200) → hapus item yang `isReplay:false` dan `status < 500` dari queue. Item `isReplay:true` juga sudah aman (server punya hasilnya) → hapus.
  - Batch 500 / network / timeout → **jangan hapus apa pun**; retry seluruh batch dengan key yang sama (idempotent — item yang sudah sukses terdeteksi sebagai replay).
  - Item 400 → jangan retry dengan body sama; tandai untuk review.
- **Disclaimer implementasi**: sampai wiring production selesai, `status` item selalu `200` placeholder dan mutasi bisnis **tidak benar-benar terjadi**. Mobile harus punya mekanisme verifikasi (mis. re-fetch data setelah sync) supaya tidak menampilkan sukses palsu; dan tim backend harus menyelesaikan dispatch ke handler per `path` sebelum rilis.

---

## 4. `POST /api/v1/mobile/push-register`

Auth: JWT.

### Request

```json
{ "pushToken": "fcm-token-xyz…", "action": "register", "sessionId": "uuid-session (opsional)" }
```

| Field | Wajib | Validasi | Keterangan |
|---|---|---|---|
| `pushToken` | ya | `string().min(1)` | FCM/APNs token dari perangkat |
| `action` | ya | enum `["register", "unregister"]` | |
| `sessionId` | tidak | `uuid()` | Diterima tapi **saat ini tidak dipakai di query** — update berdasarkan `userId` + `deviceType='MOBILE'` |

### Response 200

```json
{ "success": true, "action": "register" }
```

Error: 400 `VALIDATION_ERROR`, 500 `PUSH_REGISTER_FAILED`.

### Kapan dipanggil

- **`register`**: setelah login sukses + setelah app mendapat push token (mis. setelah izin notifikasi). Update kolom `push_token` di `user_session`.
- **`unregister`**: saat logout normal (clear `push_token`).

### Fakta penting: belum ada push

- Backend **tidak pernah mengirim FCM/APNs** — kode hanya menulis kolom `push_token` (text) di tabel `user_session`. Tidak ada service push, tidak ada scheduling.
- **Notifikasi saat ini = polling**: `GET /api/v1/notifications` → daftar shift `COMPLETED` yang selesainya > 2 jam lalu di plant scope user (limit 20). Response:

```json
{
  "data": [
    { "shiftId": "uuid", "plantId": "uuid", "machineId": "uuid",
      "reportDate": "2026-08-22", "endedAt": "2026-08-22T03:00:00Z",
      "pendingHours": 5 }
  ],
  "total": 1
}
```

- Desain mobile: poll `GET /notifications` tiap N menit saat app aktif (mis. 5 menit) untuk banner "shift belum di-approve"; jangan mengandalkan push. Bila push FCM kelak ditambahkan, `pushToken` sudah tersedia.

---

## 5. Sinkronisasi Sesi (Refresh Token Mati Saat Offline)

Prinsip dari spec mobile (`01-app-spec` §2.5/§3, ditulis ulang sesuai kode aktual):

1. Mobile pakai access token + refresh token (login menghasilkan pasangan; session mobile aktif 30 hari / di-revoke sesuai kebijakan single-session).
2. Request yang kena `401` dengan code `TOKEN_EXPIRED` → coba refresh dulu (satu kali). Refresh gagal (expired, revoked, `SESSION_EXISTS` setelah install ulang) → **app harus force logout**.
3. **Saat offline, refresh tidak bisa dilakukan.** Item baru yang dibuat offline tetap masuk queue (aman — key idempotency mereka baru). Tapi **saat flush pertama kali setelah online, kalau sync response `401`**:
   - Hentikan flush.
   - **Kosongkan queue lokal** (item terikat sesi user yang sudah mati; diproses dengan token lama akan gagal 401 juga).
   - Force logout ke layar login. Operator perlu login ulang dan mengulang input yang belum tersinkron — komunikasikan risiko ini di UI (pesan konfirmasi sebelum logout: "N pekerjaan belum tersinkron").
4. Konsisten dengan aturan lain: single-session mobile (pindah device → SUPERADMIN revoke → session lama mati → 401 di device lama), dan password reset yang me-revoke semua session.

---

## 6. Koreksi vs `docs/mobile-team/*` (doc lama)

| Klaim doc lama | Fakta di kode aktual |
|---|---|
| Idempotency-Key header wajib di semua POST/PATCH | **Tidak di-enforce di endpoint mana pun.** Satu-satunya penggunaan idempotency: field body `idempotencyKey` di `POST /mobile/sync`. Client tidak perlu (dan tidak boleh mengandalkan) header |
| Dedup "24 jam, format bebas" | Window 24 jam benar, tapi **format divalidasi**: 8–128 karakter, ≥2 segmen `-`, pola `<prefix>-<uuid>` dianjurkan; key invalid → **tidak di-dedup** (diproses normal, rawan duplikat) |
| (implied) Sync endpoint memproses mutasi | Saat ini **placeholder** — tidak ada dispatch ke handler per path; semua item `status: 200`; hasil bisnis perlu verifikasi ulang |
| (implied) Push aktif | Belum ada pengiriman push; token hanya disimpan; notifikasi via polling `GET /notifications` |

---

## 7. Checklist Implementasi Mobile

- [ ] Tabel `pending_ops` (sqflite/drift) dengan kolom di §2.1 + index `(status, queuedAt)`.
- [ ] HTTP wrapper: deteksi network error/timeout/5xx → queue; 4xx → jangan queue; 401 → refresh → force logout.
- [ ] Generator idempotency key: `<prefix resmi>-<uuid v4>`, dibuat sekali per operasi, disimpan bersama item.
- [ ] Flush: batch 1–50, urut `queuedAt`, backoff eksponensial, max age 7 hari, hapus item hanya setelah batch 200.
- [ ] Refresh sesi sebelum flush; 401 saat flush → kosongkan queue + force logout.
- [ ] `push-register` saat login/logout; polling `GET /notifications` saat app aktif.
- [ ] Jangan kirim header `Idempotency-Key`; jangan janjikan dedup di endpoint selain sync.
