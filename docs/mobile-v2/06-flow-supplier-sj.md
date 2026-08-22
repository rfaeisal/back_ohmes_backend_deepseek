# 06 · Flow Surat Jalan Supplier (SJ) — Spesifikasi Layar Flutter

Dokumen ini adalah **satu-satunya sumber spec layar** untuk fitur Surat Jalan Supplier di mobile Flutter (rebuild dari nol). Kontrak endpoint, nama enum, dan pesan error di sini diverifikasi langsung dari **kode backend aktif** (`src/app/api/v1/supplier-sj/**`, `src/db/schema/supplier-sj.ts`, `src/lib/services/supplier-sj.service.ts`) dan dokumen lama `docs/mobile-team/10-supplier-sj-app.md` (kontrak SJ v1.1 — pool label generik + assign saat scan).

**Versi kontrak**: SJ v1.1 (pool label dicetak di web, boks masuk saat scan di gudang supplier).
**Base URL**: staging/prod dari PM (sama dengan `03-api-contract.md`).
**Auth**: JWT Bearer via login `deviceType: "MOBILE"` + `deviceId` wajib (single-session mobile — lihat §5.4).

---

## 1. Konteks & Aktor

### 1.1. Tiga pengguna fitur SJ

| # | Role (kode) | Lokasi | Platform | Yang dilakukan |
|---|---|---|---|---|
| 1 | `AREA_SJ_OFFICER` (Petugas Label Area) | Area office | **WEB** | Cetak **pool label generik** (QR + ceklis jenis TSG), pantau sisa label |
| 2 | `AREA_SJ_OFFICER` (Petugas Label Area) | Gudang supplier | **Flutter** | Buat SJ (nomor manual supplier) → scan label = assign ke SJ + pilih jenis + input berat (satu langkah) → tandai **SHIPPED** saat truk berangkat → VOID label hilang/rusak |
| 3 | `GUDANG_INBOUND` | Pabrik | Flutter | Terima TSG via SJ (scan label boks datang + validasi jumlah) — dijelaskan di `07-flow-receiving.md` |

> **Keputusan final 2026-08-22**: petugas SJ (**`AREA_SJ_OFFICER`**) memegang **dua konteks kerja** — di gudang supplier pakai aplikasi Flutter (semua operasi di bawah), di area office pakai web untuk pool label & print. Flutter **tidak mencetak label**.

### 1.2. Permission per role (dari `src/db/seed.ts` + route)

| Permission | AREA_SJ_OFFICER | GUDANG_INBOUND | Endpoint yang melindungi |
|---|---|---|---|
| `supplier.sj.create` | ✅ | ❌ | POST /supplier-sj, PATCH /supplier-sj/:id, GET /supplier-sj/options |
| `supplier.sj.view` | ✅ | ✅ | GET /supplier-sj, GET /supplier-sj/:id, GET /supplier-sj/labels/:boxCode |
| `supplier.sj.label` | ✅ | ❌ | POST /supplier-sj/:id/boxes/weigh, POST /supplier-sj/labels/:boxCode/void |
| `supplier.sj.pool` | ✅ (di-permission; **tidak dipakai di app**) | ❌ | POST/GET /supplier-sj/pool, POST /supplier-sj/pool/pdf — **web area office** |
| `tsg.receiving.view` | ✅ | ✅ | GET /tsg-receiving |

> Catatan: role `AREA_SJ_OFFICER` memang punya `supplier.sj.pool` di seed. Ini **bukan** izin mobile mencetak pool — keputusan produk: print label hanya via web area office. App tidak menyediakan layar pool/print.

### 1.3. Test user (dari `src/db/seed.ts`)

| Username | Password | Role | Scope |
|---|---|---|---|
| `petugassj` | `12345678` | `AREA_SJ_OFFICER` | REGION (area) |
| `gudangin` | `12345678` | `GUDANG_INBOUND` | PLANT |

### 1.4. Konsep inti

- **Pool label**: stok label fisik yang dicetak sekaligus di area office (mis. 100 label). Setiap label = kode boks `TSG-<YYYYMMDD>-<NNN>` (tanggal cetak, sequence global). Status label pool = **AVAILABLE**, belum terikat SJ, tanpa jenis. Satu stok bisa dipakai beberapa hari / beberapa supplier.
- **Assign = scan**: label di-assign ke SJ **saat discan** di gudang supplier, sekaligus dengan pilihan jenis TSG + berat timbangan supplier. SJ tidak lagi lahir dengan label (perubahan v1.1).
- **Label fisik**: QR berisi **`boxCode` mentah** (bukan URI `ohmes://`) — diverifikasi di `src/lib/services/pool-label-pdf.service.ts` (`QRCode.toBuffer(code, …)` dengan `code = boxCode`). Ada teks kode boks di bawah QR sebagai fallback kalau QR rusak → petugas bisa **ketik manual**.

