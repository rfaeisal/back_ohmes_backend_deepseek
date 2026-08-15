# 10 · Aplikasi Surat Jalan Supplier — API Contract & Flow

Kontrak API + alur aplikasi Flutter untuk fitur **Surat Jalan Supplier** (pre-labeling & pre-weighing TSG di gudang supplier).

**Versi**: v1.0.0 (2026-08-15)
**Base URL**: (akan diberikan PM — staging/prod)
**Auth**: JWT Bearer, sama dengan kontrak [02-api-contract.md](./02-api-contract.md)

---

## 1. Ringkasan Fitur

Supplier selama ini mengirim surat jalan manual (kertas). Fitur ini memindahkan pencatatan ke sistem **sebelum barang sampai pabrik**, supaya saat receiving, jumlah & identitas boks sudah diketahui.

**Dua pengguna aplikasi ini:**

| # | Pengguna | Lokasi | Yang dilakukan di app |
|---|---|---|---|
| 1 | **Petugas Label Area** (role `AREA_SJ_OFFICER`) | Gudang supplier | Buat Surat Jalan (input nomor SJ manual supplier) → scan label QR → input berat timbangan supplier per boks → tandai SHIPPED saat truk berangkat |
| 2 | **Petugas Gudang Inbound Pabrik** (role `GUDANG_INBOUND`) | Pabrik | Lihat SJ tujuan pabriknya → scan label boks yang datang → **validasi JUMLAH sesuai SJ** → terima (otomatis jadi receiving + inventory) |

> **Penting — tahap ini**: validasi di pabrik **hanya jumlah boks** (scan label dicocokkan dengan daftar label SJ). **Validasi berat di pabrik = TODO tahap berikutnya** (rencana: spot-check/timbang ulang). Berat real TSG tetap diinput nanti **saat masuk mesin Maker** (proses di tablet web, bukan di app ini).

---

## 2. Alur Bisnis

```
PETUGAS AREA (gudang supplier)                GUDANG INBOUND (pabrik)
──────────────────────────────                ────────────────────────
1. Login (petugassj)
2. GET /supplier-sj/options
   → pilih supplier + pabrik tujuan
3. POST /supplier-sj
   → input nomor SJ manual supplier
   → pilih jumlah label per jenis TSG
   → dapat daftar boxCode (cetak label QR)
4. Boks ditimbang petugas gudang supplier
5. Scan QR label → POST boxes/weigh
   (ulangi sampai semua label)
6. PATCH /supplier-sj → SHIPPED               1. Login (gudangin)
   (gagal kalau ada label belum ditimbang)    2. GET /supplier-sj?status=SHIPPED
                                              3. Truk datang → scan tiap label
                                                 → cocokkan jumlah dengan SJ
                                              4. POST /tsg-receiving/from-sj
                                                 { verifiedBoxCodes }
                                                 → receiving + inventory + SJ RECEIVED
```

---

## 3. Endpoints

### 3.1. Auth

`POST /api/v1/auth/login` — identik kontrak 02. **Untuk tahap pengembangan gunakan `deviceType: "WEB"`** (aturan single-session khusus `MOBILE` belum diberlakukan untuk fitur ini).

```json
{ "username": "petugassj", "password": "12345678", "deviceType": "WEB" }
```

**Response**: `{ accessToken, refreshToken, user, roles }` — simpan accessToken, kirim via header `Authorization: Bearer <token>`.

### 3.2. Opsi Form Pembuatan SJ

`GET /api/v1/supplier-sj/options` — permission `supplier.sj.create`

```json
{
  "data": {
    "suppliers": [ { "id": "…", "code": "SUP-JAWA-01", "name": "PT Supplier Jawa" } ],
    "plants":    [ { "id": "…", "code": "PLT-PMK-01", "name": "Pabrik Malang 1" } ]
  }
}
```

### 3.3. Buat Surat Jalan + Generate Label

`POST /api/v1/supplier-sj` — permission `supplier.sj.create`

```json
{
  "sjNumber": "SJ-0815-001",
  "supplierId": "…uuid…",
  "plantId": "…uuid…",
  "labels": [
    { "tsgType": "REGULER", "count": 10 },
    { "tsgType": "MILD",    "count": 5 },
    { "tsgType": "PUTIHAN", "count": 2 }
  ]
}
```

