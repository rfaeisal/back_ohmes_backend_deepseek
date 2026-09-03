# Skenario Uji Lengkap: Order Makloon → Waste → Reproses → Serah Terima

Panduan praktik fitur **docs/26** (order makloon, pool waste, reproses, serah
terima, batangan keluar) lewat web app di **dev** (`http://localhost:3001`).
Durasi ± 45 menit. Semua nilai input sudah ditentukan — hasil akhir terverifikasi
(4 Sep 2026).

## Alur & urutan stasiun

```
1. ORDER     (admin): buat order PT. A (SLOP/BATANGAN), PT. B (BATANGAN/TSG), PT. C (PACK/TSG)
 → 2. BAHAN A (gudang): batangan external PT. A → approve → batch btx_ target SLOP
 → 3. BAHAN B/C (gudang): SJ supplier 2 boks → terima dengan order PT. B & PT. C
 → 4. MAKER   (tablet): shift pakai boks makloon PT. B → timbang → batch lahir target BATANGAN
 → 5. KELUAR  (admin): batangan keluar PT. B → PDF berita acara
 → 6. HLP     (tablet): reject di batch PT. A → masuk pool MAKLOON (+ coba blokir BATANGAN)
 → 7. SERAH   (admin): serah terima waste PT. A → PDF berita acara
 → 8. SETTLE+REPROSES (admin): LUNAS-kan MENIR/RIJEKAN → pool INTERNAL → reproses jadi TSG
 → 9. KARTON  (gudang): karton hanya SLOP|BAL (opsional)
```

## Akun & halaman

| Peran | Username | Halaman |
|---|---|---|
| Plant Manager | `plantmanager` | semua `/admin/*` |
| Gudang Inbound | `gudangin` | `/admin/gudang` |
| Petugas SJ | `petugassj` | `/admin/supplier-sj` |
| Operator MAKER & HLP | `kecer` | `/tablet` → `/tablet/hlp` |
| Gudang FG | `gudangout` | `/admin/gudang-outbound` |

Password semua user: `12345678`. Login via `/tablet/login`.

## Kondisi awal

- Dev server jalan: `pnpm dev` → `http://localhost:3001` (kalau mati, jalankan
  dulu — **jangan** `pnpm build` saat dev jalan).
- Migrasi 0032–0037 sudah ter-apply di dev (idempoten). Kalau ragu, jalankan:
  `set -a; source .env; set +a; node scripts/apply-manual-migrations.mjs`.
- Seed sync (permission baru + `product.tsg_type` default): `pnpm db:seed`
  (aditif — aman untuk DB ter-seed).
- Disarankan mulai bersih: `scripts/reset-transactions.sql` (trigger
  "kosongkan produksi") — data latihan lama ikut terhapus, kode baru unik.
- Mesin: `MKR-01` (MAKER) dan `HLP-01` (HLP).

---

## Stasiun 1 — Order Makloon (plantmanager, `/admin/makloon-orders`)

1. Klik **➕ Order Baru** dan isi 3 order berikut (persis):

| Pemesan | Produk | Jenis TSG | Satuan Akhir | Bahan Masuk |
|---|---|---|---|---|
| PT. A | Marbol - Putihan | PUTIHAN | Slop (10 pack, wrap) | Batangan |
| PT. B | Turya - Reguler | REGULER | Batangan | TSG |
| PT. C | Bagong - Mild | MILD | Pack tanpa wrap | TSG |

2. **Verifikasi**: kode `MKL-YYYYMMDD-001/002/003`, status **Terima Order**.
3. Latihan dropdown status: ubah order PT. A → *Bahan Masuk* → kembalikan ke
   *Terima Order*.

## Stasiun 2 — Bahan masuk PT. A: batangan (gudangin, `/admin/gudang`)

1. Tombol **🏭 Terima Batangan External (Makloon)**.
2. **Order Makloon**: pilih `MKL-… PT. A · Marbol - Putihan`.
   → **Nama Pengirim otomatis terisi "PT. A"** (dropdown baru).
