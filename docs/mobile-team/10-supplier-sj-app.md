# 10 · Aplikasi Surat Jalan Supplier — API Contract & Flow

Kontrak API + alur aplikasi Flutter untuk fitur **Surat Jalan Supplier** (pre-labeling & pre-weighing TSG di gudang supplier).

**Versi**: v1.1.0 (2026-08-15) — _pool label generik + assign saat scan_
**Base URL**: (akan diberikan PM — staging/prod)
**Auth**: JWT Bearer, sama dengan kontrak [02-api-contract.md](./02-api-contract.md)

> **Status implementasi (untuk koordinasi PM):**
> - ✅ v1.0 (buat SJ + generate label per jenis) — **sudah live** di backend.
> - 🚧 v1.1 (dokumen ini: pool label + assign saat scan) — **desain target, backend BELUM dirilis**. Tim mobile silakan mulai bangun UI sesuai kontrak ini, tapi jadwal testing end-to-end menunggu pengumuman PM (migrasi DB 0007 + endpoint pool).

---

## 1. Ringkasan Fitur

Supplier selama ini mengirim surat jalan manual (kertas). Fitur ini memindahkan pencatatan ke sistem **sebelum barang sampai pabrik**, supaya saat receiving, jumlah & identitas boks sudah diketahui.

**Perubahan utama v1.1 — label tidak lagi digenerate saat membuat SJ.** Label dicetak sebagai **pool label generik** di **area office via web app** (bukan di app Flutter), dibawa petugas ke gudang supplier, lalu **di-assign ke SJ satu per satu saat discan** (scan = ikat ke SJ + pilih jenis TSG + input berat, satu langkah).

**Alasan**: petugas area bisa berangkat dengan stok label (mis. 100 label) tanpa perlu tahu dulu nomor SJ manual & jumlah boks per jenis — info itu sering baru jelas di lokasi. Satu stok label bisa dipakai beberapa hari/beberapa supplier.

**Tiga pengguna fitur ini:**

| # | Pengguna | Lokasi | Yang dilakukan |
|---|---|---|---|
| 1 | **Petugas Label Area** (role `AREA_SJ_OFFICER`) | **Area office (web)** | Cetak pool label generik (QR + ceklis jenis TSG), pantau sisa label |
| 2 | **Petugas Label Area** (role `AREA_SJ_OFFICER`) | Gudang supplier (app) | Buat SJ (input nomor SJ manual supplier) → scan label QR = assign + pilih jenis + input berat timbangan supplier → tandai SHIPPED saat truk berangkat |
| 3 | **Petugas Gudang Inbound Pabrik** (role `GUDANG_INBOUND`) | Pabrik (app) | Lihat SJ tujuan pabriknya → scan label boks yang datang → **validasi JUMLAH sesuai SJ** → terima (otomatis jadi receiving + inventory) |

> **Penting**: validasi di pabrik **hanya jumlah boks** (scan label dicocokkan dengan daftar label SJ). **Validasi berat di pabrik = TODO tahap berikutnya** (rencana: spot-check/timbang ulang). Berat real TSG tetap diinput nanti **saat masuk mesin Maker** (proses di tablet web, bukan di app ini).

---

## 2. Alur Bisnis

```
AREA OFFICE (web)                      GUDANG SUPPLIER (app)             PABRIK (app)
─────────────────────                  ─────────────────────             ─────────────
1. Login web (petugassj)
2. POST /supplier-sj/pool
   { count: 100 }
   → download PDF multi-halaman
   → cetak 100 label fisik
   (QR + centang jenis TSG)
3. Bawa label ke gudang
   supplier                        ─────►
                                       1. Login app (petugassj)
                                       2. POST /supplier-sj
                                          (nomor SJ manual, supplier,
                                           pabrik tujuan)
                                          → SJ DRAFT, 0 boks
                                       3. Boks ditimbang + ditempel
                                          label (centang jenis dengan
                                          spidol permanent)
                                       4. Scan QR label → POST boxes/weigh
                                          { boxCode, tsgType, beratKg }
                                          = assign ke SJ + jenis + berat
                                          (ulangi sampai semua boks)
                                       5. PATCH /supplier-sj → SHIPPED
                                          (gagal kalau ada label
                                           di SJ belum ditimbang)    ─────►
                                                                         1. Truk datang → scan tiap label
                                                                            → cocokkan jumlah dengan SJ
                                                                         2. POST /tsg-receiving/from-sj
                                                                            { verifiedBoxCodes }
                                                                            → receiving + inventory
                                                                            + SJ RECEIVED
```

