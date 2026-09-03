# 23 — Desain Sesi HLP, Input Operator HLP, Reject Pack & Ledger Rijekan

Status: **DRAFT DISEPAKATI** (diskusi 1 Sep 2026) — belum dieksekusi.

---

## 1. Latar belakang

Mesin HLP bersifat kontinu: selama ada batch batangan dari MAKER, mesin jalan tanpa
kenal batas shift 8 jam. Kru berganti di tengah proses tanpa menghentikan mesin.
Kebutuhan:

1. Sesi HLP **open-ended** — tidak terbatas 8 jam, bisa lintas roster
2. **Ganti anggota shift tanpa menutup sesi** — perolehan pack tidak pernah reset
3. Input operasional langsung dari tablet HLP (material, downtime, sparepart, waste)
4. **Reject pack** sebagai kategori reject baru (selain reject batangan)
5. **Ledger rijekan** — rijekan MAKER + reject HLP → reproses → TSG shift berikutnya

Kunci arsitektur: **"perolehan pack" tidak pernah milik shift** — data packing menempel
ke `batch` (`hlp_pack` → batchCode). Sesi HLP murni entitas kehadiran/akuntabilitas,
bukan pengganti hitungan batch.

---

## 2. Sesi HLP (entitas baru — JANGAN reuse `shift_report`)

`shift_report` sarat semantik MAKER (waste 4 kategori + settlement, yield, approve/lock,
box session). Mencampur HLP ke sana akan menyeret approval & koreksi yang tidak
dibutuhkan dan mengotori laporan MAKER.

### 2.1 Skema

```
hlp_shift
  id            uuid PK
  plant_id      uuid NOT NULL          -- RLS
  hlp_machine_id uuid NOT NULL → machine
  started_by    uuid → user
  started_at    timestamptz NOT NULL
  ended_by      uuid → user            -- NULL = masih buka
  ended_at      timestamptz            -- NULL = masih buka
  status        text NOT NULL          -- OPEN | CLOSED  (mirip pola text approval_status)
  created_at    timestamptz
  deleted_at    timestamptz            -- soft delete konvensi #8

hlp_shift_member
  id            uuid PK
  hlp_shift_id  uuid NOT NULL → hlp_shift (cascade)
  user_id       uuid NOT NULL → user
  shift_role_id uuid → shift_role      -- dari roster (default), boleh bebas pilih
  joined_at     timestamptz NOT NULL
  left_at       timestamptz            -- NULL = masih bertugas
```

- **Ganti anggota** = attach/detach row member dengan `joined_at`/`left_at` —
  sesi tidak pernah ditutup karenanya.
- **Penutupan sesi**: manual (tablet HLP / supervisor web) **+ auto-tutup saat mesin
  idle X jam** (angka idle belum ditentukan). Auto-tutup via mekanisme seperti
  `src/instrumentation.ts` (auto-cleanup sesi existing).
- **Tanpa approval** — sesi HLP bukan perhitungan produksi yang perlu dikunci.
- **Satu sesi OPEN per mesin HLP** (unique partial index).
- **Roster hanya default value** — petugas boleh pilih bebas saat attach.

### 2.2 Kaitan ke data existing

- `hlp_pack` + kolom `hlp_shift_id` (nullable) — terisi otomatis dari sesi OPEN
  saat catat packing. Laporan "pack per sesi/per kru" tinggal join; sumber kebenaran
  hitungan tetap `batch`.
- `machine_downtime` / `machine_maintenance` + kolom `hlp_shift_id` (nullable) —
  biar bisa difilter per sesi.

### 2.3 Sisi tablet

Halaman `/tablet/hlp` menampilkan status sesi: buka sesi (default roster muncul sebagai
saran), ganti anggota (attach/detach, opsional dari daftar roster atau bebas), tutup
sesi. Input packing tetap bisa tanpa sesi — **OPEN QUESTION (ditunda)**.

### 2.4 Ringkasan sisa batch (saat ganti kru / tutup sesi)

Satu batch bisa lintas sesi — saat anggota berganti atau sesi ditutup, tablet
menampilkan ringkasan konteks pekerjaan (mirip semangat handoff TSG di MAKER):

- `batanganKg` awal batch (dari `batch`)
- Total batangan sudah terpakai = Σ `(packsLolos + rejectPacks) × isiPerPack + rejectBatangan` dari semua entry packing batch tsb
- **Sisa estimasi** (batang dan/atau kg) — dihitung server-side: `batanganKg` − batangan terpakai × berat/batang (berat/batang terakhir dari entry paling baru)
- Ditampilkan: di panel sesi saat attach/detach anggota, dan di layar tutup sesi

