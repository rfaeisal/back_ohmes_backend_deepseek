# Skenario Manual: Produksi TSG → Karton → Surat Jalan

Panduan praktik menjalankan rantai produksi penuh lewat web app di **dev** (`http://localhost:3001`).
Durasi ± 20 menit. Semua nilai input sudah ditentukan — hasil akhir terverifikasi (3 Sep 2026).

## Alur & urutan stasiun

```
Boks TSG (inventory AVAILABLE)
 → 1. MAKER  (tablet) : shift → buka boks → timbang → kode batch btc_ → end shift
 → 2. HLP    (tablet) : target BAL → packing → stage WR → SLOP → BAL
 → 3. APPROVAL (admin): supervisor approve → ekspektasi FG dibuat
 → 4. OUTBOUND (admin): konfirmasi FG → karton PACK + BAL → READY
 → 5. DISPATCH  (admin): order → dispatch → surat jalan PDF
```

⚠️ **Urutan 2 sebelum 3 adalah kunci**: ekspektasi Finished Goods dihitung *saat approve*.
Kalau approve sebelum HLP packing, ekspektasi PACK = 0 dan Konfirmasi FG jadi DISPUTED.

## Akun & halaman

| Peran | Username | Halaman |
|---|---|---|
| Operator MAKER & HLP | `kecer` | `/tablet` → `/tablet/hlp` |
| Supervisor | `supervisor` | `/admin/approvals` |
| Gudang FG | `gudangout` | `/admin/gudang-outbound` |
| Ekspedisi | `ekspedisi` | `/admin/dispatch` |

Password semua user: `12345678`. Login via `/tablet/login`.

## Kondisi awal

- Dev server jalan: `pnpm dev` → `http://localhost:3001` (kalau mati, jalankan dulu — **jangan** `pnpm build` saat dev jalan).
- Mesin: `MKR-01` (MAKER, IDLE) dan `HLP-01` (HLP). ⚠️ Kartu `MKR-02` mungkin tampil **AKTIF** — itu shift basi dari sesi lama, **abaikan saja**, pakai MKR-01.
- TSG inventory punya boks AVAILABLE (baris pertama di dialog buka boks = FIFO disarankan).
- Data latihan lama (batch, karton, shift) boleh dibiarkan — kode baru selalu unik (`btc_MKR-01_<tgl>_<seq>`). Kalau mau mulai bersih: `scripts/reset-transactions.sql` (trigger "kosongkan produksi").

---

## Stasiun 1 — MAKER (kecer, tablet)

1. Login `kecer` di `/tablet/login` → masuk **Lantai Produksi**.
2. Kartu mesin **MKR-01** → **Mulai Shift Baru**.
3. Di halaman Mulai Shift Baru:
   - Template Shift: yang pertama (otomatis terpilih).
   - Produk: yang pertama (otomatis terpilih).
   - Anggota Tim: klik **Pak Kecer** (dan anggota lain bila ada).
   - Kalau ada **🤝 Handoff Tersedia**: lewati (jangan dipilih).
   - Tekan **Mulai Shift · …** → masuk halaman shift aktif (`/tablet/shift/<id>`).
4. Tekan **BUKA BOKS BARU** (ada 2 tombol sama — yang mana saja).
5. Dialog **Buka Boks Baru**: pilih jumlah **1** → klik boks TSG pertama (bertanda *Disarankan (FIFO)*).
   **Catat berat boksnya** (mis. `29,75 kg`) — dipakai di langkah 7.
   Berat aktual timbangan pabrik: **kosongkan** (pakai berat supplier).
   Tekan **BUKA 1 BOKS TERPILIH**.
   ✅ Muncul kartu **SESI BOKS AKTIF · 1 BOKS**.
6. (Opsional, boleh dilewati) **+ Tambah Pemakaian** — pilih *Bobbin*, Quantity `3`, Simpan.
7. Tekan **SESI SELESAI · TIMBANG BATANGAN TOTAL** → isi **Total Berat Batangan (kg)** =
   `berat boks × 1,12` dibulatkan 2 desimal (contoh: 29,75 → `33,32`).
   Dialog menampilkan pratinjau yield — harus **NORMAL (110–114%)**.
   Tekan **Timbang & Selesaikan Sesi**.
   ✅ Muncul **Kode Boks Batangan (untuk mesin HLP)**: `btc_MKR-01_YYYYMMDD_NN`.
   **Tulis kode ini di kertas/boks fisik** — dipakai di Stasiun 2.
8. Tekan **AKHIRI SHIFT** → dialog Akhiri Shift:
   - Waste **MENIR**: `0.5` kg (wajib min. 1 kategori > 0; 3 kategori lain biarkan 0).
   - Catatan Shift (opsional): bebas.
   - Tekan **Akhiri Shift** → kembali ke Lantai Produksi. Shift status **COMPLETED**.