---

## 2. Alur Bisnis End-to-End

```
AREA OFFICE (WEB)                        GUDANG SUPPLIER (FLUTTER)                 PABRIK (FLUTTER)
─────────────────────                    ─────────────────────────                 ────────────────
1. Login web (petugassj)
2. POST /supplier-sj/pool {count: 100}
   → POST /supplier-sj/pool/pdf {boxCodes}
   → download PDF 100×75mm → cetak
   (QR + ceklis REGULER/MILD/PUTIHAN,
   spidol permanent untuk centang fisik)
3. Bawa stok label ke gudang supplier ──►
                                            1. Login app (petugassj, deviceType MOBILE)
                                            2. GET /supplier-sj/options → buat SJ:
                                               POST /supplier-sj {sjNumber, supplierId,
                                               plantId} → SJ DRAFT, 0 boks
                                               (response: poolAvailable = sisa label
                                               milik petugas yang bisa di-assign)
                                            3. Boks ditimbang + label ditempel
                                               (centang jenis di kertas = alat bantu
                                               fisik, bukan input sistem)
                                            4. Scan QR label → GET
                                               /supplier-sj/labels/:boxCode (resolve)
                                               → POST /supplier-sj/:id/boxes/weigh
                                               {boxCode, tsgType, supplierWeightKg}
                                               = ASSIGNED + jenis + berat
                                               (ulangi sampai semua boks)
                                            5. PATCH /supplier-sj/:id {status: SHIPPED}
                                               (wajib ≥1 boks & semua tertimbang;
                                               gagal → SJ_EMPTY / SJ_HAS_UNWEIGHED_BOXES)
                                               Label hilang/rusak → POST
                                               /supplier-sj/labels/:boxCode/void
                                                                                  ├─► 1. Truk datang → scan tiap label
                                                                                  │     → cocokkan jumlah dengan SJ
                                                                                  │  2. POST /tsg-receiving/from-sj
                                                                                  │     {supplierSjId, verifiedBoxCodes}
                                                                                  │     → receiving APPROVED + inventory
                                                                                  │       AVAILABLE + SJ RECEIVED
                                                                                  │     (lihat 07-flow-receiving.md)
```

**Penting — validasi di pabrik hanya jumlah boks** (identitas label). Validasi berat di pabrik = TODO tahap berikutnya (timbang ulang/spot-check). Berat real TSG diinput saat boks masuk mesin Maker (tablet web, bukan app ini).

---

## 3. Blueprint Layar Flutter

> Konvensi yang dipakai di semua layar:
> - **Format error server**: `{ error: { code, message, details? }, requestId }`. UI wajib menampilkan `message` dari server (sudah user-friendly), dan menambahkan konteks lokal kalau perlu.
> - **Idempotency-Key header wajib** untuk semua POST/PATCH (lihat §5.3 offline queue).
> - Semua mutasi butuh konfirmasi (hindari mis-tap di lapangan).
> - Status warna (badge): DRAFT = amber, SHIPPED = biru, RECEIVED = hijau. Label: AVAILABLE = abu, ASSIGNED = hijau, VOID = merah.
> - Satuan berat: kg, 2 desimal, rentang **>0 sampai 100** (0 tidak boleh).

### 3.1. Layar A — Daftar SJ

**Tujuan**: melihat semua surat jalan yang terlihat oleh scope user (petugas area REGION melihat semua SJ di area-nya; gudang inbound PLANT hanya SJ tujuan pabriknya) + masuk ke detail untuk bekerja.

**Input / form fields**: filter status (segmented/tab): `Semua | DRAFT | SHIPPED | RECEIVED`. (Opsional) pull-to-refresh.

**State**:
- `loading`: skeleton list.
- `empty`: ilustrasi + teks "Belum ada surat jalan. Ketuk + untuk buat SJ baru." (hanya untuk `AREA_SJ_OFFICER`; role lain lihat saja).
- `error` (mis. jaringan): banner + tombol "Coba lagi".
- `loaded`: daftar item.

**Item list** (dari `GET /supplier-sj`): `sjNumber` (judul), `supplierName`, `plantCode`, `status` (badge), `createdAt` (tanggal, format lokal), `shippedAt`/`receivedAt` (kalau ada), plus subtotal boks kalau sudah ada di cache detail.

