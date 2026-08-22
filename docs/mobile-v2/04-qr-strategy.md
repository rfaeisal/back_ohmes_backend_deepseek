# 04 — Strategi QR (Mobile v2)

> **Sumber kebenaran**: kode aktual backend `back_ohmes_backend_deepseek` (bukan `docs/mobile-team/03-qr-strategy.md` yang sudah usang).
> File rujukan: `src/lib/services/qr.service.ts`, `src/app/api/v1/qr/resolve/route.ts`, `src/app/api/v1/qr/scan-log/route.ts`, `src/app/api/v1/qr/generate/route.ts`, `src/db/schema/audit.ts` (tabel `qr_registry`).
> Update terakhir: 2026-08-22.

---

## 1. Ringkasan

Sistem QR backend punya 4 jenis QR yang dipetakan dari enum `QrType`:

| Enum (TS/DB) | URI lowercase | HMAC (anti-forgery) | nextAction |
|---|---|---|---|
| `MACHINE` | `machine` | statis — tanpa HMAC | `START_SHIFT` |
| `TSG_BOX` | `tsg_box` | dinamis — HMAC wajib | `OPEN_BOX` |
| `BATCH` | `batch` | dinamis — HMAC wajib | `HLP_PACK` |
| `PACK` | `pack` | dinamis — HMAC wajib | `VIEW_PACK` |

Alur mobile: scan URI (`ohmes://...`) → kirim **URI utuh** ke `POST /api/v1/qr/resolve` → server jawab `{type, entity, plantId, canAccess, nextAction}` → app navigasi ke action sesuai `nextAction`.

---

## 2. Format URI Aktual

`buildQrUri()` menghasilkan:

```
ohmes://{type_lowercase}/{plantCode}/{entityCode}
```

- `type_lowercase` = hasil `toLowerCase()` enum → **`machine`**, **`tsg_box`**, **`batch`**, **`pack`**. Perhatikan: `TSG_BOX` menjadi `tsg_box` (dengan underscore) — **bukan** `tsg`.
- `plantCode` = **kode pabrik** (`plant.code`, mis. `PLT-MLG-01`), bukan UUID plant.
- `entityCode` tergantung jenis:

| Jenis | entityCode diambil dari | Contoh |
|---|---|---|
| `MACHINE` | `machine.code` | `MKR-01` |
| `TSG_BOX` | `tsg_receiving_box.box_code` | `TSG-240810-001` |
| `BATCH` | `entityId.slice(0, 12)` — 12 karakter pertama UUID | `3f9c2a1b4d2e` |
| `PACK` | `entityId.slice(0, 12)` — 12 karakter pertama UUID | `8b1d5e2f4a9c` |

Catatan penting untuk BATCH/PACK: entityCode bukan kode bisnis yang dibaca manusia — hanya potongan UUID entity. Jangan ditampilkan sebagai identitas kepada operator; identitas sesungguhnya ada di payload resolve (`entity.id`).

Contoh URI lengkap:

```
ohmes://machine/PLT-MLG-01/MKR-01
ohmes://tsg_box/PLT-MLG-01/TSG-240810-001?h=8a7f2e5b3c9d1e4f
ohmes://batch/PLT-MLG-01/3f9c2a1b4d2e?h=4f1e9d2c3b5a8f7e
ohmes://pack/PLT-MLG-01/8b1d5e2f4a9c?h=2e5f8a1b4c7d9e0f
```

Cara server mem-parse (`parseQrUri`): protokol custom di-parse lewat `URL` JS — segmen pertama menjadi hostname, sisanya pathname; minimal 3 segmen (`type / plantCode / entityCode`). Query string (`?h=...`) **diabaikan untuk lookup registry**, tetapi dibaca untuk verifikasi HMAC (lihat §5).

---

## 3. Empat Jenis QR