---

## 3. Label Fisik (cetak via web, area office)

Dicetak dari **web app** di area office — **bukan** dari app Flutter (tahap ini app tidak mencetak).

### 3.1. Desain label (100×75mm, direct thermal)

```
┌─────────────────────────────────────────┐
│ ┌───────────────┐   ┌───────────────┐   │
│ │               │   │ [ ] REGULER   │   │
│ │   QR CODE     │   │ [ ] MILD      │   │
│ │   44×44mm     │   │ [ ] PUTIHAN   │   │
│ │  (boxCode)    │   │               │   │
│ └───────────────┘   │               │   │
│  SCAN SAAT TIMBANG  └───────────────┘   │
│  Pindai QR sebelum                      │
│  menimbang boks                         │
│                                         │
│         TSG-20260815-001                │
└─────────────────────────────────────────┘
```

- **Kiri (±48mm)**: QR 44×44mm (QR asli berisi `boxCode`) + caption **"SCAN SAAT TIMBANG"** (10pt bold) + hint "Pindai QR sebelum menimbang boks".
- **Kanan**: 3 baris ceklis jenis TSG — kotak centang 7mm + nama jenis **16pt bold** (REGULER/MILD/PUTIHAN). Komposisi sedikit condong ke kiri (margin kanan lebih longgar).
- **Bawah**: kode boks `boxCode` tercetak **16pt bold** — fallback kalau QR rusak (petugas bisa ketik manual di app).
- **Tanpa** header, tanpa judul "JENIS TSG", tanpa baris "No. SJ", tanpa garis pemisah — label minimalis, fokus ke QR + centang + kode.
- **Material: direct thermal** (bukan thermal transfer/BOPP) karena printer **XPrinter 420B**. Centang jenis memakai **spidol permanent** — tes material sebelum produksi massal.
- Ceklis di kertas **tidak terbaca sistem** — murni alat bantu sortir fisik pekerja gudang supplier. Jenis yang masuk sistem adalah yang **dipilih di app saat scan** (§4.7). UI app wajib menampilkan pilihan jenis secara besar + konfirmasi agar tidak beda dengan centang kertas.
- Rekomendasi operasional: label tamper-evident.

### 3.1a. Cetak PDF multi-halaman (XPrinter 420B)

- Web generate **PDF multi-halaman**: 1 label = 1 halaman, ukuran halaman presisi 100×75mm.
- Alur: halaman web input jumlah label (1–500) → generate → **download PDF** → buka di PDF viewer → Print (Ctrl+P) → XPrinter 420B → paper custom 100×75mm → **scale 100%** (jangan "fit to page").
- Download dulu (bukan print langsung) supaya bisa cetak ulang sisa label lain waktu tanpa regenerate — selama kodenya belum terpakai.
- Setup driver XPrinter 420B (sekali): custom paper size 100×75mm. Max print width 420B = 108mm → label 100mm aman.

### 3.2. Sisa pool & cetak ulang

- `GET /supplier-sj/pool` (web) menampilkan sisa label belum terpakai per tanggal cetak.
- Saat buat SJ di app, response berisi `poolAvailable` (sisa label yang bisa di-assign) — petugas bisa cek sebelum mulai scan. **SOP**: bawa cadangan label; kalau label fisik habis di lokasi, petugas harus balik ke office untuk cetak lagi (app tidak bisa menambah label).

---

## 4. Endpoints

### 4.1. Auth

`POST /api/v1/auth/login` — identik kontrak 02. **Untuk tahap pengembangan gunakan `deviceType: "WEB"`** (aturan single-session khusus `MOBILE` belum diberlakukan untuk fitur ini).

