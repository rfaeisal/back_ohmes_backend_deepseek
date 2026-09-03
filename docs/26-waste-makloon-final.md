# 26 — Waste, Order Makloon & Produk Final End-to-End

> Rancangan gabungan empat kebutuhan bisnis (diskusikan 3 Sep 2026):
> (1) penampungan waste/rijek per jenis & asal, (2) entitas order makloon,
> (3) kamus 7 produk final, (4) pencatatan proses pasca-Maker.
> Status: **Fase 1 (migrasi) disetujui — dikerjakan.** Fase 2–4 menunggu review.

---

## 1. Kamus produk final — 7 bentuk

Produk jadi yang keluar dari pabrik (internal maupun order makloon):

| # | Bentuk | `target_unit` / model | Rantai wajib |
|---|---|---|---|
| 1 | Batangan | `BATANGAN` (**baru**) | `[]` |
| 2 | Pack tanpa wrap | `PACK` | `[]` |
| 3 | Pack dengan wrap | `PACK_WRAP` | `[WR]` |
| 4 | Slop isi 10 pack | `SLOP` | `[WR, SLOP]` |
| 5 | Bal isi 20 slop | `BAL` | `[WR, SLOP, BAL]` |
| 6 | Karton isi 50 slop | `carton.unit = SLOP`, capacity 50 | — |
| 7 | Karton isi 4 bal | `carton.unit = BAL`, capacity 4 | — |

Keputusan & perubahan:

- **`target_unit` + `BATANGAN`** (CHECK `ck_batch_target_unit` diperluas).
- **Karton hanya SLOP | BAL** — nilai PACK ditutup (CHECK `ck_carton_unit`).
  Data karton PACK lama (kalau ada) ditutup/dikonversi sebelum migrasi.
- **Standar isi per produk** (pola `batang_per_pack` 0033): kolom baru di `product` —
  `slop_isi_pack` (default 10), `bal_isi_slop` (default 20),
  `karton_capacity_slop` (default 50), `karton_capacity_bal` (default 4).
  Jadi default di form, tetap bisa di-override per kejadian dengan alasan.
- **Batangan keluar** — tabel baru `batangan_out` (lihat §6).

## 2. Order Makloon — entitas `makloon_order`

Satu order makloon = 4 dimensi: **pemesan → produk pesanan → satuan akhir →
bentuk bahan baku masuk**. Contoh nyata:

| Order | Pemesan | Produk | Satuan akhir | Bahan masuk |
|---|---|---|---|---|
| 1 | PT. A | Marbol — Putihan | Slop dengan wrap | Batangan |
| 2 | PT. B | Turya — Reguler | Batangan | TSG |
| 3 | PT. C | Bagong — Mild | Pack tanpa wrap | TSG |

### 2.1 Skema

```
makloon_order
  id            uuid PK
  plant_id      uuid NOT NULL          -- RLS
  code          text NOT NULL          -- 'MKL-20260903-001' (unique per plant)
  customer      text NOT NULL          -- pemesan FREE TEXT (keputusan 3 Sep 2026)
  product_name  text NOT NULL          -- nama produk pesanan ('Marbol - Putihan')
  tsg_type      text NOT NULL          -- REGULER | MILD | PUTIHAN (kunci kelompok rijek)
  final_form    text NOT NULL          -- BATANGAN|PACK|PACK_WRAP|SLOP|BAL|CARTON_SLOP|CARTON_BAL
  input_type    text NOT NULL          -- BATANGAN | TSG
  status        text NOT NULL DEFAULT 'OPEN'
                -- OPEN → RECEIVING (bahan diterima) → PROCESSING → DONE (serah terima selesai)
  notes         text
  created_at / deleted_at
```

### 2.2 Tautan ke entitas lama (nullable FK — backward compatible)

- `tsg_receiving.makloon_order_id` — bahan TSG masuk (0031 lama: `is_makloon` + free-text)
- `external_batangan_receiving.makloon_order_id` — bahan batangan masuk (docs/24)
- `batch.makloon_order_id` — diteruskan saat timbang/approve
- `external_pack_out.makloon_order_id` — keluaran ke customer
- Kolom free-text lama (`makloon_customer`, `makloon_target`, `sender_name`)
  TETAP untuk data lama; alur baru mengisi dari order.

### 2.3 Alur per tipe order

- **PT. A (BATANGAN masuk → SLOP keluar)**: order → external receiving (batangan, link order)
  → batch `btx_` `target_unit=SLOP` → HLP → WR → SLOP → `external_pack_out` `exitStage=SLOP`
  → serah terima PDF.
- **PT. B (TSG masuk → BATANGAN keluar)**: order → receiving TSG makloon (link order) →
  inventory → timbang → batch `target_unit=BATANGAN` (proses Maker saja, tanpa HLP) →
  keluar batangan → serah terima.
