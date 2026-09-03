# 25 — Rantai Produksi Lengkap: HLP → WR → SLOP → BAL → Karton Manual

Status: **DRAFT DISEPAKATI** (diskusi 1 Sep 2026) — belum dieksekusi.
Melanjutkan docs/23 (sesi HLP) dan docs/24 (makloon) — dokumen ini merangkai
seluruh rantai + mencatat pemakaian & waste material per stage.

---

## 1. Alur rantai

```
MAKER ─→ batch batangan ─→ HLP ─→ pack
                                  │
                                  ▼
                           WR (Wrapping) ─→ pack terwrap
                                  │
                                  ▼
                      SLOP + SLOP Wrapping (1 proses) ─→ SLOP terwrap
                                  │
                                  ▼
                             BAL (Baling) ─→ kemasan BAL
                                  │
                                  ▼
                       Karton (MANUAL — hanya catat pemakaian karton, tanpa waste)
```

Makloon bisa masuk di stage mana pun (batangan / pack / pack terwrap / …) dan
keluar ke customer di stage mana pun sesuai kontrak — generalisasi docs/24.

## 2. Keputusan (rekomendasi yang disepakati)

1. **WR/SLOP/BAL TIDAK pakai sesi formal dulu** — cukup catatan per-stage.
   Sesi HLP (docs/23) tetap berdiri sendiri; kalau lapangan butuh, pola sesi
   bisa diperluas ke mesin lain menyusul.
2. **Satuan per stage dicatat apa adanya** (pack / slop / bal) — input, output,
   dan reject sebagai count eksplisit; **tidak ada asumsi rasio tetap**
   (rasio konversi bervariasi, tidak disimpan sistem).
3. **Reject per stage dicatat eksplisit** — pola yang sama dengan reject pack HLP
   (23 §4): input − output − reject = selisih (kalau ada) jadi peringatan.
4. **Karton kini multi-satuan (0029)** — karton punya `unit` (PACK/SLOP/BAL,
   satu unit per karton); isi bisa dari pack HLP atau output stage
   (WR→PACK, SLOP, BAL). Karton manual untuk bal tetap dicatat sebagai
   PEMAKAIAN material bila tidak lewat karton multi-satuan.
5. **Produk jadi target per batch (0030)** — diputuskan operator HLP sebelum
   stage dimulai: `PACK` (tanpa stage) | `PACK_WRAP` (WR) | `SLOP` (WR→SLOP) |
   `BAL` (WR→SLOP→BAL). Stage di luar target ditolak (`STAGE_NOT_IN_TARGET`),
   loncat urutan ditolak (`STAGE_SEQUENCE_REQUIRED`), dan **WR ditolak bila
   packing HLP belum dicatat** (`PACKING_REQUIRED`) — input WR adalah pack
   hasil HLP, jadi catatan packing wajib ada lebih dulu. Target boleh diubah
   sebelum ada event stage; sesudahnya wajib alasan + audit.
   **Peringatan approval**: detail shift menampilkan rantai yang belum tuntas
   relatif terhadap targetnya (bukan blokir — rantai boleh berhenti lebih awal
   lewat ubah target ber-alasan).
6. **Sisa per stage bisa dikartonkan** — `sisa(stage) = Σoutput(stage) −
   Σinput(stage berikutnya) − dialokasikan ke karton`. Sisa parsial yang
   "tidak memenuhi" untuk diproses ke stage berikutnya otomatis menjadi stok
   karton dalam satuan stage-nya (tidak ada minimum jumlah).
   **0032 — rasio & sisa resmi**: dialog Catat Stage kini mencatat
   `isi_per_unit` (rasio input per 1 output — SLOP: pack/slop, BAL: slop/bal;
   default 10/20, fleksibel) dan `sisa_qty` (sisa input tak terpakai,
   dicatat di event stage berikutnya). **Sisa TERCATAT operator = angka resmi**
   untuk ketersediaan karton & ekspektasi FG; bila event lama tidak punya
   sisa tercatat, fallback ke rumus otomatis di atas. Reject stage tetap
   dihitung dalam **batang**.