**Aksi utama**:
- Tap item → Layar C (Detail SJ).
- FAB / tombol "+" → Layar B (Buat SJ) — **hanya untuk `AREA_SJ_OFFICER`** (permission `supplier.sj.create`).
- (GUDANG_INBOUND) tap SJ **SHIPPED** → lanjut alur receiving (`07-flow-receiving.md`).

**Validasi client**: filter status dikirim sebagai query `?status=DRAFT|SHIPPED|RECEIVED` — nilai enum harus dari daftar tersebut (server tidak menerima nilai lain).

**Endpoint**: `GET /api/v1/supplier-sj?status=<DRAFT|SHIPPED|RECEIVED>` — permission `supplier.sj.view`. Response `{ data: [...] }`, max 100 item, urut `createdAt` DESC. Tanpa pagination di backend v1.1.

**Error yang mungkin + tampilan**:
| Code | HTTP | Tampilan di UI |
|---|---|---|
| `FORBIDDEN` | 403 | Banner: "Anda tidak punya izin melihat surat jalan." (seharusnya tidak terjadi — role sudah dicek) |
| `TOKEN_REVOKED` | 401 | Logout otomatis → layar login. |
| Jaringan/timeout | – | Banner "Tidak dapat terhubung ke server. Periksa koneksi." + tombol coba lagi. |

**Navigasi**: masuk dari Home (role AREA_SJ_OFFICER/GUDANG_INBOUND). Keluar: back ke Home; masuk ke Layar C.

### 3.2. Layar B — Buat SJ

**Tujuan**: membuat Surat Jalan baru **tanpa label** (0 boks) sebelum mulai scan di gudang supplier.

**Input / form fields**:
1. `sjNumber` — nomor surat jalan **manual dari supplier** (text field, max 50 karakter). Bukan autogenerate.
2. `supplierId` — dropdown supplier (dari `GET /supplier-sj/options`, list aktif, urut nama).
3. `plantId` — dropdown pabrik tujuan (dari options — **hanya pabrik dalam scope user**; untuk petugas REGION = semua pabrik di area-nya).
4. Info sisa label: setelah submit, tampilkan `poolAvailable` dari response ("Sisa label yang bisa di-assign: N") — SOP: kalau kecil, ingatkan petugas bawa cadangan.

**State**: `loading` (fetch options), `submitting` (disable tombol), `error`, `loaded`.

**Aksi utama**: tombol "Buat SJ" → validasi → `POST /supplier-sj`. Setelah sukses → langsung ke Layar C (Detail SJ) supaya bisa mulai scan.

**Validasi client** (sebelum kirim):
- `sjNumber` tidak kosong (trim), ≤ 50 karakter.
- Supplier & pabrik wajib dipilih (ID UUID dari options — jangan free-text).
- Duplikat nomor SJ dicek server (`SJ_NUMBER_EXISTS`) — client hanya cek kosong.

**Endpoint**: 
- `GET /api/v1/supplier-sj/options` — permission `supplier.sj.create`. Response `{ data: { suppliers: [{id, code, name}], plants: [{id, code, name}] } }`.
- `POST /api/v1/supplier-sj` — permission `supplier.sj.create`. Body `{ sjNumber, supplierId, plantId }`. Response 201: `{ sjId, sjNumber, status: "DRAFT", poolAvailable }`.

**Error yang mungkin + tampilan** (dialihkan ke SnackBar merah dekat form):
| Code | HTTP | Pesan user (dari server / mapping) |
|---|---|---|
| `VALIDATION_ERROR` | 400 | "Input tidak valid." — tampilkan detail field (`details`) di bawah field terkait. |
| `SJ_NUMBER_EXISTS` | 409 | "Nomor surat jalan sudah terdaftar untuk supplier ini." — fokus ke field sjNumber. |
| `SUPPLIER_NOT_FOUND` | 409 | "Supplier tidak ditemukan." — muat ulang options. |
| `PLANT_OUT_OF_SCOPE` | 403 | "Pabrik tujuan di luar scope anda." — seharusnya tidak terjadi (options sudah difilter). |
| `FORBIDDEN` | 403 | "Anda tidak punya izin membuat surat jalan." |

**Navigasi**: masuk dari Layar A (tombol +). Keluar: batal/back ke Layar A; sukses → Layar C.

### 3.3. Layar C — Detail SJ

**Tujuan**: melihat header SJ + daftar boks/label beserta status, dan titik masuk aksi: scan (DRAFT), tandai SHIPPED (DRAFT), void label (DRAFT), atau status receiving (SHIPPED/RECEIVED).