3. Berat Batangan: **0.5** kg · Stage Masuk: BATANGAN (default) → **SIMPAN (PENDING APPROVAL)**.
4. Kartu **Batangan External Menunggu Approval** muncul → tombol **✅ Setujui**.
5. **Verifikasi**: alert `batch btx_…` muncul. Batch PT. A kini bertarget **SLOP**
   (dari satuan akhir order) — akan terlihat di Stasiun 6.

## Stasiun 3 — Bahan masuk PT. B & PT. C: TSG via SJ (petugassj, lalu gudangin)

1. **petugassj** di `/admin/supplier-sj`:
   - Cetak **2 label pool**.
   - Buat SJ **SJ-1** → scan/assign label #1: jenis **REGULER**, berat **12.5**.
   - Buat SJ **SJ-2** → scan/assign label #2: jenis **MILD**, berat **10.0**.
   - Kirim kedua SJ (status → SHIPPED).
2. **gudangin** di `/admin/gudang` → kartu **SJ Menunggu Diterima**:
   - Terima **SJ-1** → **Order Makloon**: pilih `MKL-… PT. B · Turya - Reguler`
     → muncul info kuning "Customer & produk pesanan diambil dari order" →
     **TERIMA SJ**.
   - Terima **SJ-2** → pilih `MKL-… PT. C · Bagong - Mild` → **TERIMA SJ**.
3. **Verifikasi**: laporan stok TSG bertanda **MAKLOON** untuk kedua boks.

## Stasiun 4 — MAKER proses TSG PT. B (kecer, tablet)

1. Login `kecer` → `/tablet` → mesin **MKR-01** → **Mulai Shift Baru** (template
   & produk pertama; anggota: Pak Kecer).
2. **BUKA BOKS BARU** → pilih boks **REGULER bertanda makloon (PT. B)** → catat
   berat boks → **BUKA 1 BOKS**.
3. **SESI SELESAI · TIMBANG BATANGAN TOTAL** → total = `berat boks × 1,12` → **Timbang & Selesaikan Sesi**.
4. **Verifikasi**: kode batch `btc_MKR-01_…` muncul — batch ini **otomatis
   bertarget BATANGAN** (dari order PT. B, tanpa perlu HLP).
5. **AKHIRI SHIFT** → isi waste: **MENIR 0.5 kg**, **RIJEKAN 0.3 kg**
   (dua lainnya 0) → selesaikan.
   → Waste ini nanti jadi bahan pool internal (Stasiun 8).

## Stasiun 5 — Batangan keluar PT. B (plantmanager, `/admin/batangan-out`)

1. **Batch Batangan**: pilih `btc_MKR-01_… · makloon PT. B`.
   → Muncul info amber: *Batch makloon — tujuan otomatis PT. B*.
2. Berat Keluar: **5 kg** → **Simpan Batangan Keluar**.
3. Riwayat muncul (Tujuan PT. B · badge MAKLOON + kode order) → tombol **BA**
   → PDF **Berita Acara Serah Terima Batangan** terbuka (dua tanda tangan).
4. **Verifikasi latihan blokir** (opsional): di `/tablet/hlp` pilih batch ini
   lalu coba SIMPAN PACKING → error **BATANGAN_FINAL**.

## Stasiun 6 — HLP reject di batch PT. A (kecer, `/tablet/hlp`)

1. Pilih mesin **HLP-01** → **Buka Sesi** (wajib sebelum packing).
2. **Pilih Boks Batangan** → cari batch `btx_…` (PT. A).
3. Isi: Pack Lolos **10** · Isi per Pack **20** · Reject (batang) **3** →
   **SIMPAN HASIL PACKING**.
4. **Verifikasi**: reject ini otomatis masuk pool rijekan bertag
   **MAKLOON + order PT. A** (terlihat di Stasiun 7).

## Stasiun 7 — Pool & serah terima waste PT. A (plantmanager, `/admin/rijekan-pool`)