| | `machine` | `tsg_box` | `batch` | `pack` |
|---|---|---|---|---|
| **Kapan di-generate** | Saat mesin didaftarkan (mengambil `machine.code`) | Saat boks TSG diterima dari supplier (`tsg_receiving_box.box_code` + `weight_kg` tersedia) | Saat batch produksi dibuat (UUID batch) | Saat pack/carton dihasilkan (UUID pack) |
| **Siapa print** | Admin plant / user setup mesin, sekali, print label tempel di mesin | Gudang (receiving) saat boks masuk — label sticker di boks | Line packing saat batch dibuka — label per batch | QA/line saat pack jadi — label per pack |
| **Sifat** | Statis, tanpa HMAC | Dinamis, HMAC wajib | Dinamis, HMAC wajib | Dinamis, HMAC wajib |
| **nextAction (purpose UX)** | `START_SHIFT` — scan mesin untuk mulai shift | `OPEN_BOX` — scan boks untuk open box; `entity` membawa `code` + `weightKg` untuk **auto-fill** (operator tidak retype) | `HLP_PACK` — scan batch untuk flow pack HLP | `VIEW_PACK` — scan pack untuk lihat detail/traceability |
| **Payload entity tambahan** | — | `code`, `weightKg` (dari receiving) | — | — |

> Catatan kode: route `POST /qr/generate` **tidak memvalidasi role/permission per jenis QR** — hanya auth + plant scope. Validasi siapa boleh generate jenis apa masih tanggung jawab UI/mobile dan belum di-enforce di backend.

---

## 4. Kontrak `POST /api/v1/qr/resolve`

Auth: JWT (`withAuth`) — access token di header `Authorization: Bearer <token>`.

### Request

```json
{ "uri": "ohmes://tsg_box/PLT-MLG-01/TSG-240810-001?h=8a7f2e5b3c9d1e4f" }
```

- `uri` (string, wajib, min 1 char). Kirim **URI utuh termasuk query** `?h=...` — server yang mem-parse, jangan parse sendiri di client.

### Response 200 — selalu berbentuk `{type, entity, plantId, canAccess, nextAction}`

```json
{
  "type": "TSG_BOX",
  "entity": {
    "id": "0f6a4d2e-...-uuid-boks",
    "uri": "ohmes://tsg_box/PLT-MLG-01/TSG-240810-001",
    "plantId": "uuid-plant",
    "code": "TSG-240810-001",
    "weightKg": 15.2
  },
  "plantId": "uuid-plant",
  "canAccess": true,
  "nextAction": "OPEN_BOX"
}
```

Makna tiap field:

| Field | Makna |
|---|---|
| `type` | Enum `MACHINE` \| `TSG_BOX` \| `BATCH` \| `PACK` (huruf besar) |
| `entity.id` | UUID entity sebenarnya (batch/pack: UUID penuh, bukan 12 char dari URI) |
| `entity.uri` | Base URI tanpa query — dipakai kalau app perlu log ulang |
| `entity.plantId` | UUID plant pemilik entity |
| `entity.code` / `entity.weightKg` | Hanya untuk `TSG_BOX` — auto-fill berat & kode saat OPEN_BOX |
| `canAccess` | **boolean** — `true` kalau plant QR ada di scope user (dari JWT + assignment). **`false` TETAP status 200**, bukan error |
| `nextAction` | `START_SHIFT` \| `OPEN_BOX` \| `HLP_PACK` \| `VIEW_PACK` (fallback `UNKNOWN`) |

### `canAccess: false` tetap 200

Ini desain sengaja: server tidak membocorkan keberadaan QR via status code. **Tidak ada 403 SCOPE_DENIED.** Client wajib cek `canAccess`:

```dart
if (!result.canAccess) {
  // Tampilkan: "QR ini untuk pabrik lain" — jangan lanjutkan action
  return;
}
```

### Contoh response per jenis QR

`machine`:
```json
{
  "type": "MACHINE",
  "entity": { "id": "uuid-mesin", "uri": "ohmes://machine/PLT-MLG-01/MKR-01", "plantId": "uuid-plant" },
  "plantId": "uuid-plant",
  "canAccess": true,
  "nextAction": "START_SHIFT"
}
```

`batch`:
```json
{
  "type": "BATCH",
  "entity": { "id": "uuid-batch-penuh", "uri": "ohmes://batch/PLT-MLG-01/3f9c2a1b4d2e", "plantId": "uuid-plant" },
  "plantId": "uuid-plant",
  "canAccess": true,
  "nextAction": "HLP_PACK"
}
```

`pack`:
```json
{
  "type": "PACK",
  "entity": { "id": "uuid-pack-penuh", "uri": "ohmes://pack/PLT-MLG-01/8b1d5e2f4a9c", "plantId": "uuid-plant" },
  "plantId": "uuid-plant",
  "canAccess": false,
  "nextAction": "VIEW_PACK"
}
```