**Input / form fields**: tidak ada input — tampilan hanya baca + tombol aksi.

**Konten**:
- Header: `sjNumber`, `supplierName`, `plantCode`, `status` (badge), `createdAt`, `shippedAt`/`receivedAt`, `note`.
- Ringkasan boks: jumlah total, total berat (jumlah dari `boxes[].supplierWeightKg`).
- List boks (dari `boxes[]`): `boxCode` (monospace), `tsgType` (badge kecil, null = "—"), `supplierWeightKg` (kg, null = "belum ditimbang"), `labelStatus` badge.
- Banner DRAFT (khusus AREA_SJ_OFFICER): "Sisa label yang bisa di-assign: N" (dari `poolAvailable` saat create — atau omit jika tidak tersimpan).

**State**: `loading`, `empty` (SJ tidak ditemukan/terhapus), `error`, `loaded`. Setelah setiap mutasi (scan/void/ship) → refresh ulang GET detail (atau update optimis + validasi dari response).

**Aksi utama**:
- Tombol besar **"Scan Label"** (hanya `supplier.sj.label` & status DRAFT) → Layar D.
- Tombol **"Tandai SHIPPED"** (hanya DRAFT) → Layar E.
- Swipe/menu per item boks **"Tandai Rusak/Hilang"** — hanya untuk boks yang **belum tertimbang** (defensif; di praktiknya semua boks di SJ sudah tertimbang karena masuk via weigh) dan bukan label milik orang lain → Layar F. (VOID juga relevan untuk label AVAILABLE yang belum terikat — resolve dulu via scan, lihat 3.4/3.6.)
- Tap boks ASSIGNED → snackbar info detail (boxCode, jenis, berat, enteredAt).

**Endpoint**: `GET /api/v1/supplier-sj/:id` — permission `supplier.sj.view`. Response: field header + `boxes: [{ id, boxCode, tsgType, labelStatus, supplierWeightKg, enteredAt }]`.

**Error yang mungkin + tampilan**:
| Code | HTTP | Tampilan |
|---|---|---|
| `SJ_NOT_FOUND` | 404 | Layar kosong + "Surat jalan tidak ditemukan atau tidak terlihat." + tombol back. |
| `FORBIDDEN` | 403 | Banner izin. |

**Navigasi**: masuk dari Layar A; keluar ke Layar A (perlu refresh list saat kembali — status bisa berubah).

### 3.4. Layar D — Scan Label (inti fitur)

**Tujuan**: satu langkah = **assign label ke SJ + pilih jenis + input berat timbangan supplier**. Kamera scan QR; fallback ketik manual `boxCode`.

**Alur layar**:
1. **Mode kamera** aktif (kamera belakang, fokus QR). QR = `boxCode` mentah `TSG-YYYYMMDD-NNN`. Tap ikon keyboard → input manual boxCode.
2. Hasil scan → `GET /supplier-sj/labels/:boxCode` (**resolve label**) → tampilkan **info label**:
   - `boxCode`, `labelStatus` (AVAILABLE / ASSIGNED / VOID), `tsgType`, `supplierWeightKg`, `enteredAt`, dan kalau terikat: `sjNumber`, `sjStatus`, `supplierName`, `plantCode`.
3. Branch berdasarkan hasil resolve:
   - **AVAILABLE** (label pool milik petugas ini, belum terikat) → form **pilihan jenis** + **input berat** → konfirmasi → `POST /:id/boxes/weigh` (assign + jenis + berat).
   - **ASSIGNED ke SJ ini & belum ditimbang** → tampilkan jenis tetap (badge besar) + input berat → konfirmasi → weigh tanpa field jenis.
   - **ASSIGNED ke SJ lain** → blokir: "Label ini sudah terikat surat jalan {sjNumber}." (backend: `LABEL_ALREADY_ASSIGNED`).
   - **VOID** → blokir: "Label {boxCode} sudah ditandai hilang/rusak." (`LABEL_VOIDED`).
   - **404** → "Label tidak ditemukan." — termasuk label pool **milik petugas lain** (isolasi per-owner, lihat §5.2).
4. Setelah weigh sukses → SnackBar hijau "Boks TSG-… terdaftar (REGULER, 29.75 kg)" → otomatis kembali ke mode kamera untuk boks berikutnya (alur cepat).

