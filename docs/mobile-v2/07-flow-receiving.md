# 07 · Flow Receiving TSG di Pabrik — Mobile Flutter

Alur penerimaan TSG di gudang pabrik untuk tim mobile Flutter (rebuild dari nol). **Tanpa spec layar detail** — spec layar menyusul; dokumen ini mendefinisikan alur, endpoint, validasi, dan state machine. Kontrak payload lengkap ada di `03-api-contract.md` seri ini.

Sumber kebenaran: kode aktif `src/app/api/v1/tsg-receiving/**`, `src/app/api/v1/tsg-inventory/**`, `src/app/api/v1/tsg-transfers/**`, `src/lib/services/wms-inbound.service.ts`, `src/lib/services/supplier-sj.service.ts` (fungsi `receiveFromSupplierSj`), dan `src/db/schema/wms-inbound.ts`.

**Versi kontrak**: SJ v1.1 + receiving. Base URL & auth sama dengan `06-flow-supplier-sj.md` (JWT Bearer, login `deviceType: MOBILE` + `deviceId`).

---

## 1. Konteks & Aktor

| Role | Scope | Peran di receiving |
|---|---|---|
| `GUDANG_INBOUND` (petugas gudang inbound pabrik) | PLANT | Bongkar truk: scan label boks yang datang → validasi jumlah vs SJ → terima via `from-sj` (otomatis jadi receiving + inventory). Juga bisa membuat receiving **manual** (tanpa SJ) — menerima butuh approve PLANT_MANAGER. |
| `PLANT_MANAGER` | PLANT | **Approve receiving manual** (`tsg.receiving.approve`) — momen inilah boks masuk inventory untuk receiving manual. Untuk receiving via SJ tidak perlu approve (langsung APPROVED). |

Test user: `gudangin` / `plantmanager` (password `12345678`).

**Pembagian kerja**: receiving **via SJ** = alur utama harian (barang dikirim supplier pakai SJ). Receiving **manual** = fallback (barang datang tanpa SJ / SJ tidak dipakai).

---

## 2. Alur Bisnis End-to-End

### 2.1. Alur utama — via Surat Jalan (`from-sj`)

```
TRUK TIBA DI PABRIK (GUDANG_INBOUND, Flutter)
─────────────────────────────────────────────
1. Login app (gudangin) → lihat daftar SJ tujuan pabriknya
   (GET /supplier-sj?status=SHIPPED — hanya SJ plant ini via RLS/scope)
2. Buka SJ → scan QR tiap label boks saat bongkar:
   GET /supplier-sj/labels/:boxCode
   → pastikan label ASSIGNED & milik SJ ini (labelStatus = ASSIGNED,
     sjNumber cocok). Label yang sudah dipakai SJ lain / VOID / tidak
     dikenal → ditolak dari kandidat verifikasi.
   → kumpulkan semua boxCode terverifikasi: verifiedBoxCodes[]
   (progress UI: "terverifikasi X dari N" — N = total boks di SJ)
3. Cek: kalau ada boks yang TIDAK discan (selisih) → detail selisih
   (dari error SJ_COUNT_MISMATCH: missingBoxCodes / unknownBoxCodes)
   → putuskan: scan ulang / konfirmasi kirim apa adanya? TIDAK —
   server menolak kalau daftar tidak persis sama dengan label SJ.
4. POST /tsg-receiving/from-sj { supplierSjId, verifiedBoxCodes }
   → 201: receiving dibuat langsung APPROVED + inventory AVAILABLE
     per boks + SJ → RECEIVED. Selesai — tidak ada approve tambahan.
```

### 2.2. Alur fallback — receiving manual (tanpa SJ)

```
1. (GUDANG_INBOUND) POST /tsg-receiving { supplierId, boxes: [
     { boxCode, weightKg, tsgType } ... ] }
   → receiving dibuat status approvalStatus = PENDING,
     inventory BELUM dibuat (inventoryCreated: 0).
   (boks tanpa SJ perlu kode boks baru — format TSG-YYYYMMDD-NNN
    dipilih petugas/manual; pastikan unik global)
2. (PLANT_MANAGER) POST /tsg-receiving/:id/approve
   → inventory dibuat (status AVAILABLE) + approvalStatus = APPROVED.
3. Boks baru benar-benar tersedia untuk produksi SETELAH approve.
```

### 2.3. Catatan validasi