- **PT. C (TSG masuk → PACK keluar)**: order → receiving TSG → batch `target_unit=PACK` →
  HLP → `external_pack_out` `exitStage=PACK`.

## 3. Pool Waste & Rijek — `rijekan_ledger` diperkaya

### 3.1 Kolom baru (lot identity)

```
rijekan_ledger
  + tsg_type          text      -- REGULER | MILD | PUTIHAN (jenis saat dicatat)
  + origin            text      -- INTERNAL | MAKLOON (asal TSG)
  + makloon_order_id  uuid FK   -- order makloon (nullable)
  + returned_at       timestamptz   -- terisi saat serah terima ke customer
  + returned_ref      text      -- referensi dokumen serah terima
  unit diperluas: KG | BATANG | PACK | SLOP | BAL (TEXT — gotcha #18)
```

### 3.2 Sumber masuk (sink otomatis, jenis & asal di-derive — bukan input manual)

| Sumber | Satuan | Derive jenis | Derive asal |
|---|---|---|---|
| Settle waste RIJEKAN (sudah ada) | KG | `product.tsgType` shift | batch shift `isMakloonTsg` |
| Settle waste MENIR (**baru**) | KG | sama | sama |
| Reject HLP (sudah ada) | BATANG | batch | batch |
| Reject WR/SLOP/BAL (**baru**) | PACK/SLOP/BAL | batch | batch |

- **Debu kasar/halus**: tetap dicatat di `shift_waste`, TIDAK masuk pool.
- **Menir masuk pool** — bisa diproses ulang (keputusan 3 Sep 2026).
- **Reject batch EXTERNAL kini masuk pool bertag MAKLOON** — merevisi docs/24 §4
  ("tidak masuk ledger") dan menyelaraskan kode (yang selama ini sudah memasukkan
  tanpa tag). Semua rijek tertampung; makloon wajib kembali, internal boleh reproses.

### 3.3 Saldo pool

`saldo per (jenis × asal × satuan)` = Σ masuk − Σ teralokasi − Σ returned.
Satuan berdampingan TANPA konversi paksa (filosofi docs/23 §5.1):
KG (MAKER/menir) & BATANG (HLP) & PACK/SLOP/BAL (stage) hidup masing-masing.

## 4. Reproses rijek → TSG (INTERNAL saja)

1. **Waste Pool UI**: kelompok rijek tersedia per jenis (origin INTERNAL),
   dengan **berat/angka rijekan asli sebagai acuan**.
2. **Proses Rijek → TSG**: pilih jenis → pilih lot yang terkumpul → alokasikan qty →
   server validasi **semua lot satu `tsg_type`**.
3. Buat receiving supplier **"Reproses Internal (Rijekan)"** (sudah ada) —
   **berat timbang aktual saat pembentukan** menentukan berat TSG baru.
4. `rijekan_allocation` mengikat: lot mana → receiving reproses mana → qty berapa.

```
rijekan_allocation
  id                   uuid PK
  plant_id             uuid NOT NULL          -- RLS
  ledger_entry_id      uuid NOT NULL FK       -- lot rijek yang dikonsumsi
  reproses_receiving_id uuid FK               -- tsg_receiving hasil reproses
  qty                  numeric NOT NULL       -- porsi lot yang terpakai
  note                 text
  allocated_by         uuid FK, allocated_at  timestamptz
```

- Jenis TSG hasil reproses = jenis lot input (validasi server).
- Berat acuan (jumlah lot) vs berat aktual (timbang) tampil berdampingan
  di form & jejak — tanpa konversi paksa.

## 5. Serah terima waste makloon

- Lot `origin = MAKLOON` dikelompokkan **per order** → tombol "Serah Terima ke Customer".
- Merekam event + dokumen PDF berita acara (pola `makloon-serah-terima-pdf`).
- Lot ter-return: `returned_at` + `returned_ref` terisi → keluar saldo pabrik.
- Waste TSG makloon **wajib dikembalikan ke customer** — tidak boleh di-reproses
  (keputusan 3 Sep 2026).

## 6. Batangan keluar — `batangan_out`

Produk final #1 (batangan) keluar untuk kebutuhan internal & order makloon.

```
batangan_out
  id               uuid PK
  plant_id         uuid NOT NULL            -- RLS
  batch_id         uuid FK                  -- batch asal batangan
  qty_kg           numeric NOT NULL         -- berat keluar (kg)
  batang_est       integer                  -- perkiraan jumlah batang (estimasi)
  destination_type text NOT NULL            -- INTERNAL | MAKLOON | LAIN
  destination_name text NOT NULL            -- free text (pabrik tujuan / customer)
  doc_ref          text
  out_by           uuid FK, out_at          timestamptz
  notes, created_at, deleted_at
```