## 3. Skema

```
machine.type — enum diperluas: MAKER | HLP | WR | SLOP | BAL
  (migrasi ALTER TYPE — pola 0016/0017, file terpisah satu statement)
consumable_item/sparepart.applicable_machines — nilai diperluas menyesuaikan
  tipe mesin baru (MAKER/HLP/WR/SLOP/BAL/BOTH/dst.)

batch + kolom:
  stage          text NULL default 'PACKED'   -- PACKED | WRAPPED | SLOPPED | BALED
                                              -- (progres tertinggi; CARTONED tidak
                                              --  disimpan — karton = pemakaian material)
  target_unit    text NOT NULL default 'PACK' -- produk jadi target (0030):
                                              -- PACK | PACK_WRAP | SLOP | BAL

batch_stage_event — catatan per-stage (1 baris = 1 kegiatan selesai):
  id             uuid PK
  batch_id       uuid NOT NULL → batch
  plant_id       uuid NOT NULL            -- RLS
  stage          text NOT NULL            -- WR | SLOP | BAL
  machine_id     uuid → machine           -- mesin yang dipakai (NULL kalau manual)
  input_qty      numeric NOT NULL         -- unit stage (pack/slop/bal)
  output_qty     numeric NOT NULL
  reject_qty     numeric NOT NULL default 0
  unit           text NOT NULL            -- 'PACK' | 'SLOP' | 'BAL'
  operator_by    uuid NOT NULL → user
  event_at       timestamptz NOT NULL
  notes          text
  created_at     timestamptz
  deleted_at     timestamptz              -- soft delete konvensi #8
```

Pemakaian & waste material per stage **TIDAK butuh tabel baru** — tetap lewat
`material_out` (outType PEMAKAIAN/WASTE + machine_id = mesin stage; untuk karton
manual machine_id NULL + note "karton manual") sesuai 23 §3. Material yang relevan
difilter via `applicable_machines`.

Reject stage → ikut hitungan sisa batch (23 §2.4 diperluas: sisa dihitung dari
output stage terakhir yang dicatat).

## 4. Makloon multi-stage (perluasan docs/24)

- Penerimaan external kini membawa **entry stage** (BATANGAN | PACK | PACK_WRAPPED
  | SLOP | BAL) — form gudang menyesuaikan label & satuan. Untuk entry selain
  batangan, batch tetap dibuat dengan `source=EXTERNAL` (batch adalah unit
  pelacak rantai, apa pun bentuk fisiknya di stage masuk).
- Keluaran ke customer (24 §3.3) membawa **exit stage** — form "Keluar ke Customer"
  mencatat unit stage keluar (pack/slop/bal) + reject stage yang dikembalikan.
- PDF serah terima makloon mencantumkan stage masuk/keluar.

## 5. Pertanyaan tertunda — SEMUA TERJAWAB (1 Sep 2026)

1. ~~Sisa batch saat multi-stage.~~ **DIJAWAB: rincian per stage** — summary batch
   kini memuat `stageBreakdown` (in/out/reject + sisa per stage; sisa = output stage
   − input stage berikutnya, BAL = outputnya) — diimplementasikan + tampil di
   kartu Rantai tablet.
2. ~~Nomor lot/kode fisik stage.~~ **DIJAWAB: tidak** — cukup batch code.

## 6. Urutan eksekusi yang disarankan

1. Migrasi: enum machine.type + applicable_machines, batch.stage, batch_stage_event
2. API: stage event (create/list), summary batch multi-stage
3. Web/tablet: form catatan stage (gudang/tablet HLP extension), laporan rantai
4. Makloon: entry/exit stage di penerimaan & keluaran (24)
5. Test: unit service + E2E rantai penuh (MAKER→HLP→WR→SLOP→BAL→karton + makloon)
