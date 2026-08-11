# 03 · QR Code Strategy & Mobile Guidance

QR code adalah **kunci UX aplikasi mobile** — mengganti input manual boks/mesin/batch dengan scan. Panduan ini membahas format URI, lifecycle 4 jenis QR, tabel `QRRegistry`, dan guidance untuk Flutter app.

---

## 1. Format URI Standar

Semua QR menggunakan skema custom `ohmes://`:

```
ohmes://{type}/{plantId}/{entityId}?<query>
```

- `type` — salah satu: `machine`, `tsg`, `batch`, `pack`.
- `plantId` — code plant (mis. `PLT-MLG-01`) untuk deteksi cross-plant scan.
- `entityId` — identifier entity spesifik.
- Query string (opsional) — untuk data terverifikasi (mis. berat pre-checked, HMAC).

### Contoh
```
ohmes://machine/PLT-MLG-01/MKR-01
ohmes://tsg/PLT-MLG-01/TSG-240810-001?w=15.20&h=8a7f2e
ohmes://batch/PLT-MLG-01/btc_MKR01_20260810_03
ohmes://pack/PLT-MLG-01/pack_shf_2b9f1a_042
```

**Kenapa URI custom**, bukan URL HTTPS:
- Deep-link ke Flutter app langsung (Android intent filter, iOS Universal Link fallback).
- Tidak bisa dibuka di browser random — hanya app terdaftar yang bisa handle.
- Kalau nanti mau URL public, tinggal tambah handler `https://mes.hummer.example/qr/...` yang redirect ke `ohmes://...`.

---

## 2. Empat Jenis QR

### 2.1. `machine` — Statis, Tempel di Mesin
- **Print oleh**: HQ_ADMIN saat setup mesin baru.
- **Lokasi fisik**: Sticker plastik tahan air, tempel di badan mesin (Maker/HLP).
- **Frekuensi cetak**: sekali per mesin (kecuali sticker rusak → cetak ulang).
- **Konten**: hanya `plantId` + machine code. Tidak ada data dinamis.
- **Purpose UX**: operator scan → Flutter langsung tahu mesin apa dan verify user scope → pre-fill form Start Shift.

**Payload contoh**:
```
ohmes://machine/PLT-MLG-01/MKR-01
```

### 2.2. `tsg` — Dinamis, Print di Gudang saat Receiving
- **Print oleh**: role `GUDANG` saat boks TSG diterima dari supplier.
- **Lokasi fisik**: Sticker label tempel di boks TSG.
- **Frekuensi cetak**: satu QR per boks.
- **Konten**: `plantId` + `boxCode` + query `w` (berat pre-verified) + `h` (HMAC anti-forgery).
- **Purpose UX**: operator scan sebelum masukkan boks ke feeder → auto-fill `tsgWeightKg` dari data receiving gudang. Tidak perlu retype.

**Payload contoh**:
```
ohmes://tsg/PLT-MLG-01/TSG-240810-001?w=15.20&h=8a7f2e5b3c
```

**HMAC** dihitung: `HMAC-SHA256(secret_per_plant, "TSG-240810-001|15.20|created_at").substring(0, 10)`. Server verify HMAC saat scan; kalau salah → 400 (kemungkinan QR palsu / re-print di luar sesi).

### 2.3. `batch` — Dinamis, Print di Maker saat Batch Mulai
- **Print oleh**: `OPERATOR_KECER` — sistem generate saat batch tray dibentuk.
- **Lokasi fisik**: Sticker tempel di tray/trolley batangan.
- **Frekuensi cetak**: satu QR per batch (biasanya beberapa per shift).
- **Konten**: `plantId` + `batchCode`. Query minimal (batch data dinamis dari server).
- **Purpose UX**: saat batch diserahkan ke HLP, operator HLP scan → tahu batch asal Maker mana, shift mana, siapa yang produksi. Kalkulasi berat/batang per Maker jadi akurat.

**Payload contoh**:
```
ohmes://batch/PLT-MLG-01/btc_MKR01_20260810_03
```