Tidak butuh tabel baru — endpoint summary batch (kalkulasi server-side, konvensi #5).

---

## 3. Input operasional dari tablet HLP

Data & endpoint sudah ada — yang berubah hanya pintu input + default mesin:

| Kebutuhan | Endpoint existing | Perubahan |
|---|---|---|
| Material (pemakaian) | `POST /material-out` (outType PEMAKAIAN + machineId) | Form di tablet HLP; `machineId` otomatis = mesin HLP aktif; permission diperluas ke role operator HLP (saat ini input dari gudang; panel "Bahan di Mesin Ini" tetap read-only untuk operator) |
| Downtime | `machine_downtime` (API `/machines/:id/downtime`) | Form input di tablet HLP |
| Sparepart/maintenance | `machine_maintenance` / `maintenance_event` | Form input di tablet HLP |
| **Waste material** | **belum ada** | OutType baru `WASTE` di `material_out` (migrasi enum — pola 0016/0017). Bedanya dengan RUSAK: RUSAK = rusak di gudang; WASTE = terbuang saat proses produksi. Muncul terpisah di laporan sebagai "waste material" |

OPEN QUESTION: apakah input tablet wajib menempel ke sesi HLP OPEN? (digabung dengan
pertanyaan packing-tanpa-sesi di §2.3 — dijawab bersamaan nanti).

---

## 4. Reject Pack di form packing

Sekarang: pack lolos + isi per pack + reject batangan. Tambah **reject pack**
(pack yang ditolak utuh — sobek/berat salah).

### 4.1 Perubahan

- `hlp_pack` + kolom `reject_packs` (int, default 0, nullable → historis 0)
- Rumus total batang:
  `totalBatang = (packsLolos + rejectPacks) × isiPerPack + rejectBatangan`
  → batangan dalam pack reject **dihitung sebagai batangan reject** (keputusan
  lapangan: reject pack "sebagai batangan") dan ikut mengkonsumsi `batch.batanganKg`.
- Berat per batang otomatis mengikuti rumus baru (server-side).
- Karton availability: `usedPackQty` di gudang outbound **tetap hanya `packsLolos`** —
  pack reject tidak boleh tersedia untuk "➕ Isi Pack".
- UI Riwayat Packing: `X pack lolos · Y pack reject · Z reject batangan`.

### 4.2 Data historis

Reject pack sudah terjadi di lapangan sebelum fitur. Kolom baru default 0; data lama
tetap 0. Keputusan: mulai bersih saat go-live fitur (koreksi historis manual opsional,
tidak wajib).

### 4.3 Alasan reject (dropdown ringan)

- `hlp_pack` + kolom `reject_reason` (text, nullable) — satu alasan per entry packing,
  berlaku untuk reject pack & reject batangan.
- Opsi preset: `SOBEK` | `BERAT_SALAH` | `KOTOR` | `LAINNYA` (zod enum + opsi bebas
  "lainnya" dengan catatan singkat — pola field path correction backlog #5).
- Tujuan: pola reject terlihat di laporan (root-cause), bukan sekadar angka.

### 4.4 Ambang reject → notifikasi supervisor

- Rasio reject = `(rejectPacks × isiPerPack + rejectBatangan) / totalBatang`
- Kalau melebihi ambang (default 5%, konstanta/env) → push FCM fire-and-forget ke
  PM + supervisor plant tsb (reuse `sendPushToUsers` + targeting existing):
  "Reject batch … melebihi ambang (X%)" + data `batch_id`, rasio.
- Infrastruktur FCM sudah teruji — ini hanya titik trigger baru.

---

## 5. Ledger rijekan — tingkat 2 (angka terlihat, peristiwa tetap manual)

Alur lapangan: rijekan MAKER (waste RIJEKAN) + reject HLP → dikumpulkan → reproses →
timbang jadi boks TSG → receiving manual dengan supplier **"Reproses Internal
(Rijekan)"** (sudah ada di sistem) → inventory AVAILABLE untuk shift berikutnya.

### 5.1 Dua satuan berdampingan — TANPA konversi paksa

- Rijekan MAKER → **kg** (waste RIJEKAN + settlement, sudah kg)
- Reject HLP → **batang** (operator menghitung potongan; tidak praktis ditimbang satu-satu)
- Konversi batang→kg terjadi alami saat reproses menimbang boks TSG — sistem tidak
  memaksakan angka konversi (tidak akan presisi).

### 5.2 Skema ledger

```
rijekan_ledger (masuk/keluar)
  id            uuid PK
  plant_id      uuid NOT NULL          -- RLS
  entry_type    text NOT NULL          -- IN_MAKER_WASTE | IN_HLP_REJECT | OUT_REPROSES
  quantity      numeric NOT NULL       -- kg (MAKER) atau batang (HLP)
  unit          text NOT NULL          -- 'KG' | 'BATANG'
  ref_id        uuid                   -- id waste settle / hlp_pack / tsg_receiving
  note          text
  created_at    timestamptz
```

- Masuk otomatis: waste RIJEKAN saat **settle** (LUNAS — permission `shift.waste.settle`)
  + reject batangan/pack saat catat packing HLP — **hanya untuk batch INTERNAL**.
  Reject dari batch EXTERNAL (makloon, docs/24) dikembalikan ke customer dan
  TIDAK masuk ledger pabrik.
- Keluar: tetap **manual** — saat receiving reproses dibuat, form opsional mencantumkan
  keterangan "dari rijekan: ±X batang HLP + ±Y kg waste" sebagai catatan penaut jejak.
- Sisa rijekan belum diproses = SUM(masuk) − SUM(keluar) per satuan, ditampilkan
  seperti pola "sisa pool label" (angka terlihat, peristiwa manual).

### 5.3 Yang TIDAK berubah

- SOP receiving reproses tetap manual (seperti sekarang)
- Supplier "Reproses Internal (Rijekan)" tetap dipakai sebagai penanda
- Waste settlement MAKER tetap alur lama (PENDING → LUNAS)

### 5.4 Laporan rijekan per periode (web)

Halaman laporan baru di admin (mis. `/admin/reports/rijekan`):

- Filter periode + pabrik
- Masuk: Σ RIJEKAN kg (MAKER, dari settle) dan Σ reject batang (HLP) — per periode
- Keluar: boks TSG reproses (kg, dari receiving supplier "Reproses Internal")
- Saldo: sisa belum diproses per satuan (kg & batang berdampingan)
- Rincian per event (waste settle / packing / receiving) — jejak tidak hilang

---

## 6. Bonus: status HLP idle/aktif

Dengan sesi HLP OPEN, badge mesin HLP di Dashboard Pabrik bisa AKTIF = ada sesi OPEN —
menggantikan heuristik 30 menit yang sempat disepakati di TODO.md #6 (backlog).
TODO #6 disupersede oleh desain ini.

---

## 7. Pertanyaan tertunda — SEMUA TERJAWAB (1 Sep 2026, direvisi 3 Sep 2026)

1. ~~Packing/input tanpa sesi OPEN.~~ **DIJAWAB (1 Sep 2026): boleh standalone** — sesi hanya "menempel" kalau OPEN (hlpShiftId auto-link). **DIREVISI 3 Sep 2026: sesi OPEN kini WAJIB** — `POST /hlp/pack` dan `POST /batch-stage-events` menolak dengan `HLP_SESSION_REQUIRED` bila tidak ada sesi OPEN (packing: sesi mesin tersebut; stage: sesi mesin bila mesin dipilih, minimal satu sesi OPEN di plant bila tanpa mesin). Tombol **Buka Sesi** dipindah ke strip tepat di bawah pilih mesin HLP.
2. ~~Angka idle untuk auto-tutup sesi (X jam).~~ **DIJAWAB: 6 jam** (env `HLP_SHIFT_IDLE_HOURS`, diimplementasikan di instrumentation — tahap 2).
3. ~~Permission operator HLP untuk input dari tablet.~~ **DIJAWAB**: material-out PEMAKAIAN/WASTE diizinkan untuk pemegang `hlp.pack` (ter-scope); downtime & maintenance lewat permission shift.downtime.log/shift.maintenance.log yang sudah dimiliki operator — tahap 3.
4. ~~Koreksi historis reject pack.~~ **DIJAWAB**: tidak wajib — mulai bersih saat go-live (§4.2).

## 8. Urutan eksekusi yang disarankan

1. Migrasi schema: `hlp_shift`, `hlp_shift_member`, `hlp_pack.hlp_shift_id` +
   `reject_packs` + `reject_reason`, `rijekan_ledger`, enum `material_out_type` + `WASTE`
2. API: sesi HLP (buka/tutup/anggota + summary sisa batch), reject pack + alasan +
   ambang notif di packing route, ledger rijekan (read + sink otomatis saat
   settle/packing), laporan rijekan per periode
3. Tablet HLP: status sesi + ganti anggota + ringkasan sisa batch + form input
   (material/downtime/sparepart/waste) + reject pack dengan alasan
4. Web: laporan rijekan + dashboard pabrik (status HLP via sesi OPEN)
5. Test: unit service + E2E spec baru (rantai sesi HLP + reject + ledger)