**Input / form fields** (panel bawah setelah resolve):
- `tsgType` — **3 tombol pilihan besar**: `REGULER`, `MILD`, `PUTIHAN` (nama persis enum DB `tsg_type` — jangan diubah labelnya; tampilkan 16pt+). Wajib saat assign label pool (`INVALID_TSG_TYPE` kalau kosong). Sembunyikan kolom ini untuk boks yang sudah ASSIGNED ke SJ ini (jenis mengikuti assign pertama). Tambahan UX: tampilkan centang kertas pada label sebagai panduan, tapi pilihan di app yang jadi kebenaran.
- `supplierWeightKg` — input numerik (decimal, 2 digit), satuan kg. Rentang **> 0 sampai 100** (backend: `z.number().positive().max(100)`; service: `<=0 || >100` → `INVALID_BOX_WEIGHT`).
- Tombol **"Konfirmasi"** — kirim weigh.

**State**: `scanning` (kamera aktif), `resolving` (spinner saat resolve label), `error` (dialog error dari §4), `submitting` (disable konfirmasi), `success`.

**Validasi client**:
- Berat: `> 0 && <= 100` (kalau 0/negatif/lebih: warning inline "Berat boks harus 0–100 kg" — sama dengan pesan server).
- Jenis: wajib dipilih kalau label AVAILABLE.
- Semua POST pakai Idempotency-Key (mis. hash boxCode+timestamp) supaya retry jaringan aman.

**Endpoint**:
- `GET /api/v1/supplier-sj/labels/:boxCode` — permission `supplier.sj.view` (resolve; 404 `LABEL_NOT_FOUND`).
- `POST /api/v1/supplier-sj/:id/boxes/weigh` — permission `supplier.sj.label`. Body `{ boxCode, tsgType?, supplierWeightKg }`. Response 200: `{ boxId, boxCode, tsgType, labelStatus: "ASSIGNED", supplierWeightKg, enteredAt }`.

**Error yang mungkin + tampilan** (dialog/inline):
| Code | HTTP | Pesan user |
|---|---|---|
| `LABEL_NOT_FOUND` | 404 (resolve) / 409 (weigh) | "Label tidak ditemukan." (juga untuk label pool milik petugas lain — jangan bocorkan detail kepemilikan). |
| `LABEL_VOIDED` | 409 | "Label {boxCode} sudah ditandai hilang/rusak." |
| `LABEL_ALREADY_ASSIGNED` | 409 | "Label {boxCode} sudah terikat surat jalan lain." |
| `LABEL_ALREADY_WEIGHED` | 409 | "Label {boxCode} sudah ditimbang ({berat} kg)." — beri opsi "Ulangi scan" (boks sudah masuk, jangan kirim ulang). |
| `INVALID_TSG_TYPE` | 409 | "Jenis TSG wajib dipilih saat label di-assign." |
| `INVALID_BOX_WEIGHT` | 409 | "Berat boks harus 0–100 kg." |
| `SJ_NOT_DRAFT` | 409 | "Hanya surat jalan berstatus DRAFT yang bisa diisi timbangan." — SJ sudah SHIPPED/RECEIVED. |
| `SJ_NOT_FOUND` | 409 | "Surat jalan tidak ditemukan." |
| `VALIDATION_ERROR` | 400 | "Input tidak valid." + detail field. |

**Navigasi**: masuk dari Layar C (tombol Scan Label) dengan konteks `sjId` + `sjNumber`. Keluar: back ke Layar C (list boks ter-refresh).

### 3.5. Layar E — Tandai SHIPPED

**Tujuan**: mengunci SJ sebagai "truk berangkat" — tahap ini yang membuat SJ siap diterima pabrik.

**Input / form fields**: dialog/bottom-sheet konfirmasi dengan ringkasan:
- Jumlah boks (`boxCount` dari GET detail), total berat.
- Peringatan jika ada boks belum ditimbang: **"Masih ada N label yang belum ditimbang"** → tombol ship di-disable sampai semua boks punya berat.
- Tombol "Batalkan" / "Ya, tandai SHIPPED".

**Syarat** (validasi client + server):
- Status SJ = DRAFT (`SJ_NOT_DRAFT` kalau bukan).
- **≥ 1 boks** (`SJ_EMPTY`).
- **Semua boks tertimbang** (`SJ_HAS_UNWEIGHED_BOXES`).

**State**: `loading` (fetch detail untuk syarat), `submitting`, `success` → pop ke Layar C dengan badge SHIPPED.

**Endpoint**: `PATCH /api/v1/supplier-sj/:id` body `{ status: "SHIPPED" }` — permission `supplier.sj.create`. Response 200: `{ sjId, status: "SHIPPED", boxCount }`.