- **Hanya validasi jumlah & identitas label** saat ini. **Tidak** per jenis TSG dan **tidak** menimbang ulang — berat supplier (`supplierWeightKg` di label SJ) langsung dipakai sebagai `weightKg` receiving. Validasi berat di pabrik = TODO tahap berikutnya (spot-check/variance).
- Satu SJ hanya bisa direceive **sekali** — setelah `RECEIVED`, tidak bisa diulang (`SJ_NOT_SHIPPED` karena status sudah RECEIVED).

---

## 3. Daftar Endpoint yang Dipakai

| # | Endpoint | Permission | Pemakaian |
|---|---|---|---|
| 1 | `GET /api/v1/supplier-sj?status=SHIPPED` | `supplier.sj.view` | Daftar SJ tujuan pabrik yang siap diterima |
| 2 | `GET /api/v1/supplier-sj/:id` | `supplier.sj.view` | Detail SJ + daftar label (`boxes[]`) sebagai target verifikasi |
| 3 | `GET /api/v1/supplier-sj/labels/:boxCode` | `supplier.sj.view` | Resolve hasil scan label (cek ASSIGNED + SJ mana) |
| 4 | `POST /api/v1/tsg-receiving/from-sj` | `tsg.receiving.create` | **Alur utama**: terima via SJ → receiving + inventory + SJ RECEIVED |
| 5 | `POST /api/v1/tsg-receiving` | `tsg.receiving.create` | Alur fallback: receiving manual (PENDING) |
| 6 | `GET /api/v1/tsg-receiving?from=&to=&includeBoxes=true` | `tsg.receiving.view` | Riwayat receiving (filter tanggal; `includeBoxes` menambah `boxes[]` per item) |
| 7 | `POST /api/v1/tsg-receiving/:id/approve` | `tsg.receiving.approve` | Approve receiving manual — **hanya PLANT_MANAGER** (dan SUPERADMIN) |
| 8 | `GET /api/v1/tsg-inventory/available?plantId=&limit=` | `tsg.inventory.view` | Cek stok hasil receiving (FIFO, tertua di atas) |

> Role yang boleh: `GUDANG_INBOUND` punya #1–#6 + #8 (dan writeoff/transfer). `PLANT_MANAGER` punya #4–#8 + approve (#7). `AREA_COORDINATOR`/`AREA_QA` hanya melihat (#2, #3, #6, #8) — tidak menerima.

Catatan implementasi:
- `from-sj` dan receiving manual memakai `plantId = ctx.user.plantIds[0]` (scope dari token) — client **tidak mengirim plantId**; kalau user tidak punya scope → `NO_PLANT_SCOPE` (403).
- Semua POST wajib Idempotency-Key (retry aman saat jaringan bermasalah).

---

## 4. Aturan Validasi

### 4.1. `verifiedBoxCodes` (alur from-sj)

- Body: `{ supplierSjId: uuid, verifiedBoxCodes?: string[] }` (opsional — kalau dihilangkan, server menerima **semua** label SJ; kalau dikirim, harus **persis sama**).
- Client disarankan SELALU mengirim `verifiedBoxCodes` hasil scan (prinsip verifikasi fisik di lapangan).
- Aturan persis (dari `receiveFromSupplierSj`):
  1. Semua label SJ harus ada di daftar scan — ada yang kurang → `SJ_COUNT_MISMATCH` dengan `details.missingBoxCodes`.
  2. Tidak boleh ada kode yang bukan label SJ — ada yang asing → `SJ_COUNT_MISMATCH` dengan `details.unknownBoxCodes`.
  3. Jumlah unik hasil scan harus sama dengan `boxes.length` → kalau beda → `SJ_COUNT_MISMATCH` dengan `details: { sjBoxCount, verifiedCount }`.
- **Tidak ada retry parsial**: satu daftar yang tidak persis = satu error; client menampilkan detail selisih (kode yang kurang = belum discan; kode asing = salah SJ / salah stok label).

### 4.2. Validasi lain di `from-sj`

| Kondisi | Error |
|---|---|
| SJ tidak ada / tidak terlihat | `SJ_NOT_FOUND` |
| SJ untuk pabrik lain (RLS scope beda) | `SJ_WRONG_PLANT` |
| SJ belum SHIPPED (masih DRAFT / sudah RECEIVED) | `SJ_NOT_SHIPPED` |
| SJ tanpa label | `SJ_EMPTY` |
| User tidak punya plant scope | `NO_PLANT_SCOPE` |
| Zod fail | `VALIDATION_ERROR` |