```json
{ "username": "petugassj", "password": "12345678", "deviceType": "WEB" }
```

**Response**: `{ accessToken, refreshToken, user, roles }` — simpan accessToken, kirim via header `Authorization: Bearer <token>`.

### 4.2. Opsi Form Pembuatan SJ

`GET /api/v1/supplier-sj/options` — permission `supplier.sj.create`

```json
{
  "data": {
    "suppliers": [ { "id": "…", "code": "SUP-JAWA-01", "name": "PT Supplier Jawa" } ],
    "plants":    [ { "id": "…", "code": "PLT-PMK-01", "name": "Pabrik Malang 1" } ]
  }
}
```

### 4.3. Cetak Pool Label (WEB SAJA — area office)

`POST /api/v1/supplier-sj/pool` — permission **`supplier.sj.pool`** (baru, web-only)

```json
{ "count": 100 }
```

**Response 201**:
```json
{
  "boxCodes": ["TSG-20260815-001", "TSG-20260815-002", "…"],
  "available": 100
}
```

- `count` 1–500. Error `POOL_COUNT_INVALID` di luar rentang.
- Kode label pakai **format kode boks TSG yang sudah ada di DB**: `TSG-<YYYYMMDD>-<NNN 3 digit>` (sama dengan `tsg_receiving_box.box_code`). Tanggal = **tanggal cetak**. Sequence global — dihitung dari kode boks receiving + pool yang sudah ada agar tidak bentrok saat receiving.
- Label lahir berstatus **AVAILABLE** (belum terikat SJ mana pun, tanpa jenis).
- Halaman web menampilkan `boxCodes` untuk dicetak dengan desain §3.1 (download PDF multi-halaman, §3.1a).

`GET /api/v1/supplier-sj/pool` — permission `supplier.sj.pool`

```json
{
  "data": {
    "available": 87,
    "assigned": 13,
    "voided": 0,
    "byPrintDate": [ { "date": "2026-08-15", "available": 87 } ]
  }
}
```

### 4.4. Buat Surat Jalan (tanpa label)

`POST /api/v1/supplier-sj` — permission `supplier.sj.create`

```json
{
  "sjNumber": "SJ-0815-001",
  "supplierId": "…uuid…",
  "plantId": "…uuid…"
}
```

**Response 201**:
```json
{
  "sjId": "…uuid…",
  "sjNumber": "SJ-0815-001",
  "status": "DRAFT",
  "poolAvailable": 87
}
```

- **Tidak ada lagi field `labels`** (v1.0). SJ lahir dengan **0 boks**; boks masuk saat label discan (§4.7).
- `poolAvailable` = sisa label AVAILABLE yang bisa di-assign — tampilkan di UI sebelum mulai scan.
- Nomor SJ manual **unik per supplier** — error `SJ_NUMBER_EXISTS` kalau dobel.
- Satu SJ bisa **multi jenis TSG** — komposisi jenis terbentuk dari hasil scan, bukan dideklarasikan di awal.

### 4.5. Daftar & Detail SJ

`GET /api/v1/supplier-sj?status=DRAFT|SHIPPED|RECEIVED` — permission `supplier.sj.view`

```json
{
  "data": [
    {
      "id": "…", "sjNumber": "SJ-0815-001",
      "supplierId": "…", "supplierName": "PT Supplier Jawa",
      "plantId": "…", "plantCode": "PLT-PMK-01",
      "status": "DRAFT", "shippedAt": null, "receivedAt": null,
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
    { "id": "…", "boxCode": "TSG-20260815-001", "labelStatus": "ASSIGNED",
      "tsgType": "REGULER", "supplierWeightKg": "29.75", "enteredAt": "…" },
    { "id": "…", "boxCode": "TSG-20260815-002", "labelStatus": "ASSIGNED",
      "tsgType": "MILD", "supplierWeightKg": null, "enteredAt": null }
  ]
}
```

> RLS: petugas area (scope REGION) melihat semua SJ di area-nya; gudang inbound (scope PLANT) hanya melihat SJ tujuan pabriknya. Label pool (belum terikat SJ) hanya terlihat oleh petugas area.

