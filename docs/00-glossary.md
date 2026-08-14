# 00 · Glossary — Kamus Istilah Domain

Istilah operasional pabrik rokok yang dipakai di seluruh documentation pack. **Wajib disepakati sebelum baca dokumen lain.**

---

## Bahan & Produk

| Istilah | Definisi |
|---|---|
| **TSG** | Tembakau Saos Gagang — bahan utama proses. Dikirim ke pabrik dalam **boks** (kotak) yang sudah ditimbang di gudang. Rata-rata satu boks ≈ 29–30 kg. |
| **Bobin** | Kertas rokok gulung yang menyelimuti tembakau. Dipasang di feeder Maker. |
| **Filter** | Bagian ujung batangan rokok. Consumable Maker. |
| **Tipping** | Kertas tipis pembungkus sambungan filter ke batangan. Consumable Maker. |
| **Lem** | Perekat untuk menyambung bobin & tipping. Consumable minor. |
| **Batangan** | Rokok mentah keluar dari Maker sebelum dikemas. Diukur berat (kg) dan jumlah (batang). |
| **Pack** | Rokok yang sudah dikemas HLP siap distribusi. Default: 20 batang per pack. |
| **Batch / Boks Batangan** | Tray/trolley batangan yang keluar dari Maker, siap dikemas HLP. Record dibuat otomatis saat **Sesi Boks** ditimbang, ditandai **Kode Batch `btc_*`** sebagai penanda boks batangan yang akan masuk mesin HLP. |
| **SKU / Produk / Merek** | Contoh: **Hummer** (produk utama). Sistem multi-merek — satu mesin bisa memproduksi produk berbeda antar shift, tapi tidak dalam satu shift yang sama. |

## Mesin

| Istilah | Definisi |
|---|---|
| **Maker** | Mesin pembuat batangan rokok dari TSG + consumables. Contoh code: `MKR-01`, `MKR-02`. Setiap pabrik biasanya punya 1–2 unit. |
| **HLP** | Mesin pengemas (Hopper-Line-Packer). Menerima batangan dari Maker, membungkus jadi pack. Contoh code: `HLP-01`. |
| **Feeder** | Bagian mesin Maker yang menampung TSG untuk diproses. Boks TSG dituang ke feeder saat dipakai. |

## Peran Manusia

| Istilah | Definisi |
|---|---|
| **Super Admin** | Role tertinggi (`scope_level = GLOBAL`) untuk vendor developer + IT lead perusahaan. Akses tak terbatas lintas company, bypass RLS, akses audit trail & security log, impersonate user, force logout. Max 3 aktif, 2FA wajib, session pendek. |
| **Kecer / Operator Kecer** | Operator lantai produksi yang mengoperasikan mesin Maker/HLP dan mencatat produksi. |
| **Ketua Kecer** | Kepala tim shift, penanggung jawab administratif & yang boleh mengakhiri (end) shift di tablet. |
| **Anggota Tim / Pembantu** | Anggota tim shift yang membantu operator utama. Termasuk di absensi shift. |
| **Supervisor Pabrik** | Meng-approve shift report (RUNNING → COMPLETED → APPROVED/LOCKED). |
| **Koordinator Area** | Membawahi beberapa pabrik dalam satu wilayah. Konsumen dashboard rollup. |
| **HQ Analyst / Admin / Auditor** | Level pusat: analyst read-only, admin master data, auditor untuk correction pasca-LOCKED. |

## Konsep Waktu

| Istilah | Definisi |
|---|---|
| **Shift** | Blok waktu kerja satu tim mengoperasikan mesin. Contoh: Shift Siang 05:30–16:30, Shift Malam 16:30–05:30 (13 jam, lintas midnight). |
| **ShiftTemplate** | Master data per pabrik yang mendefinisikan jam mulai + durasi shift. Fleksibel — tidak enum global. |
| **Shift RUNNING** | Status shift saat operator sudah "Start Shift" tapi belum "End Shift". |
| **Shift COMPLETED** | Status setelah operator selesai input semua, menunggu approval supervisor. |
| **Shift APPROVED / LOCKED** | Status final. Data immutable. Sudah masuk rollup Area & HQ. |

## Metrik Produksi

| Istilah | Definisi |
|---|---|
| **Yield (%)** | Rasio berat batangan output vs berat TSG input. Rumus: `(batangan_kg / tsg_kg) × 100%`. Normal range untuk Hummer: **110–114%** (angka >100% karena batangan sudah termasuk berat filter + kertas + lem). |
| **Berat per Batang (gram)** | Rata-rata berat satu batang rokok. Rumus: `(batangan_kg × 1000) / total_batang`. Total batang dihitung dari output HLP: `total_batang = (packs_lolos × isi_per_pack) + reject_batangan`. |
| **OEE** | Overall Equipment Effectiveness — Availability × Performance × Quality. Dihitung dari `actualStart`, `actualEnd`, downtime, dan yield. |

## Kategori Waste (4 kategori)

