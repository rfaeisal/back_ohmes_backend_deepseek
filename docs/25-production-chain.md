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
4. **Karton manual** = PEMAKAIAN material (consumable karton, outType PEMAKAIAN)
   tanpa waste; jumlah aktual dicatat per kegiatan (rasio bal:karton bervariasi).
5. **Urutan stage bebas** — sistem tidak memvalidasi stage sebelumnya selesai.
   Progress batch tetap terlihat dari stage tertinggi yang sudah dicatat.

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

## 5. Pertanyaan tertunda

1. Sisa batch (23 §2.4) saat rantai multi-stage: hitung sisa dari stage tertinggi
   saja, atau tampilkan rincian sisa per stage? (Rekomendasi: stage tertinggi saja.)
2. Apakah stage WR/SLOP/BAL punya nomor lot/kode fisik (mis. label slop) yang perlu
   dicetak/direkam? (Rekomendasi awal: tidak — cukup batch code.)

## 6. Urutan eksekusi yang disarankan

1. Migrasi: enum machine.type + applicable_machines, batch.stage, batch_stage_event
2. API: stage event (create/list), summary batch multi-stage
3. Web/tablet: form catatan stage (gudang/tablet HLP extension), laporan rantai
4. Makloon: entry/exit stage di penerimaan & keluaran (24)
5. Test: unit service + E2E rantai penuh (MAKER→HLP→WR→SLOP→BAL→karton + makloon)