### 4.6. Resolve Label (hasil scan QR)

`GET /api/v1/supplier-sj/labels/:boxCode` — permission `supplier.sj.view`

**Label masih di pool (belum terikat):**
```json
{
  "boxCode": "TSG-20260815-001",
  "labelStatus": "AVAILABLE",
  "tsgType": null,
  "supplierWeightKg": null,
  "enteredAt": null,
  "sjId": null, "sjNumber": null, "sjStatus": null,
  "supplierName": null, "plantCode": null
}
```

**Label sudah terikat SJ:**
```json
{
  "boxCode": "TSG-20260815-001",
  "labelStatus": "ASSIGNED",
  "tsgType": "REGULER",
  "supplierWeightKg": "29.75",
  "enteredAt": "…",
  "sjId": "…", "sjNumber": "SJ-0815-001", "sjStatus": "SHIPPED",
  "supplierName": "PT Supplier Jawa",
  "plantCode": "PLT-PMK-01"
}
```

`404 LABEL_NOT_FOUND` kalau kode tidak dikenal. `labelStatus: "VOID"` untuk label yang ditandai hilang/rusak.

### 4.7. Scan Label = Assign + Jenis + Berat (satu langkah)

`POST /api/v1/supplier-sj/:id/boxes/weigh` — permission `supplier.sj.label`

```json
{ "boxCode": "TSG-20260815-001", "tsgType": "REGULER", "supplierWeightKg": 29.75 }
```

**Response 200**:
```json
{ "boxId": "…", "boxCode": "TSG-20260815-001", "labelStatus": "ASSIGNED",
  "tsgType": "REGULER", "supplierWeightKg": "29.75", "enteredAt": "…" }
```

- Label `AVAILABLE` → langsung **di-assign ke SJ ini** + jenis + berat dicatat (satu panggilan).
- Label sudah ASSIGNED ke SJ ini tapi belum ditimbang → tinggal isi berat (`tsgType` mengikuti hasil assign pertama).
- Berat 0–100 kg. Error `INVALID_BOX_WEIGHT` di luar rentang.
- `tsgType` wajib — pilihan besar + konfirmasi di UI agar konsisten dengan centang kertas.

### 4.8. Tandai VOID (label hilang/rusak)

`POST /api/v1/supplier-sj/labels/:boxCode/void` — permission `supplier.sj.label`

**Response 200**: `{ "boxCode": "TSG-20260815-001", "labelStatus": "VOID" }`

- Hanya label **AVAILABLE** yang bisa di-VOID (belum terikat SJ). Error `LABEL_NOT_AVAILABLE` selain itu.
- Label VOID tidak bisa di-assign dan tidak masuk hitungan pool.

### 4.9. Tandai SHIPPED

`PATCH /api/v1/supplier-sj/:id` — permission `supplier.sj.create`

```json
{ "status": "SHIPPED" }
```

**Response 200**: `{ "sjId": "…", "status": "SHIPPED", "boxCount": 17 }`

- Error `SJ_HAS_UNWEIGHED_BOXES` kalau masih ada label di SJ tanpa berat.
- Error `SJ_EMPTY` kalau SJ belum punya boks sama sekali.

### 4.10. Validasi Jumlah di Pabrik & Terima

`POST /api/v1/tsg-receiving/from-sj` — permission `tsg.receiving.create` (role GUDANG_INBOUND)

```json
{
  "supplierSjId": "…uuid…",
  "verifiedBoxCodes": ["TSG-20260815-001", "TSG-20260815-002", "…"]
}
```

- `verifiedBoxCodes` = semua label yang discan saat bongkar. Server mencocokkan **jumlah & identitas** dengan daftar label SJ.
- **Hanya validasi jumlah** di tahap ini — **tidak per jenis TSG** (SJ 10 REGULER + 5 MILD yang datang 9+5 tetap lolos asal 14 label cocok). Validasi berat & per jenis = TODO tahap berikutnya.
- Berat supplier langsung dipakai sebagai berat receiving.

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