### Error response

Format error selalu: `{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`

| Kode | Status | Makna |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body tidak valid (mis. `uri` kosong) |
| `QR_INVALID_URI` | 400 | Format URI tidak dikenali / < 3 segmen |
| `QR_HMAC_REQUIRED` | 400 | QR dinamis tanpa `?h=` |
| `QR_INVALID` | 400 | HMAC tidak cocok — QR palsu/expired |
| `QR_NOT_FOUND` | 404 | URI tidak terdaftar di `qr_registry` |
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | Token invalid/expired |

---

## 5. `POST /api/v1/qr/scan-log`

Mencatat event scan (analytics/audit kedepan).

### Request

```json
{ "uri": "ohmes://tsg_box/PLT-MLG-01/TSG-240810-001?h=8a7f2e5b3c9d1e4f", "deviceInfo": "SM-A125" }
```

- `uri` (string, wajib)
- `deviceInfo` (string, opsional)

### Response 200

```json
{ "uri": "ohmes://tsg_box/PLT-MLG-01/TSG-240810-001?h=8a7f2e5b3c9d1e4f", "scanned": true, "at": "2026-08-22T06:00:12.000Z" }
```

Error: `QR_NOT_FOUND` → 404.

> **Jujur per kode**: `logScan()` saat ini hanya melakukan lookup registry lalu return — **belum menulis ke tabel scan log apa pun** (komentar kode: "scan count atau scan log table bisa ditambahkan nanti"). Panggil endpoint ini untuk kesiapan, tapi jangan jadikan satu-satunya jejak audit bisnis — audit mutasi tetap lewat audit log endpoint lain.

---

## 6. HMAC Anti-Forgery — Cara Kerja Aktual

- Algoritma: `HMAC-SHA256`, output hex **di-slice ke 16 karakter** (`digest("hex").slice(0, 16)`).
- Key: satu key global dari env **`HMAC_KEY_ENCRYPTION`**. Fallback di kode `"CHANGE_ME_HMAC_ENCRYPTION_KEY"` — itu placeholder; production WAJIB set env. Bukan secret per-plant.
- Payload: `` `${entityId}:${Date.now()}` `` — UUID entity + timestamp generation. HMAC dihitung saat generate, **disimpan di kolom `qr_registry.hmac`**, dan dibawa sebagai query `?h=...` pada QR tercetak.
- Verifikasi saat resolve: server ambil `?h` dari URI yang di-scan, bandingkan dengan nilai tersimpan pakai `timingSafeEqual` (constant-time) + cek panjang. Tidak cocok / tidak ada `h` → error 400.
- MACHINE tidak punya HMAC (`hmac` null) → statis, scan apa adanya.

**Implikasi untuk Flutter**: jangan parse HMAC, jangan validasi, jangan regenerate. Cukup ambil `barcode.rawValue` dari scanner dan kirim **URI utuh (termasuk `?h=...`)** ke `/qr/resolve`. Server yang memverifikasi. Kalau app menyimpan URI untuk offline (lihat §7), simpan string utuh apa adanya.

---

## 7. QR Registry + Retry/Offline

Setiap QR terdaftar di tabel `qr_registry` (schema: `src/db/schema/audit.ts`):

| Kolom | Makna |
|---|---|
| `id` | UUID (primary key) |
| `plantId` | UUID plant (FK) |
| `type` | enum `MACHINE` \| `TSG_BOX` \| `BATCH` \| `PACK` |
| `entityId` | UUID entity sesuai type |
| `uri` | `text`, **unique** — `ohmes://machine/PLT-MLG-01/MKR-01` |
| `hmac` | nullable — terisi untuk QR dinamis |
| `generatedBy` | UUID user pembuat (FK) |
| `generatedAt` | timestamp, default now |
| `printedAt` | nullable |
| `isActive` | boolean, default `true` |

`POST /api/v1/qr/generate` (dipakai web/admin, bukan mobile): body `{type, entityId: uuid}` → 201 `{qrId, uri, hmac, type}`. Catatan kode: `plantId` diambil dari `ctx.user.plantIds[0]` — **hanya plant pertama di scope user** (user multi-plant akan selalu dapat plant pertama); tanpa plant scope → 403 `NO_PLANT_SCOPE`; error lain (plant/mesin/boks tidak ditemukan) → 409.

