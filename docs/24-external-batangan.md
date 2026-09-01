# 24 — Penerimaan Batangan External (Makloon Packing)

Status: **DRAFT DISEPAKATI** (diskusi 1 Sep 2026) — belum dieksekusi.

---

## 1. Latar belakang

Pabrik kadang menerima order packing dari luar (makloon): batangan milik pihak lain
diterima → diproses mesin HLP kita → pack dikembalikan ke customer. Batangan external
**bukan TSG** (barang setengah jadi) — tidak boleh lewat inventory TSG (bisa terambil
MAKER, salah alur).

Kunci desain: **batch di sistem sudah netral mesin** — alur HLP tidak berubah sama
sekali. Yang ditambah hanya **jalur lahirnya batch** (penerimaan external) dan
**jalur keluarnya pack** (kembali ke customer).

Keputusan diskusi:
1. Satuan terima: **kg** (ditimbang)
2. Pencatat: **gudang inbound** — wajib approval (PENDING → PM/supervisor) + audit log
3. Output **bisa keluar ke customer**, dicatat **per batch langsung** (tanpa detail karton)
4. Rijekan batch external **dikembalikan ke customer** — bukan milik pabrik
5. Pengirim = **free text** (makloon sering one-off customer)
6. Dokumen keluaran = **PDF serah terima** (dua tanda tangan)

---

## 2. Skema

```
batch — tambahan kolom:
  source                text NOT NULL default 'INTERNAL'  -- INTERNAL | EXTERNAL
  external_receiving_id uuid NULL → external_batangan_receiving
  (TERVERIFIKASI schema existing: shift_report_id DAN machine_id keduanya
   NOT NULL → migrasi ubah keduanya jadi nullable untuk batch EXTERNAL;
   code unik 'btc_MKR01_...' → batch external pakai prefix sendiri
   mis. 'btx_<tgl>_<seq>' supaya tidak tabrak sequence MAKER)

external_batangan_receiving — header penerimaan batangan dari luar:
  id                  uuid PK
  plant_id            uuid NOT NULL            -- RLS
  sender_name         text NOT NULL            -- pengirim, FREE TEXT
  doc_ref             text                     -- nomor PO/DO
  batangan_kg         numeric NOT NULL         -- berat diterima (kg)
  received_at         timestamptz NOT NULL
  received_by         uuid NOT NULL → user
  approval_status     text NOT NULL default 'PENDING'  -- PENDING | APPROVED | REJECTED
  approved_by         uuid → user
  approved_at         timestamptz
  rejection_reason    text
  rejected_by         uuid → user
  rejected_at         timestamptz
  batch_id            uuid → batch             -- diisi saat approve (batch yang dibuat)
  notes               text
  created_at          timestamptz NOT NULL
  deleted_at          timestamptz              -- soft delete konvensi #8

external_pack_out — keluar pack (dan rijekan) kembali ke customer:
  id                  uuid PK
  plant_id            uuid NOT NULL            -- RLS
  batch_id            uuid NOT NULL → batch
  destination_name    text NOT NULL            -- customer, free text
  doc_ref             text                     -- nomor referensi customer
  pack_qty            int NOT NULL             -- pack lolos dikembalikan
  reject_pack_qty     int NOT NULL default 0   -- pack reject utuh dikembalikan
  reject_batang_qty   int NOT NULL default 0   -- batangan reject dikembalikan
  out_at              timestamptz NOT NULL
  out_by              uuid NOT NULL → user
  created_at          timestamptz NOT NULL
  deleted_at          timestamptz
```

## 3. Alur

### 3.1 Penerimaan (gudang inbound)

1. Form baru "Terima Batangan External" di halaman gudang: pengirim (free text),
   docRef, berat kg, tanggal, catatan
2. Status **PENDING** → push FCM ke PM + supervisor (pola `notifyReceivingPending`,
   payload diberi penanda external) — konsisten dengan receiving manual
3. **Approve** (PM/supervisor, permission `tsg.receiving.approve`) → sistem membuat
   **batch `source=EXTERNAL`** (`batanganKg` = berat diterima, `machineId` NULL) →
   batch langsung muncul di picker HLP dengan **badge EXTERNAL**
4. **Reject** dengan catatan — pola endpoint reject receiving yang sudah ada
5. Audit log di tiap mutasi: `external_batangan.create/approve/reject`

### 3.2 Proses HLP — TIDAK berubah

Batch external diproses persis batch internal: sesi HLP (docs/23), catat packing,
reject pack + alasan (23 §4.3), sisa batch (23 §2.4), ambang reject notif (23 §4.4).
Yang beda hanya badge EXTERNAL di batch picker.

### 3.3 Keluaran ke customer (gudang outbound)

1. Form "Keluar Pack ke Customer (Makloon)": pilih batch external → pack keluar →
   nama customer → docRef → **termasuk reject yang dikembalikan**
   (reject pack utuh + reject batangan — diambil dari summary batch)
2. **PDF Berita Acara Serah Terima Pack Makloon** (pola berita-acara-pdf):
   pihak 1 pabrik / pihak 2 customer, tabel: kode batch, pack keluar, reject pack,
   reject batangan, docRef, dua tanda tangan
3. Batch ditandai "selesai keluar" saat pack keluar = packsLolos tercatat

## 4. Rijekan & ledger

- Sink otomatis ledger rijekan (23 §5.2) **hanya untuk batch INTERNAL** — reject dari
  batch EXTERNAL TIDAK masuk ledger pabrik (bukan milik kita)
- Reject batch external tetap tercatat di summary batch → dipakai untuk angka
  pengembalian di form 3.3 dan dokumen PDF
- Laporan rijekan (23 §5.4) otomatis bersih (hanya batch INTERNAL)

## 5. Integrasi dengan desain 23 (sesi HLP)

Batch EXTERNAL ikut seluruh mekanisme sesi HLP. Badge di picker batch memakai pola
yang sama dengan usulan "badge REPROSES" (ide #4 diskusi 23, belum dipilih — bisa
diaktifkan sekalian di sini).

## 6. Pertanyaan tertunda — SEMUA TERJAWAB (1 Sep 2026)

1. ~~Estimasi berat di dokumen serah terima.~~ **DIJAWAB: sertakan estimasi** —
   baris "Estimasi Berat Pack = berat/batang × isi × jumlah pack (estimasi)" —
   sudah diimplementasikan di PDF serah terima.
2. ~~Batch belum habis saat kontrak selesai.~~ **DIJAWAB: cukup laporan sisa** —
   summary batch (23 §2.4) menampilkan sisa; tanpa status khusus.

## 7. Urutan eksekusi yang disarankan

1. Migrasi: kolom `batch.source` + `external_receiving_id` (+ machine_id nullable),
   tabel `external_batangan_receiving`, `external_pack_out`
2. API: penerimaan external (create/list/detail/approve/reject + FCM), pack out
   (create/list/detail), PDF serah terima makloon
3. Web: form terima + approval di gudang; form keluar + riwayat di gudang outbound
4. Tablet HLP: badge EXTERNAL di batch picker
5. Test: unit service + E2E spec baru (terima external → approve → packing → keluar)