**Response 201**:
```json
{
  "sjId": "…uuid…",
  "sjNumber": "SJ-0815-001",
  "status": "DRAFT",
  "labels": ["SJL-20260815-0001", "SJL-20260815-0002", "…"]
}
```

- `labels` = daftar `boxCode` untuk dicetak sebagai label QR (satu per boks).
- Konten QR label = `boxCode` itu sendiri. Label fisik disarankan **tamper-evident** + tercetak: jenis TSG, nomor SJ, pabrik tujuan (untuk dibaca manusia).
- Nomor SJ manual **unik per supplier** — error `SJ_NUMBER_EXISTS` kalau dobel.

### 3.4. Daftar & Detail SJ

`GET /api/v1/supplier-sj?status=DRAFT|SHIPPED|RECEIVED` — permission `supplier.sj.view`

```json
{
  "data": [
    {
      "id": "…", "sjNumber": "SJ-0815-001",
      "supplierId": "…", "supplierName": "PT Supplier Jawa",
      "plantId": "…", "plantCode": "PLT-PMK-01",
      "status": "SHIPPED", "shippedAt": "…", "receivedAt": null,
      "note": null, "createdAt": "…"
    }
  ]
}
```

`GET /api/v1/supplier-sj/:id` — sama + `boxes`:

```json
{
  "…": "…",
  "boxes": [
    { "id": "…", "boxCode": "SJL-20260815-0001", "tsgType": "REGULER",
      "supplierWeightKg": "29.75", "enteredAt": "…" },
    { "id": "…", "boxCode": "SJL-20260815-0002", "tsgType": "REGULER",
      "supplierWeightKg": null, "enteredAt": null }
  ]
}
```

> RLS: petugas area (scope REGION) melihat semua SJ di area-nya; gudang inbound (scope PLANT) hanya melihat SJ tujuan pabriknya.

### 3.5. Resolve Label (hasil scan QR)

`GET /api/v1/supplier-sj/labels/:boxCode` — permission `supplier.sj.view`

```json
{
  "boxCode": "SJL-20260815-0001",
  "tsgType": "REGULER",
  "supplierWeightKg": "29.75",
  "enteredAt": "…",
  "sjId": "…", "sjNumber": "SJ-0815-001", "sjStatus": "SHIPPED",
  "supplierName": "PT Supplier Jawa",
  "plantCode": "PLT-PMK-01"
}
```

`supplierWeightKg = null` → label belum ditimbang (petugas area boleh isi). `404 LABEL_NOT_FOUND` kalau kode tidak dikenal.

### 3.6. Scan Label + Input Berat Supplier

`POST /api/v1/supplier-sj/:id/boxes/weigh` — permission `supplier.sj.label`

```json
{ "boxCode": "SJL-20260815-0001", "supplierWeightKg": 29.75 }
```

**Response 200**:
```json
{ "boxId": "…", "boxCode": "SJL-20260815-0001", "tsgType": "REGULER",
  "supplierWeightKg": "29.75", "enteredAt": "…" }
```

- Berat 0–100 kg. Error `LABEL_NOT_FOUND` (bukan bagian SJ ini), `LABEL_ALREADY_WEIGHED` (dobel input), `SJ_NOT_DRAFT` (SJ sudah dikirim/diterima).

### 3.7. Tandai SHIPPED

`PATCH /api/v1/supplier-sj/:id` — permission `supplier.sj.create`

```json
{ "status": "SHIPPED" }
```

**Response 200**: `{ "sjId": "…", "status": "SHIPPED", "boxCount": 17 }`

- Error `SJ_HAS_UNWEIGHED_BOXES` kalau masih ada label tanpa berat — semua boks wajib tertimbang sebelum truk berangkat.

### 3.8. Validasi Jumlah di Pabrik & Terima

`POST /api/v1/tsg-receiving/from-sj` — permission `tsg.receiving.create` (role GUDANG_INBOUND)

```json
{
  "supplierSjId": "…uuid…",
  "verifiedBoxCodes": ["SJL-20260815-0001", "SJL-20260815-0002", "…"]
}
```