**Scan offline**:

1. Scan saat tidak ada jaringan → **jangan resolve** (resolve butuh server). Simpan `rawUri` ke local queue (lihat `05-offline-sync.md`).
2. Saat online → `POST /qr/resolve` untuk tiap URI queue → dapat `nextAction`.
3. Action yang menghasilkan mutasi (mis. `OPEN_BOX`, `HLP_PACK`) → lanjut ke endpoint bisnis; kalau itu gagal karena jaringan, item mutasi masuk **offline sync queue** (`POST /mobile/sync`, lihat `05-offline-sync.md`).
4. `scan-log` juga bisa di-queue offline dan di-flush belakangan (sifatnya idempoten-safe karena hanya lookup).

**Peringatan penting**: resolve dan mutasi adalah dua hal berbeda. `?h=` hanya valid untuk URI yang tercetak — jangan simpan URI resolve hasil dan print ulang; QR dinamis berlaku sepanjang registry tidak di-nonaktifkan (`isActive`).

---

## 8. Koreksi vs `docs/mobile-team/03-qr-strategy.md` (doc lama)

| Klaim doc lama | Fakta di kode aktual |
|---|---|
| type: `machine`, `tsg`, `batch`, `pack` | Enum `MACHINE`, `TSG_BOX`, `BATCH`, `PACK`; URI lowercase **`tsg_box`** (bukan `tsg`) |
| URI query `?w=15.20&h=...` dengan `w` = berat | Server **tidak membaca `w`** — hanya `h` yang dibaca (`searchParams.get("h")`); berat didapat dari `entity.weightKg` response resolve, bukan dari URI |
| HMAC: secret per-plant, `HMAC-SHA256(...).substring(0, 10)` | Satu key global env `HMAC_KEY_ENCRYPTION`, slice **16 hex char**, payload `${entityId}:${Date.now()}` |
| Response resolve punya `hmacValid`, `lineage`, `nextAction: VIEW_LINEAGE` | Response aktual hanya `{type, entity, plantId, canAccess, nextAction}`. **Tidak ada** `hmacValid`, **tidak ada** `lineage` (traceability belum diimplementasi), `VIEW_PACK` bukan `VIEW_LINEAGE` |
| `canAccess=false` → HTTP 403 | **Tidak ada 403 SCOPE_DENIED** — `canAccess:false` tetap response 200; client cek field |
| BATCH/PACK entityCode berupa kode bisnis | `entityId.slice(0, 12)` — potongan UUID |

---

## 9. Guidance Scanner Flutter

- Paket: [`mobile_scanner`](https://pub.dev/packages/mobile_scanner) (atau yang setara, mis. `google_mlkit_barcode_scanning`).
- Handler deteksi:

```dart
void onDetect(BarcodeCapture capture) {
  final raw = capture.barcodes.first.rawValue;
  if (raw == null || !raw.startsWith('ohmes://')) {
    // Feedback: "QR tidak dikenali sistem" — getar/beep, jangan lanjut
    return;
  }
  // Debounce: cegah scan ganda untuk URI sama dalam 1-2 detik
  resolveUri(raw); // kirim raw UTUH ke POST /qr/resolve
}
```

- **Jangan parse sendiri** — jangan split string, jangan validasi segmen, jangan cek HMAC. Kirim string utuh. Server menolak format salah dengan `QR_INVALID_URI` (400).
- Handle `canAccess:false` → UI pesan plant-lain.
- Handle error code dari response: `QR_HMAC_REQUIRED` / `QR_INVALID` → tampilkan "QR tidak valid/kedaluwarsa — minta QR baru"; `QR_NOT_FOUND` → "QR tidak terdaftar di sistem".
- Navigasi setelah resolve berdasarkan `nextAction`: `START_SHIFT` → form start shift (mesin terpilih dari `entity.id`); `OPEN_BOX` → form open box dengan auto-fill `entity.code` + `entity.weightKg`; `HLP_PACK` → flow pack HLP; `VIEW_PACK` → detail pack (lihat `03-*` dokumen API mobile lain untuk payload tiap flow).
- Offline: simpan `raw` di queue, flush saat online (detail di `05-offline-sync.md`).