**Error yang mungkin + tampilan**:
| Code | HTTP | Pesan user |
|---|---|---|
| `SJ_EMPTY` | 409 | "Surat jalan belum punya boks. Scan label terlebih dahulu." |
| `SJ_HAS_UNWEIGHED_BOXES` | 409 | "Masih ada {N} label yang belum ditimbang." |
| `SJ_NOT_DRAFT` | 409 | "Hanya surat jalan DRAFT yang bisa ditandai dikirim." |
| `SJ_NOT_FOUND` | 409 | "Surat jalan tidak ditemukan." |
| `INVALID_STATUS` | 400 | "Status tidak didukung." (client hanya kirim SHIPPED). |
| `FORBIDDEN` | 403 | Tidak punya izin (hanya AREA_SJ_OFFICER). |

**Navigasi**: dari Layar C. Sukses → kembali ke Layar C (status SHIPPED, aksi scan hilang).

### 3.6. Layar F — VOID Label (hilang/rusak)

**Tujuan**: menandai label **AVAILABLE** (belum terikat SJ) sebagai hilang/rusak supaya tidak dipakai dan tidak dihitung sebagai sisa pool.

**Input / form fields**:
- `boxCode` — hasil scan/ketik (resolve dulu via `GET /labels/:boxCode` untuk konfirmasi status).
- `alasan` — text field bebas.

> **Temuan backend**: endpoint void **belum menerima alasan** (zod kosong; `voidSupplierSjLabel({boxCode, actorUserId, isPrivileged})`). Alasan di layar ini hanya **catatan konfirmasi internal petugas** (opsional, disimpan lokal di log app) — **bukan** dikirim ke server. Audit log server (`supplier_sj.box.void`) mencatat boxCode + status, tanpa alasan. **Gap**: usulkan ke backend field `reason?` pada endpoint void + simpan di audit.

**Alur**: scan/ketik boxCode → resolve → hanya **AVAILABLE** yang boleh lanjut (label ASSIGNED/VOID → blokir) → konfirmasi dengan alasan → `POST /labels/:boxCode/void` → SnackBar "Label {boxCode} ditandai hilang/rusak."

**State**: `resolving`, `submitting`, `success`, `error`.

**Validasi client**: label AVAILABLE (dari resolve), konfirmasi eksplisit.

**Endpoint**: `POST /api/v1/supplier-sj/labels/:boxCode/void` — permission `supplier.sj.label`. Response 200: `{ boxCode, labelStatus: "VOID" }`.

**Error yang mungkin + tampilan**:
| Code | HTTP | Pesan user |
|---|---|---|
| `LABEL_NOT_AVAILABLE` | 409 | "Label {boxCode} tidak bisa di-VOID (status: {labelStatus})." |
| `LABEL_NOT_FOUND` | 409 | "Label tidak ditemukan." (label pool milik petugas lain juga 404). |
| `FORBIDDEN` | 403 | Tidak punya izin. |

**Navigasi**: dari Layar C (aksi per boks yang belum tertimbang) atau dari Layar D (scan label AVAILABLE → menu "tandai rusak"). Keluar: back.

### 3.7. Catatan — pool label & print = WEB (bukan layar mobile)

App Flutter **tidak** mengimplementasikan:
- `POST /supplier-sj/pool` (generate label) — web area office.
- `GET /supplier-sj/pool` (sisa pool) — web.
- `POST /supplier-sj/pool/pdf` (download PDF 100×75mm) — web.

Alasan: keputusan final 2026-08-22 — pool label printing tetap di web area office (printer XPrinter 420B terhubung ke PC office; PDF multi-halaman 1 label/halaman; print scale 100%). Mobile hanya **mengkonsumsi** label: sisa label yang bisa dipakai muncul sebagai `poolAvailable` di response create SJ (Layar B), dan kalau label fisik habis di lokasi, petugas kembali ke office untuk cetak ulang — app tidak bisa menambah label.

---

## 4. Tabel Error Lengkap (verifikasi kode route + service)

Semua mutasi SJ yang gagal lewat `ServiceError` → HTTP 409 dengan `{ error: { code, message, details? }, requestId }`. `VALIDATION_ERROR` → 400. Resource hilang/terisolasi → 404. Auth/permission → 401/403.