- `verifiedBoxCodes` = semua label yang discan saat bongkar. Server mencocokkan **jumlah & identitas** dengan daftar label SJ.
- **Hanya validasi jumlah** di tahap ini. Berat **tidak** divalidasi di pabrik (TODO tahap berikutnya) — berat supplier langsung dipakai sebagai berat receiving.

**Response 201**:
```json
{
  "receivingId": "…", "receivingCode": "RCV-20260815-01",
  "totalBoxCount": 17, "totalWeightKg": 505.30,
  "inventoryCreated": 17, "sjStatus": "RECEIVED"
}
```

- Error `SJ_COUNT_MISMATCH` + details `{ missingBoxCodes, unknownBoxCodes, sjBoxCount, verifiedCount }` kalau jumlah/identitas tidak cocok.
- `SJ_NOT_SHIPPED` kalau SJ belum SHIPPED; `SJ_WRONG_PLANT` kalau SJ bukan tujuan pabrik ini.

### 3.9. (Web admin) Approve Receiving Manual

`POST /api/v1/tsg-receiving/:id/approve` — permission `tsg.receiving.approve` — untuk receiving manual **tanpa SJ** (fallback). Dilakukan via web admin, bukan app ini.

---

## 4. Kode Error Fitur Ini

| Code | HTTP | Arti |
|---|---|---|
| `SJ_NUMBER_EXISTS` | 409 | Nomor SJ manual sudah terdaftar untuk supplier tsb |
| `INVALID_LABEL_COUNT` | 409 | Total label 1–500, per jenis ≥1 |
| `PLANT_OUT_OF_SCOPE` | 403 | Pabrik tujuan di luar scope user |
| `SJ_NOT_FOUND` | 404 | SJ tidak ada / tidak terlihat (RLS) |
| `LABEL_NOT_FOUND` | 404/409 | Label tidak ditemukan / bukan bagian SJ |
| `LABEL_ALREADY_WEIGHED` | 409 | Label sudah punya berat |
| `INVALID_BOX_WEIGHT` | 409 | Berat di luar 0–100 kg |
| `SJ_NOT_DRAFT` | 409 | Operasi hanya untuk SJ DRAFT |
| `SJ_HAS_UNWEIGHED_BOXES` | 409 | Masih ada label belum ditimbang |
| `SJ_NOT_SHIPPED` | 409 | SJ belum berstatus SHIPPED |
| `SJ_WRONG_PLANT` | 409 | SJ ditujukan ke pabrik lain |
| `SJ_COUNT_MISMATCH` | 409 | Jumlah/identitas boks tidak sesuai SJ (validasi pabrik) |

Format error standar mengikuti [02-api-contract.md](./02-api-contract.md) §1.5.

---

## 5. Role & Test User

| Username | Password | Role | Scope |
|---|---|---|---|
| `petugassj` | `12345678` | `AREA_SJ_OFFICER` (Petugas Label Area) | REGION (area) |
| `gudangin` | `12345678` | `GUDANG_INBOUND` | PLANT |

Permission relevan:

| Permission | Area Officer | Gudang Inbound |
|---|---|---|
| `supplier.sj.create` | ✅ | ❌ |
| `supplier.sj.view` | ✅ | ✅ |
| `supplier.sj.label` | ✅ | ❌ |
| `tsg.receiving.create` | ❌ | ✅ |
| `tsg.receiving.view` | ✅ | ✅ |

---

## 6. TODO Tahap Berikutnya (disepakati, belum diimplementasi)

1. **Validasi berat saat receiving di pabrik** — timbang ulang (atau spot-check sampel) → bandingkan dengan berat supplier → tandai VARIANCE kalau selisih > toleransi. Saat ini berat supplier dipakai langsung.
2. **Laporan selisih berat** supplier vs real (real diinput saat masuk Maker) — per supplier & per pabrik, untuk investigasi losses.
3. **Opname gudang berkala** — timbang fisik inventory vs sistem.
4. Label fisik **tamper-evident** (rekomendasi operasional).
5. Status `DISPUTED` untuk SJ/selisih yang ditolak.