---

## Stasiun 2 — HLP (kecer, tablet `/tablet/hlp`)

1. Buka `/tablet/hlp` (link **Mesin HLP** di Lantai Produksi, atau ketik URL).
2. Dropdown **Mesin HLP** → pilih `HLP-01` (format opsi: `HLP-01 — <nama>`).
3. **Buka Sesi HLP** — strip kuning tepat di bawah pilih mesin → tekan **Buka Sesi** → strip berubah hijau *✅ Sesi HLP aktif*.
   ⚠️ Sesuaikan urutan di bawah: packing & catat stage **wajib** sesi aktif (`HLP_SESSION_REQUIRED`).
   (Opsional: **+ Tambah Anggota** di kartu Sesi HLP — daftar hanya menampilkan user lantai produksi plant tersebut.)
4. Tekan **+ Pilih Boks Batangan (scan kode btc_...)** → dialog **Pilih Boks Batangan**:
   - Isi **Cari kode batch** dengan kode dari Stasiun 1 (mis. `btc_MKR-01_20260903_07`).
   - Klik baris batch tersebut.
   ✅ Kode batch tampil di form utama.
5. Dropdown **Produk Jadi Target** → **BAL (WR → SLOP → BAL)**.
   ✅ Pesan: *Target produk jadi: BAL*.
   (Target BAL = rantai lengkap: WR → SLOP → BAL. Lihat tabel variasi di bawah untuk target lain.)
6. Form **Catat Hasil Packing**:
   - Pack Lolos: `25`
   - Isi per Pack: otomatis `20` dari master produk (kolom **Batang per Pack** produk — bisa diubah)
   - Reject (batang): `2`
   - Tekan **SIMPAN HASIL PACKING**.
   ✅ *Packing dicatat — berat per batang …* + kartu **Hasil Tersimpan ✅**.
   ⚠️ Setelah simpan, batch ter-*deselect* — **pilih ulang batch** (ulangi langkah 4) sebelum catat stage.
7. Kartu **🏭 Rantai Produksi** → tekan **+ Catat Stage** → dialog **Catat Stage Rantai**.
   Input otomatis terisi dari proses sebelumnya; **Isi per Slop/Bal** default 10/20
   (fleksibel — untuk demo ini ubah ke angka kecil); **Output & Sisa dihitung otomatis**
   (tetap bisa diedit); **Reject dihitung dalam batang**.

   | Toggle | Input | Isi per … | Output | Sisa | Reject (btg) |
   |---|---|---|---|---|---|
   | `WR (Wrapping)` | 25 (auto = pack lolos) | — | 25 | — | 1 |
   | `SLOP` | 25 (auto dari out WR) | ubah ke `5` | auto `5` | auto `0` | 0 |
   | `BAL (Baling)` | 5 (auto dari out SLOP) | ubah ke `5` | auto `1` | auto `0` | 0 |

   Setiap kali: pilih toggle → periksa angka → **SIMPAN STAGE**.
   ✅ Berturut-turut: *Stage WR dicatat — batch kini WRAPPED* → *SLOPPED* → *BALED*.
   Panel **Sisa per stage**: WR 0, SLOP 0, **BAL sisa 1** (sisa tercatat = angka resmi isi karton).

### Variasi target (latihan berikutnya)

| Target | Stage yang wajib dicatat | Karton nanti | Sumber isi karton |
|---|---|---|---|
| PACK | — (langsung karton) | PACK | Pack dari HLP |
| PACK_WRAP | WR saja | PACK | Hasil WR (pack terwrap) |
| SLOP | WR → SLOP | SLOP | Hasil SLOP |
| BAL | WR → SLOP → BAL | BAL | Hasil BAL |

---

## Stasiun 3 — Approval (supervisor, admin)

1. Login `supervisor` → buka `/admin/approvals`.
2. Tab **Shift Menunggu Approval**: tekan **Review** (baris shift Anda — terbaru, MKR-01).
   Periksa detail (waste MENIR 0,5 kg terlihat) → tekan **Approve → LOCKED**.
3. Tab **Sudah Approved**: baris teratas = shift Anda, badge **APPROVED**.
   ✅ Saat approve, ekspektasi FG dibuat otomatis: **PACK = 25**, **BAL = 1**.

---

## Stasiun 4 — Gudang Outbound (gudangout, admin)

1. Login `gudangout` → buka `/admin/gudang-outbound`.
2. Kartu **Finished Goods — Shift Approved** → baris shift Anda → **✅ Konfirmasi FG**.
   Dialog **Konfirmasi Finished Goods**:
   - **Jumlah Pack Aktual**: `25` (placeholder *Ekspektasi: 25 PACK*)
   - **Jumlah bal aktual**: `1` (placeholder *Ekspektasi: 1 BAL*)
   - Tekan **Konfirmasi**.
   ✅ *Finished goods dikonfirmasi.* Baris shift berubah **✓ FG Terkonfirmasi**.
   (Aktual = ekspektasi → status CONFIRMED. Kalau beda → DISPUTED dengan catatan selisih.)