### 2.4. `pack` — Dinamis, Print di HLP per Shift
- **Print oleh**: `OPERATOR_KECER` di HLP.
- **Lokasi fisik**: Label pada pack besar (bundle) HLP output.
- **Frekuensi cetak**: satu QR per pack unit (mis. per karton 200 pack).
- **Konten**: `plantId` + `packCode`.
- **Purpose UX**: traceability lineage untuk QA atau kasus recall (jarang, tapi konsekuensi besar). Scan → tampilkan riwayat: batch asal → Maker → shift → operator.

**Payload contoh**:
```
ohmes://pack/PLT-MLG-01/pack_shf_2b9f1a_042
```

---

## 3. Ringkasan Lifecycle

| Jenis | Print oleh | Kapan | Anti-Forgery |
|---|---|---|---|
| `machine` | HQ_ADMIN | Setup awal (sekali) | Tidak — data mesin fixed |
| `tsg` | GUDANG | Saat receiving | HMAC di query |
| `batch` | OPERATOR_KECER (Maker) | Saat batch dibentuk | Tidak (server verify batchCode ada di DB) |
| `pack` | OPERATOR_KECER (HLP) | Saat pack keluar | Tidak (traceability read-only) |

---

## 4. Skema `qr_registry` (backend internal — hanya untuk referensi)

```sql
CREATE TABLE qr_registry (
  id            uuid PRIMARY KEY,
  plant_id      uuid NOT NULL REFERENCES plant(id),
  type          qr_type_enum NOT NULL,  -- MACHINE, TSG_BOX, BATCH, PACK
  entity_id     uuid NOT NULL,
  uri           text NOT NULL UNIQUE,
  hmac          text,
  generated_by  uuid NOT NULL REFERENCES "user"(id),
  generated_at  timestamp NOT NULL DEFAULT now(),
  printed_at    timestamp,
  is_active     boolean NOT NULL DEFAULT true
);
```

**Track**:
- **Generate**: setiap QR baru → 1 row.
- **Print**: `printed_at` diisi saat operator konfirmasi print sukses (opsional, useful untuk audit).
- **Deactivate**: `is_active=false` kalau perlu invalidate (mis. QR mesin dicetak ulang → yang lama di-deactivate).

Tabel terpisah `qr_scan_log` (Fase 3) mencatat: siapa scan, kapan, device apa. Untuk audit & analitik "boks mana yang paling sering re-scan".

---

## 5. Endpoint QR (detail di [`02-api-contract.md`](./02-api-contract.md) §6)

- `POST /qr/generate` — buat QR baru untuk entity.
- `POST /qr/resolve` — deep-link handler: kasih URI, dapat context + `nextAction`.
- `POST /qr/scan-log` — log scan untuk audit.

### Response `POST /qr/resolve` — Berdasarkan Type

**Machine**:
```json
{
  "type": "machine",
  "machine": { "id": "mch_mkr01", "code": "MKR-01", "type": "MAKER", "plantId": "PLT-MLG-01" },
  "nextAction": "START_SHIFT",
  "canAccess": true
}
```

**TSG Box**:
```json
{
  "type": "tsg_box",
  "box": {
    "code": "TSG-240810-001",
    "tsgWeightKg": 15.20,
    "receivedAt": "2026-08-10T05:12:00+07:00"
  },
  "hmacValid": true,
  "nextAction": "REGISTER_BOX"
}
```

**Batch**:
```json
{
  "type": "batch",
  "batch": {
    "id": "btc_mkr01_20260810_03",
    "machineCode": "MKR-01",
    "shiftId": "shf_2b9f1a",
    "batanganKg": 16.85,
    "productCode": "PRD-HMR-STD"
  },
  "nextAction": "HLP_PACK"
}
```

**Pack**:
```json
{
  "type": "pack",
  "pack": {
    "code": "pack_shf_2b9f1a_042",
    "lineage": {
      "batchId": "btc_mkr01_20260810_03",
      "machineCode": "MKR-01",
      "shiftId": "shf_2b9f1a",
      "operatorFullName": "Alfi",
      "packedAt": "2026-08-11T02:15:00+07:00"
    }
  },
  "nextAction": "VIEW_LINEAGE"
}
```

Kalau `canAccess=false` (user scan QR di luar scope-nya), server return `403` dengan pesan yang jelas: "QR ini untuk pabrik lain".