| Istilah | Definisi |
|---|---|
| **Menir** | Pecahan tembakau kecil hasil sortir/proses. Bisa dijual kembali sebagai bahan sekunder. |
| **Rijekan** | Batangan gagal produksi (patah, tidak standar). Diretur ke proses ulang atau dibuang. |
| **Debu Kasar** | Sisa debu berbutir dari proses. Dikumpulkan untuk pengolahan. |
| **Debu Halus** | Sisa debu tepung/halus dari proses. Nilai jual paling rendah, tapi wajib dicatat untuk analisis waste. |
| **settlementStatus** | Status audit waste: `PENDING` (baru dicatat, belum diserahkan gudang) atau `LUNAS` (sudah ditimbang &amp; diserahkan gudang). Menggantikan tulisan tangan "lunas" di form manual. |

## Konsep Sistem

| Istilah | Definisi |
|---|---|
| **Boks Parsial (`isPartial=true`)** | Boks TSG yang bukan boks baru utuh — merupakan carry-over sisa TSG dari shift sebelumnya via handoff. |
| **Sesi Boks** | Unit kerja boks dalam shift: operator membuka **1–6 boks TSG sekaligus** (memilih sendiri dari inventory; badge FIFO hanya saran) lalu **menimbang batangan kolektif** di akhir sesi. Total batangan dibagi proporsional bobot TSG tiap boks (`splitBatanganProportional`), sisa pembulatan ke boks terakhir. Status sesi: `OPEN` → `WEIGHED`, atau `HANDOFF` bila boks parsial dilanjutkan ke shift berikutnya. |
| **Boks Aktif** | Boks TSG yang sedang diproses operator — bagian dari **Sesi Boks** berstatus `OPEN` (belum ditimbang). |
| **Kode Batch (`btc_`)** | Identitas batch batangan: `btc_{kodeMesin}_{YYYYMMDD}_{urutan}` (contoh `btc_MKR01_20260815_01`). Dibuat otomatis saat sesi ditimbang — penanda boks batangan yang akan masuk mesin HLP. |
| **Shift Handoff** | Mekanisme serah-terima antar shift saat masih ada boks TSG aktif di feeder. Operator lama timbang sisa TSG + batangan sementara → dijadikan record `ShiftHandoff` → shift baru auto-claim. |
| **CORRECTION** | Mekanisme mengoreksi shift yang sudah LOCKED. Bukan UPDATE langsung — dibuat record turunan baru dengan audit trail. Hanya HQ_AUDITOR yang boleh. |
| **Idempotency-Key** | Header HTTP yang memastikan request POST duplikat (mis. karena retry) tidak menciptakan record ganda. Server menyimpan mapping key → response. |
| **RLS** | Row-Level Security — feature PostgreSQL yang otomatis memfilter row berdasarkan session context. Dipakai untuk multi-tenant isolation. |
| **Scope** | Cakupan visibilitas data seorang user: `GLOBAL` (SUPERADMIN), `Company` (HQ), `Region` (Area), atau `Plant`. Satu user bisa punya banyak scope via `UserAssignment`. |
| **Privileged Action** | Aksi yang dilakukan SUPERADMIN (bypass RLS, impersonate, force logout, dsb). Otomatis flag `is_privileged=true` di `audit_log` + broadcast notification ke SUPERADMIN lain (self-policing). |
| **Security Log** | Subset audit log khusus: login attempts (sukses/gagal), permission denied, IP suspicious, session revoked, password reset. Diakses eksklusif oleh SUPERADMIN. |
| **2FA** | Two-Factor Authentication — verifikasi tambahan (WhatsApp OTP atau TOTP app) selain password. Wajib untuk role SUPERADMIN. |

## Master Data

| Istilah | Definisi |
|---|---|
| **Product** | Master data produk (Hummer + SKU lain). Dikelola pusat. |
| **PlantProduct** | Aturan: produk mana boleh diproduksi di pabrik mana. |
| **MachineTemplate** | Konfigurasi (yieldRange, target berat/batang, tolerance) per kombinasi `productId × machineType`. Menentukan indikator warna hijau/merah di tablet. |
| **ConsumableItem** | Master item consumable: Filter, Bobbin, Tipping, dst. Bisa berbeda spec per produk. |
| **Sparepart** | Master item spare part maintenance: Nylon, Pisau Filter, dst. Distinct dari consumable. |
| **ShiftRole** | Master role tim shift, fleksibel per pabrik. Contoh: Ketua Kecer, Operator, Pembantu. |
| **DowntimeCategory** | Kategori berhenti produksi: `GANTI_MATERIAL`, `KENDALA_MESIN`, `TUNGGU_BAHAN`, `ISTIRAHAT_IZIN`, `MAINTENANCE`. |
| **RejectReason** | Alasan reject batangan/pack, master data terpisah dari kategori waste. |

---

## Konvensi Kode Entitas

Sepanjang dokumentasi & aplikasi:

- Plant: `PLT-{kode-kota}-{urut}` — contoh `PLT-MLG-01`, `PLT-KDR-02`
- Machine: `MKR-{urut}` untuk Maker, `HLP-{urut}` untuk HLP — unik per plant
- Product: `PRD-{brand-short}-{variant}` — contoh `PRD-HMR-STD`, `PRD-HMR-LTS`
- Shift ID: `shf_{ulid}` — server-generated ULID (sortable timestamp)
- Batch ID: `btc_{kodeMesin}_{yyyymmdd}_{urut}` — dibuat otomatis saat timbang sesi, contoh `btc_MKR01_20260815_01`
- Boks number: integer 1-N per shift (bukan global unique)