- **MAKLOON** (order PT. B): bisa juga lewat `external_pack_out` dengan
  `exitStage=BATANGAN` + link order — serah terima PDF pakai alur makloon.
- **INTERNAL**: antar pabrik / keperluan pabrik — dokumen berita acara opsional
  (pola dokumen PDF yang ada).

## 7. Penyesuaian proses pasca-Maker

1. **Konservasi LUNAK (bukan penolakan)**:
   - WR: `output + rijek + sisa = input`
   - SLOP/BAL: `output × isi_per_unit + rijek + sisa = input`
   - Mismatch → response memuat `conservationWarning: true`; UI minta alasan
     (notes wajib) tapi tetap diterima + audit log.
2. **Sisa bahan baku HLP**: tetap estimasi per sesi (tidak diubah).
3. **Material rusak WR/SLOP/BAL**: pastikan seed `applicable_machines` mencakup
   WR/SLOP/BAL untuk PEMAKAIAN/RUSAK/WASTE (cek Fase 2).
4. **Rijek stage WR/SLOP/BAL** → sink ke ledger (Fase 2).

## 8. Keputusan bisnis yang disepakati (3 Sep 2026)

1. Karton hanya BAL atau SLOP — unit PACK ditutup.
2. Konservasi stage lunak (peringatan + alasan), bukan penolakan.
3. Sisa bahan baku HLP tetap estimasi per sesi.
4. Menir ikut ditampung & bisa diproses ulang; debu tidak masuk pool.
5. Waste dari TSG makloon wajib dikembalikan ke customer.
6. Batangan keluar untuk kebutuhan internal diadakan (`batangan_out`).
7. Customer makloon free-text (bukan master data customer).

## 9. Fase implementasi

| Fase | Isi | Status |
|---|---|---|
| 1 | Migrasi 0034: `makloon_order`, tag ledger, `rijekan_allocation`, `batangan_out`, CHECK target_unit/carton, standar isi produk, FK order | ✅ Selesai 3 Sep 2026 |
| 2 | Sink & aturan server: menir + reject stage → ledger, derive jenis/asal, konservasi lunak, link order saat receiving, `applicable_machines` | ✅ Selesai 3 Sep 2026 (migrasi 0035) |
| 3 | UI: order makloon + detail, waste pool + reproses, serah terima waste + PDF, report rijekan per jenis/asal/order | ✅ Selesai 3 Sep 2026 (migrasi 0036: `rijekan_return` + item) |
| 4 | Test: unit (181) + E2E spec 10 (rantai order PT. A/B/C + pool + reproses + serah terima) — **14/14 passed** | ✅ Selesai 3 Sep 2026 |

### Catatan perubahan suite E2E (Fase 4)

- Spec disusun ulang: `05_stage_chain` (rantai WR→SLOP→karton SLOP) mendahului
  `05b_outbound_cartoning` (FG confirm → karton SLOP isi hasil SLOP → READY) —
  alur "isi pack HLP langsung ke karton" digantikan isi stage karena karton
  hanya SLOP|BAL.
- `10_makloon_waste`: order PT. A/B/C → receiving batangan ber-link order →
  batch EXTERNAL target SLOP → HLP reject bertag MAKLOON → pool → serah
  terima + PDF → settle MENIR → reproses → inventory AVAILABLE.
- Seed: produk membawa `tsgType=REGULER` + `batangPerPack=20` (fresh + sync
  idempoten untuk DB ter-seed) supaya derive jenis rijekan deterministik.

### Endpoint baru (Fase 2–3)

- `GET/POST /api/v1/makloon-orders` · `PATCH /api/v1/makloon-orders/:id`
- `GET /api/v1/rijekan` kini membawa `pool` (saldo per jenis × asal × satuan + lot tersedia)
- `POST /api/v1/rijekan/reproses` — lot INTERNAL satu jenis → receiving "Reproses Internal (Rijekan)" + alokasi + OUT
- `POST /api/v1/rijekan/return` — serah terima waste makloon per order (tandai `returned_at`)
- `GET /api/v1/rijekan-returns/:id/document` — PDF Berita Acara Serah Terima Waste Makloon
- `POST /tsg-receiving/from-sj` & `POST /external-receivings` menerima `makloonOrderId` (validasi `inputType`, salin customer/target, status order → RECEIVING)

## 10. Dokumen terdampak

- docs/24 §4 (reject external kini masuk pool bertag MAKLOON) — direvisi saat Fase 2.
- docs/23 §5 (ledger polos → pool terstruktur; menir masuk; unit diperluas).
- docs/25 (target_unit + BATANGAN; konservasi lunak).
- docs/20 (kode error baru: `RIJEKAN_TYPE_MISMATCH`, `RIJEKAN_INSUFFICIENT`, dll — Fase 2).