### 4.11. (Web admin) Approve Receiving Manual

`POST /api/v1/tsg-receiving/:id/approve` — permission `tsg.receiving.approve` — untuk receiving manual **tanpa SJ** (fallback). Dilakukan via web admin, bukan app ini.

---

## 5. Kode Error Fitur Ini

| Code | HTTP | Arti |
|---|---|---|
| `SJ_NUMBER_EXISTS` | 409 | Nomor SJ manual sudah terdaftar untuk supplier tsb |
| `PLANT_OUT_OF_SCOPE` | 403 | Pabrik tujuan di luar scope user |
| `POOL_COUNT_INVALID` | 409 | Jumlah label pool di luar 1–500 |
| `SJ_NOT_FOUND` | 404 | SJ tidak ada / tidak terlihat (RLS) |
| `LABEL_NOT_FOUND` | 404 | Kode label tidak dikenal |
| `LABEL_NOT_AVAILABLE` | 409 | Operasi butuh label AVAILABLE (mis. VOID label yang sudah terikat) |
| `LABEL_ALREADY_ASSIGNED` | 409 | Label sudah terikat SJ lain |
| `LABEL_VOIDED` | 409 | Label sudah di-VOID (hilang/rusak) |
| `LABEL_ALREADY_WEIGHED` | 409 | Label sudah punya berat |
| `INVALID_BOX_WEIGHT` | 409 | Berat di luar 0–100 kg |
| `SJ_NOT_DRAFT` | 409 | Operasi hanya untuk SJ DRAFT |
| `SJ_EMPTY` | 409 | SJ belum punya boks (SHIPPED) |
| `SJ_HAS_UNWEIGHED_BOXES` | 409 | Masih ada label di SJ belum ditimbang |
| `SJ_NOT_SHIPPED` | 409 | SJ belum berstatus SHIPPED |
| `SJ_WRONG_PLANT` | 409 | SJ ditujukan ke pabrik lain |
| `SJ_COUNT_MISMATCH` | 409 | Jumlah/identitas boks tidak sesuai SJ (validasi pabrik) |

Format error standar mengikuti [02-api-contract.md](./02-api-contract.md) §1.5.

---

## 6. Role & Test User

| Username | Password | Role | Scope |
|---|---|---|---|
| `petugassj` | `12345678` | `AREA_SJ_OFFICER` (Petugas Label Area) | REGION (area) |
| `gudangin` | `12345678` | `GUDANG_INBOUND` | PLANT |

Permission relevan:

| Permission | Area Officer (app) | Area Officer (web) | Gudang Inbound |
|---|---|---|---|
| `supplier.sj.create` | ✅ | ✅ | ❌ |
| `supplier.sj.view` | ✅ | ✅ | ✅ |
| `supplier.sj.label` | ✅ | ✅ | ❌ |
| `supplier.sj.pool` | ❌ (web only) | ✅ | ❌ |
| `tsg.receiving.create` | ❌ | ❌ | ✅ |
| `tsg.receiving.view` | ✅ | ✅ | ✅ |

> Catatan backend (untuk PM): label pool butuh `plant_id` nullable + policy RLS khusus (label tanpa plant hanya terlihat petugas area) — masuk migrasi 0007 bersama status label `AVAILABLE/ASSIGNED/VOID`.

---

## 7. TODO Tahap Berikutnya (disepakati, belum diimplementasi)

1. **Validasi berat saat receiving di pabrik** — timbang ulang (atau spot-check sampel) → bandingkan dengan berat supplier → tandai VARIANCE kalau selisih > toleransi. Saat ini berat supplier dipakai langsung.
2. **Validasi jumlah per jenis TSG** saat receiving — saat ini validasi hanya total jumlah & identitas label.
3. **Laporan selisih berat** supplier vs real (real diinput saat masuk Maker) — per supplier & per pabrik, untuk investigasi losses.
4. **Opname gudang berkala** — timbang fisik inventory vs sistem.
5. Label fisik **tamper-evident** (rekomendasi operasional).
6. Status `DISPUTED` untuk SJ/selisih yang ditolak.