| Code | HTTP | Kondisi (dari kode) | Pesan user (tampilkan `message` server) |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod fail di boundary (semua route) | "Input tidak valid." + `details.flatten()` per field |
| `FORBIDDEN` | 403 | User tidak punya permission route | "Permission '{x}' diperlukan." |
| `PLANT_OUT_OF_SCOPE` | 403 | POST /supplier-sj: plantId tujuan tidak ada di `ctx.user.plantIds` | "Pabrik tujuan di luar scope anda." |
| `SJ_NUMBER_EXISTS` | 409 | Duplikat (supplierId, sjNumber) — unique constraint | "Nomor surat jalan sudah terdaftar untuk supplier ini." |
| `SUPPLIER_NOT_FOUND` | 409 | Supplier ID tidak ada | "Supplier tidak ditemukan." |
| `INVALID_SJ_NUMBER` | 409 | sjNumber kosong setelah trim | "Nomor surat jalan wajib diisi." |
| `SJ_NOT_FOUND` | 404 (GET detail) / 409 (mutasi) | SJ tidak ada / tidak terlihat RLS | "Surat jalan tidak ditemukan." |
| `SJ_NOT_DRAFT` | 409 | weigh/ship pada SJ non-DRAFT | "Hanya surat jalan berstatus DRAFT yang bisa diisi timbangan." / "Hanya surat jalan DRAFT yang bisa ditandai dikirim." |
| `SJ_EMPTY` | 409 | ship tanpa boks; receive tanpa label | "Surat jalan belum punya boks. Scan label terlebih dahulu." |
| `SJ_HAS_UNWEIGHED_BOXES` | 409 | Masih ada boks tanpa `supplierWeightKg` | "Masih ada {N} label yang belum ditimbang." |
| `LABEL_NOT_FOUND` | 404 (resolve) / 409 (weigh, void) | boxCode tidak dikenal **atau** label pool milik petugas lain (isolasi) | "Label tidak ditemukan." |
| `LABEL_VOIDED` | 409 | weigh label status VOID | "Label {boxCode} sudah ditandai hilang/rusak." |
| `LABEL_ALREADY_ASSIGNED` | 409 | weigh label yang `supplierSjId != sjId` | "Label {boxCode} sudah terikat surat jalan lain." |
| `LABEL_ALREADY_WEIGHED` | 409 | weigh label sudah punya `supplierWeightKg` di SJ ini | "Label {boxCode} sudah ditimbang ({kg} kg)." |
| `LABEL_NOT_AVAILABLE` | 409 | void label non-AVAILABLE | "Label {boxCode} tidak bisa di-VOID (status: {labelStatus})." |
| `INVALID_TSG_TYPE` | 409 | assign pool label tanpa tsgType | "Jenis TSG wajib dipilih saat label di-assign." |
| `INVALID_BOX_WEIGHT` | 409 | `supplierWeightKg <= 0 \|\| > 100` | "Berat boks harus 0–100 kg." |
| `INVALID_STATUS` | 400 | PATCH status selain SHIPPED | "Status tidak didukung." |
| `POOL_COUNT_INVALID` | 409 | pool count di luar 1–500 (web) | "Jumlah label harus 1–500." |
| `SJ_NOT_SHIPPED` | 409 | from-sj pada SJ non-SHIPPED | "Surat jalan belum berstatus SHIPPED." |
| `SJ_WRONG_PLANT` | 409 | from-sj: SJ untuk plant lain | "Surat jalan ini ditujukan ke pabrik lain." |
| `SJ_COUNT_MISMATCH` | 409 | verifiedBoxCodes ≠ daftar label SJ; `details: { missingBoxCodes, unknownBoxCodes, sjBoxCount, verifiedCount }` | "Jumlah boks tidak sesuai SJ — {N} label belum terverifikasi." / "Ada label yang bukan bagian dari SJ ini ({N})." |
| `NO_PLANT_SCOPE` | 403 | `ctx.user.plantIds[0]` kosong (receiving) | "Tidak ada plant dalam scope." |
| `TOKEN_REVOKED` | 401 | Session di-revoke (pindah device / SUPERADMIN revoke) | "Sesi telah diakhiri. Silakan login kembali." |

> Semua POST/PATCH mencatat **audit log** (`supplier_sj.create`, `supplier_sj.box.assign`, `supplier_sj.box.weigh`, `supplier_sj.box.void`, `supplier_sj.ship`, `supplier_sj.receive`) — user tidak perlu tahu, tapi inilah jejak untuk investigasi selisih.

---

## 5. Aturan Penting

### 5.1. SJ status transition (dari `src/db/schema/supplier-sj.ts` + service)

Enum `supplier_sj_status` (kolom `status`):

```
DRAFT ──(PATCH status=SHIPPED, syarat: ≥1 boks & semua tertimbang)──► SHIPPED
SHIPPED ──(POST /tsg-receiving/from-sj sukses)──► RECEIVED
```