1. Seksi **Waste Makloon — Serah Terima ke Customer**: baris order PT. A tampil
   dengan **3 BATANG** terkumpul.
2. Tombol **Serah Terima + BA** → konfirmasi → PDF **Berita Acara Serah Terima
   Waste Makloon** terbuka otomatis.
3. **Verifikasi**: baris PT. A hilang dari pool (waste sudah kembali ke customer).

## Stasiun 8 — Settle waste & reproses internal (plantmanager)

1. `/admin/reports/shifts` → buka detail shift tadi → kartu waste **MENIR** &
   **RIJEKAN** berstatus PENDING → klik **LUNAS-kan** pada masing-masing.
   → Keduanya masuk pool rijekan internal (jenis REGULER dari produk shift).
2. `/admin/rijekan-pool` → seksi **Rijek Internal — Siap Reproses**: kelompok
   **REGULER · KG 0.8** tersedia.
3. Klik **Proses Rijek → TSG**:
   - Dialog menampilkan lot (Rijekan 0.3 kg + Menir 0.5 kg) — biarkan terpilih penuh.
   - **Berat acuan rijekan: 0.8 KG** tampil sebagai acuan.
   - **Berat timbang TSG baru**: `1.0` kg → **Proses → TSG Baru**.
4. **Verifikasi**: alert menampilkan receiving `RCV-…`, berat timbang 1 kg,
   berat acuan 0.8 KG. Laporan stok TSG bertanda **Reproses Internal (Rijekan)**.
   Laporan Rijekan menampilkan baris Menir MAKER, Reject Stage, Keluar Reproses,
   kolom **TSG** & **Asal**.

## Stasiun 9 — Karton hanya SLOP|BAL (gudangout, `/admin/gudang-outbound`, opsional)

1. **Buat Karton Baru** → **Unit Karton** hanya berisi **SLOP** & **BAL**
   (PACK tidak ada lagi).
2. Pilih SLOP → kapasitas otomatis **50**; pilih BAL → otomatis **4**
   (standar produk). Boleh override.

---

## Verifikasi cepat via DB (opsional)

```bash
docker exec mes_dev_postgres psql -U mes_user -d mes_dev -c "
SELECT code, source, target_unit, makloon_customer, makloon_order_id IS NOT NULL AS punya_order FROM batch ORDER BY created_at DESC LIMIT 5;
SELECT entry_type, unit, quantity, tsg_type, origin, makloon_order_id IS NOT NULL AS punya_order, returned_at IS NOT NULL AS returned FROM rijekan_ledger ORDER BY created_at DESC LIMIT 8;
SELECT id, customer, product_name, final_form, input_type, status FROM makloon_order ORDER BY created_at DESC LIMIT 3;
SELECT destination_type, destination_name, qty_kg, makloon_order_id IS NOT NULL AS punya_order FROM batangan_out ORDER BY out_at DESC LIMIT 3;"
```

## Pesan error yang mungkin muncul & cara tangani

| Error | Artinya | Tangani |
|---|---|---|
| `BATANGAN_FINAL` | Batch target BATANGAN dipacking HLP | Benar — ini blokir yang disengaja. Pilih batch lain. |
| `TARGET_CHANGE_REASON_REQUIRED` | Ganti target tanpa alasan padahal sudah ada packing/stage | Isi alasan di form ganti target. |
| `RIJEKAN_TYPE_MISMATCH` | Reproses campur lot beda jenis | Pilih lot satu jenis saja (dialog sudah menyaring). |
| `RIJEKAN_MAKLOON_RESTRICTED` | Rijek makloon di-reproses | Makloon wajib serah terima — pakai tombol Serah Terima. |
| `BATANGAN_INSUFFICIENT` | Berat keluar melebihi sisa batch | Kurangi berat keluar. |
| `SJ_COUNT_MISMATCH` | Label scan tidak cocok dengan SJ | Pastikan label yang discan sesuai SJ. |
| `HLP_SESSION_REQUIRED` | Packing tanpa sesi HLP terbuka | Buka Sesi dulu di /tablet/hlp. |