### 4.3. Receiving manual

- `boxes` minimal 1; per boks: `boxCode` unik global, `weightKg` **> 0 s.d. 100**, `tsgType` default `REGULER`.
- `SUPPLIER_NOT_FOUND` / `SUPPLIER_INACTIVE` kalau supplier tidak aktif; `INVALID_BOX_WEIGHT` kalau berat di luar rentang.
- Approve: `RECEIVING_NOT_FOUND`, `RECEIVING_WRONG_PLANT`, `RECEIVING_ALREADY_APPROVED`.

---

## 5. Status / State Machine

### 5.1. SJ (dari `supplier_sj.status`)

```
DRAFT → SHIPPED → RECEIVED   (via from-sj; lihat 06-flow-supplier-sj.md §5.1)
```

Receiving hanya bisa dilakukan pada status **SHIPPED**.

### 5.2. Receiving (kolom `approval_status` — text, `PENDING | APPROVED`)

```
from-sj:   (dibuat langsung) ──► APPROVED        (inventory langsung dibuat)
manual:    (dibuat) ──► PENDING ──approve──► APPROVED   (inventory dibuat saat approve)
```

- `source`: `SJ` atau `MANUAL` (kolom `source`).
- `approvalStatus` default schema "APPROVED", tapi service receiving manual menulis `PENDING` eksplisit.
- `RECEIVING_ALREADY_APPROVED` kalau approve diulang.

### 5.3. Boks & inventory (dari `tsg_inventory.status`, enum `tsg_inventory_status`)

```
receiving APPROVED ──► AVAILABLE (siap FIFO untuk produksi)
AVAILABLE ──(buka boks shift)──► ALLOCATED ──► USED
AVAILABLE ──(writeoff)──► WRITTEN_OFF
AVAILABLE ──(transfer)──► TRANSFERRED
AVAILABLE ──(return)──► RETURNED
```

**Kunci**: boks masuk inventory **hanya setelah approval**:
- via SJ → approval otomatis saat `from-sj` (langsung `inventoryCreated = totalBoxCount`, semua `AVAILABLE`).
- manual → inventory dibuat **saat `POST /tsg-receiving/:id/approve`** oleh PLANT_MANAGER (response `inventoryCreated: N`).

### 5.4. Kode receiving

`RCV-<YYYYMMDD>-<NN>` — sequence per plant per hari (`uniqueCodePerPlant`). Ditampilkan sebagai referensi di UI ("RCV-20260822-01").

---

## 6. Referensi QR — type `tsg_box`

- Label SJ (pool label) QR berisi **`boxCode` mentah** `TSG-YYYYMMDD-NNN` (bukan URI) — scanner harus membaca kode polos.
- Kalau menemukan QR berformat URI (dari printer lain), kanoniknya sesuai `04-qr-strategy.md`: `ohmes://tsg_box/{plantCode}/{boxCode}?w={berat}&h={hmac}`. Scanner mobile disarankan **mendukung dua format**: parse `ohmes://tsg_box/...` → ambil `boxCode` dari path; atau string polos → langsung pakai sebagai boxCode.
- Resolve: `GET /supplier-sj/labels/:boxCode` mengembalikan konteks label (status ASSIGNED + `sjNumber`) sehingga scanner bisa menolak label dari SJ lain sebelum submit.
- `tsg_receiving_box.box_code` unik global — kode yang sama tidak bisa muncul di dua receiving/SJ.

---

## 7. Catatan Operasional untuk Tim Mobile

1. **Progress scan**: tampilkan counter terverifikasi vs total boks SJ; blokir submit selama counter < total (server juga menolak, tapi UX lebih baik dicegah di client).
2. **Selisih jumlah**: kalau ada boks kurang — biarkan petugas mencari boks; kalau tetap kurang → SJ ditolak server (`SJ_COUNT_MISMATCH`). Tidak ada mekanisme "terima parsial" di v1.1 — koordinasikan dengan SUPERVISOR/Pengawas area (opsi: terima via receiving manual untuk boks yang jalan terpisah, atau hubungi petugas SJ).
3. **Sinyal lemah**: weigh/receive pakai queue offline (`05-flow-offline-sync.md`); `from-sj` bersifat idempoten via Idempotency-Key — aman retry.
4. **Berat**: nilai berat yang tampil di receiving = berat timbangan supplier (dari label). Jangan menampilkan sebagai "ditimbang ulang di pabrik".