- **DRAFT** → SJ aktif; satu-satunya status yang bisa menerima weigh (scan) dan di-ship. 
- **SHIPPED** → terkunci dari sisi petugas area; tidak bisa weigh lagi (`SJ_NOT_DRAFT`). Truk sudah berangkat.
- **RECEIVED** → pabrik sudah menerima; akhir lifecycle (tidak ada cancel/reopen di backend SJ v1.1).
- Transisi **tidak bisa mundur**. Tidak ada VOID SJ (yang bisa di-VOID hanya label AVAILABLE).

### 5.2. Label lifecycle (dari `src/db/schema/supplier-sj.ts`)

Enum `supplier_sj_label_status` — **perhatikan: nilai VOID (bukan "VOIDED")**:

```
                 ┌─────────(scan = weigh: assign + jenis + berat)─────────► ASSIGNED
AVAILABLE (pool)─┤
                 └─────────(POST void, hanya AVAILABLE)────────► VOID
```

- **AVAILABLE**: label pool, `supplierSjId = null`, `tsgType = null`, `plantId = null`, punya `createdBy` (pemilik pool).
- **ASSIGNED**: terikat SJ (assign saat weigh). `plantId` mengikuti plant SJ. Jenis & berat terisi.
- **VOID**: hilang/rusak — tidak bisa di-assign, tidak masuk hitungan pool.
- Tidak ada status label "SHIPPED" — pengiriman diwakili status **SJ**, bukan label.
- **Isolasi per-owner** (penting!): label AVAILABLE milik petugas lain **diperlakukan tidak ada** (`LABEL_NOT_FOUND`) di resolve/weigh/void — kecuali SUPERADMIN (`isPrivileged`). Jadi petugas hanya bisa meng-assign label yang dia sendiri cetak. Ini enforce di level kode service karena role DB saat ini superuser (RLS bypass).
- `poolAvailable` (response create SJ) = label **AVAILABLE milik petugas itu** (bukan global).
- Re-scan label yang sudah tertimbang di SJ yang sama → `LABEL_ALREADY_WEIGHED` (tidak bisa mengganti berat; berat adalah rekaman timbangan supplier).

### 5.3. Offline behavior (queue via mobile/sync)

Gudang supplier sering di lokasi dengan sinyal tidak stabil. Strategi:

1. **Queue lokal** (SQLite/Drift) untuk mutasi: `boxes/weigh`, `PATCH ship`, `void`. Setiap item wajib punya **Idempotency-Key** (mis. `sj:{sjId}:box:{boxCode}:{ts}`) + `method` + `path` + `body` + `queuedAt`.
2. Saat koneksi pulih → batch upload ke **`POST /api/v1/mobile/sync`** (`{ items: [...], deviceId }`, max 50 item) — server dedup via idempotency store (key valid 24 jam; replay mengembalikan response tersimpan).
3. **Syarat pesanan**: operasi di satu SJ (create → weigh → ship) **harus dikirim berurutan** (FIFO queue per SJ); jangan ship sebelum semua weigh terkirim sukses — client wajib menunggu hasil weigh batch sebelum mengantre ship.
4. **Mode baca**: daftar SJ & detail boleh dari cache terakhir (stale-while-revalidate), dengan indikator "offline" — tapi status "SHIPPED" hanya boleh ditandai setelah server konfirmasi (jangan optimis final untuk ship).
5. Detail kontrak sync & conflict resolution: **lihat `05-flow-offline-sync.md`** (dokumen terpisah seri ini). Catatan: implementasi server `mobile/sync` saat ini masih placeholder dispatcher (response status 200 tanpa eksekusi handler) — **konfirmasi ke backend** status real dispatch sebelum rilis produksi; bangun queue sesuai kontrak di atas.

### 5.4. Login & single-session

- Login pakai `POST /api/v1/auth/login` dengan `deviceType: "MOBILE"` + **`deviceId` wajib** (UUID unik per instalasi) — tanpa deviceId, server menolak (single-session mobile: 1 user = 1 sesi mobile aktif; login baru mematikan sesi lama).
- Pindah device → sesi lama di-revoke (bisa oleh SUPERADMIN). Response `TOKEN_REVOKED` → forced logout di app.
- Setelah login, simpan `accessToken` + `refreshToken` + `user` + `plantIds` (scope sudah di-resolve server ke dalam JWT; client **tidak pernah** mengirim plantId untuk filter — nilai scope diambil dari token).