---

## 6. Flutter Guidance

### 6.1. Scanning
- Package: `mobile_scanner` (maintained, cross-platform).
- UI: full-screen camera dengan overlay frame, indicator sukses/gagal.
- Fallback: input manual kode (untuk device kamera jelek atau sticker sobek).

### 6.2. Deep Link Handler
Android intent filter di `AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="ohmes" />
</intent-filter>
```

iOS universal link (Info.plist + associated domains) — Fase 3 setup.

### 6.3. Local Queue (Offline Tolerance)
Package: `drift` (SQLite ORM).

Tabel lokal:
```dart
class QueuedRequest {
  int id;                    // auto-increment
  String idempotencyKey;     // client-generated
  String method;             // 'POST', 'PATCH'
  String path;               // '/shifts/xxx/boxes'
  String bodyJson;
  DateTime queuedAt;
  int retryCount;
  DateTime? lastAttemptAt;
  String? lastError;
}
```

Worker isolate:
- Poll queue setiap 15 detik saat online.
- Kirim request dengan `Idempotency-Key` yang sudah di-set saat queue.
- Retry backoff: 1s, 5s, 30s, 5m, ... maks 24 jam.
- Success (2xx) → hapus dari queue.
- 4xx non-retryable → mark failed, notify user.

Dedup: server balik cached response untuk key sama → klien mark success.

### 6.4. UI Flow Contoh (Start Shift)
1. User buka app.
2. Tap "Start Shift" → kamera terbuka.
3. Scan QR mesin → app POST `/qr/resolve`.
4. Response menampilkan mesin + button "Lanjut ke Setup Shift".
5. Halaman setup: pilih ShiftTemplate (dropdown dari cache lokal), pilih produk, tambah member (contact-picker style dari daftar user pabrik yang di-cache).
6. Tap "Mulai Shift" → POST `/shifts/start` dengan Idempotency-Key baru.
7. Response menampilkan carry-over handoff jika ada → tampilkan banner "Boks 1 akan partial karena carry-over 7.20 kg TSG".

### 6.5. Cached Data
Data yang di-cache lokal untuk offline UX:
- Master data: `Machine`, `Product`, `PlantProduct`, `ShiftTemplate`, `ShiftRole`, `ConsumableItem`, `Sparepart`, `DowntimeCategory`.
- User daftar di pabrik (untuk member picker).
- Cache di-refresh saat online, TTL 24 jam.

---

## 7. Anti-Forgery & Compliance

- **QR statis (`machine`)**: tidak butuh HMAC. Verifikasi cukup dengan lookup `qr_registry.uri`.
- **QR dinamis (`tsg`)**: HMAC WAJIB. Secret per plant, disimpan encrypted di server. Rotasi setahun sekali.
- **QR palsu / expired**: server return `400` dengan `code: QR_INVALID`. Log ke `qr_scan_log` dengan flag `suspicious`.
- **Print duplicate**: HQ_ADMIN bisa cetak ulang QR mesin, tapi yang lama otomatis `is_active=false`. Alert kalau lama masih di-scan.

---

## 8. Scope QR di App Mobile

Semua 4 jenis QR (machine, tsg, batch, pack) akan diimplementasi di aplikasi mobile ini. QR machine (statis) sudah pre-generated backend saat setup mesin — app hanya scan. QR dinamis (tsg, batch, pack) di-generate backend & di-print via label printer terpisah (bukan urusan mobile).

**Prioritas implementasi**:
1. **Machine QR scanner** — critical path untuk Start Shift.
2. **TSG Box QR scanner** — critical path untuk Open Boks (autofill dari inventory).
3. **Batch QR scanner** — untuk HLP scan batch saat pack.
4. **Pack QR scanner** — untuk QA/audit trace lineage (jarang, nice-to-have).

---

## 9. Referensi (dalam paket ini)
- [`02-api-contract.md`](./02-api-contract.md) §6 — endpoint QR resolve & scan-log.
- [`01-app-spec.md`](./01-app-spec.md) §6 — deep link handler & app flow.
- [`04-glossary.md`](./04-glossary.md) — istilah domain.