3. Tekan **📦 Buat Karton Baru** → dialog:
   - Produk: pertama (otomatis).
   - Unit Karton: `PACK` (default).
   - Kapasitas (pack): `50`.
   - **Buat Karton**. ✅ Kode karton baru `CTN-PLT-PMK-01-YYYYMMDD-NNN`.
4. Di tabel **Karton**, baris karton baru (OPEN) → **➕ Isi Pack**:
   - Sumber Isi: **Pack dari HLP**.
   - Dropdown **Pack dari HLP**: pilih opsi berisi kode batch Anda (`btc_… · 25 pack · sisa 25`).
   - **Jumlah pack ke karton ini**: `25`.
   - **Tambah ke Karton**. ✅ *25 pack ditambahkan…*
5. Tekan **Tutup → READY** → konfirmasi *Tutup karton ini?* → **OK**.
   ✅ *Karton ditutup (READY).*
6. Tekan **📦 Buat Karton Baru** lagi:
   - Unit Karton: `BAL`.
   - Kapasitas (bal): `10`.
   - **Buat Karton**.
7. Baris karton BAL (OPEN) → **➕ Isi Pack**:
   - (Tanpa Sumber Isi — otomatis hasil stage) Dropdown **Batch (hasil BAL)**: pilih batch Anda (sisa 1).
   - **Jumlah bal ke karton ini**: `1`.
   - **Tambah ke Karton**. ✅ *1 bal ditambahkan…*
8. **Tutup → READY** → OK. ✅ Karton BAL READY.

---

## Stasiun 5 — Dispatch (ekspedisi, admin)

1. Login `ekspedisi` → buka `/admin/dispatch`.
2. Tekan **Buat Dispatch Order**:
   - **Nama Pelanggan ***: `Distributor Latihan`
   - **Alamat Tujuan ***: `Jl. Latihan No. 1, Malang`
   - Centang checkbox **kedua karton** Anda (PACK & BAL, berstatus READY).
   - **Buat Order**. ✅ *Dispatch order dibuat* — order baru berstatus **DRAFT**.
3. Tekan **Dispatch** pada order tersebut → konfirmasi → **OK**.
   ✅ *Order DISPATCHED.*
4. Tekan **Dokumen** → ✅ *Dokumen dibuat* → tekan **Unduh**.
   ✅ PDF surat jalan terbuka: kop pabrik, tabel 2 karton (**25 PACK** + **1 BAL**),
   total `2 karton · 25 pack · 1 bal`, 3 blok tanda tangan.

---

## Pesan error yang mungkin muncul & cara tangani

| Kode | Situasi | Solusi |
|---|---|---|
| Yield **WARNING** (di luar 110–114%) | Angka timbang salah | Periksa kembali berat batangan sebelum simpan |
| `MACHINE_HAS_RUNNING_SHIFT` | MKR-01 masih ada shift aktif | Lanjutkan/akhiri shift aktif dulu |
| `STAGE_NOT_IN_TARGET` | Stage tidak sesuai target | Ubah Produk Jadi Target atau pilih stage yang benar |
| `PACKING_REQUIRED` | Catat WR sebelum packing HLP | Simpan hasil packing dulu, baru catat stage WR |
| `HLP_SESSION_REQUIRED` | Packing/stage tanpa sesi HLP OPEN | Tekan **Buka Sesi** di bawah pilih mesin, baru proses |
| `STAGE_SEQUENCE_REQUIRED` | Lompat urutan | Catat stage sebelumnya dulu |
| `TARGET_CHANGE_REASON_REQUIRED` | Ubah target setelah ada stage | Isi alasan di prompt |
| `PACK_INSUFFICIENT` / `STAGE_OUTPUT_INSUFFICIENT` | Isi melebihi sisa | Kurangi jumlah |
| `CARTON_FULL` / `CARTON_EMPTY` | Kapasitas penuh / karton kosong ditutup | Sesuaikan jumlah / isi dulu |

## Verifikasi cepat via DB (opsional)

```bash
docker exec -e PGPASSWORD=<pass mes_user> mes_dev_postgres psql -U mes_user -d mes_dev -c "
SELECT unit, packs_expected_count, packs_actual_count, status FROM finished_goods_receiving ORDER BY created_at DESC LIMIT 2;
SELECT code, unit, status, actual_pack_count FROM carton ORDER BY opened_at DESC LIMIT 2;
SELECT code, status FROM dispatch_order ORDER BY ordered_at DESC LIMIT 1;"
```

---

*Dokumen ini dipraktikkan & diverifikasi end-to-end pada 3 Sep 2026 di dev.*
