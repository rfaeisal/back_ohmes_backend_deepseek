# 13 · Glossary — Kamus Istilah Domain (Mobile v2)

Istilah operasional pabrik rokok yang dipakai di seluruh paket dokumentasi mobile v2. **Wajib disepakati sebelum baca dokumen lain.**

> **Sumber kebenaran**: kode aktual backend `back_ohmes_backend_deepseek` (diverifikasi 2026-08-22). Glossary ini = kamus umum (menggantikan `../mobile-team/04-glossary.md` v1.3.0). Istilah produksi shift dipertahankan sebagai kamus umum tapi ditandai **"tablet web"** bila alurnya berjalan di web/tablet (`/tablet`, `/admin/*`), bukan di mobile v2.

---

## Bahan & Produk

| Istilah | Definisi |
|---|---|
| **TSG** | Tembakau Saos Gagang — bahan utama proses. Dikirim ke pabrik dalam **boks** (kotak) yang sudah ditimbang di gudang. Rata-rata satu boks ≈ 29–30 kg. |
| **Bobin** | Kertas rokok gulung yang menyelimuti tembakau. Dipasang di feeder Maker. *(tablet web — consumable dicatat di tablet)* |
| **Filter** | Bagian ujung batangan rokok. Consumable Maker. *(tablet web)* |
| **Tipping** | Kertas tipis pembungkus sambungan filter ke batangan. Consumable Maker. *(tablet web)* |
| **Lem** | Perekat untuk menyambung bobin & tipping. Consumable minor. *(tablet web)* |
| **Batangan** | Rokok mentah keluar dari Maker sebelum dikemas. Diukur berat (kg) dan jumlah (batang). *(tablet web)* |
| **Pack** | Rokok yang sudah dikemas HLP siap distribusi. Default: 20 batang per pack. *(tablet web)* |
| **Batch (`btc_*`)** | Hasil **timbang kolektif satu Box Session** (1–6 boks) — `POST /box-sessions/:id/weigh` membuat batch dengan kode `btc_{machine}_{yyyymmdd}_{urut}` (contoh `btc_MKR01_20260810_03`). Batch adalah **input HLP** (bahan yang di-packing). *(tablet web — dibuat dari alur produksi tablet)* |
| **SKU / Produk / Merek** | Contoh: **Hummer** (produk utama). Sistem multi-merek — satu mesin bisa memproduksi produk berbeda antar shift, tapi tidak dalam satu shift yang sama. |

## Mesin

| Istilah | Definisi |
|---|---|
| **Maker** | Mesin pembuat batangan rokok dari TSG + consumables. Contoh code: `MKR-01`, `MKR-02`. Setiap pabrik biasanya punya 1–2 unit. *(tablet web — dioperasikan di tablet)* |
| **HLP** | Mesin pengemas (Hopper-Line-Packer). Menerima batangan (batch `btc_*`) dari Maker, membungkus jadi pack. Contoh code: `HLP-01`. *(tablet web)* |
| **Feeder** | Bagian mesin Maker yang menampung TSG untuk diproses. Boks TSG dituang ke feeder saat dipakai. *(tablet web)* |

## Peran Manusia

| Istilah | Definisi |
|---|---|
| **Super Admin** | Role tertinggi (`scope_level = GLOBAL`) untuk vendor developer + IT lead perusahaan. Akses tak terbatas lintas company, bypass RLS, akses audit trail & security log, impersonate user, force logout. Max 3 aktif, 2FA wajib, session pendek (access token 5 menit, refresh 7 hari). Bisa login mobile (jarang). |
| **Kecer / Operator Kecer** | Operator lantai produksi yang mengoperasikan mesin Maker/HLP dan mencatat produksi. *(tablet web — tidak login mobile)* |
| **Ketua Kecer** | Kepala tim shift, penanggung jawab administratif & yang boleh mengakhiri (end) shift di tablet. *(tablet web)* |
| **Anggota Tim / Pembantu** | Anggota tim shift yang membantu operator utama. Termasuk di absensi shift. *(tablet web)* |
| **Supervisor Pabrik / Plant Manager** | Meng-approve shift report (RUNNING → COMPLETED → APPROVED/LOCKED). Approval shift bisa via **mobile** (`POST /shifts/:id/approve`, role `PLANT_MANAGER`) atau web (`/admin/approvals`, role `SHIFT_SUPERVISOR`). |
| **Petugas Label Area (AREA_SJ_OFFICER)** | Role mobile: full flow Surat Jalan supplier di gudang supplier — buat SJ, scan label = assign jenis + berat, tandai SHIPPED. Username seed: `petugassj`. |
| **Gudang Inbound (GUDANG_INBOUND)** | Role mobile: receiving TSG di pabrik — scan label, validasi vs SJ, `from-sj`, timbang manual. Username seed: `gudangin`. |
| **Koordinator Area (AREA_COORDINATOR)** | Membawahi beberapa pabrik dalam satu wilayah. Konsumen dashboard area + stok TSG. Username seed: `area.koordinator`. |
| **Area QA (AREA_QA)** | Read-only: dashboard area + kondisi stok TSG. Username seed: `areaqa`. |
| **HQ Analyst / Admin / Auditor** | Level pusat: analyst read-only, admin master data, auditor untuk correction pasca-LOCKED. *(web — tidak login mobile)* |

## Konsep Waktu

| Istilah | Definisi |
|---|---|
| **Shift** | Blok waktu kerja satu tim mengoperasikan mesin. Contoh: Shift Siang 05:30–16:30, Shift Malam 16:30–05:30 (13 jam, lintas midnight). *(tablet web — input di tablet; status dipantau mobile oleh PLANT_MANAGER)* |
| **ShiftTemplate** | Master data per pabrik yang mendefinisikan jam mulai + durasi shift. Fleksibel — tidak enum global. |
| **Shift RUNNING** | Status shift saat operator sudah "Start Shift" tapi belum "End Shift". *(tablet web)* |
| **Shift COMPLETED** | Status setelah operator selesai input semua, menunggu approval supervisor/plant manager. Notifikasi "menunggu approval >2 jam" tampil di mobile via polling `GET /notifications`. |
| **Shift APPROVED / LOCKED** | Status final. Data immutable. Sudah masuk rollup Area & HQ. Perubahan hanya via CORRECTION (HQ_AUDITOR). |

## Metrik Produksi

| Istilah | Definisi |
|---|---|
| **Yield (%)** | Rasio berat batangan output vs berat TSG input. Rumus: `(batangan_kg / tsg_kg) × 100%`. Normal range untuk Hummer: **110–114%** (angka >100% karena batangan sudah termasuk berat filter + kertas + lem). *(tablet web — kalkulasi server-side, ditampilkan di tablet; mobile hanya lihat KPI dashboard)* |
| **Berat per Batang (gram)** | Rata-rata berat satu batang rokok. Rumus: `(batangan_kg × 1000) / total_batang`. Total batang dihitung dari output HLP: `total_batang = (packs_lolos × isi_per_pack) + reject_batangan`. *(tablet web)* |
| **OEE** | Overall Equipment Effectiveness — Availability × Performance × Quality. Dihitung dari `actualStart`, `actualEnd`, downtime, dan yield. *(tablet web; KPI-nya tampil di dashboard mobile)* |

## Kategori Waste (4 kategori)

| Istilah | Definisi |
|---|---|
| **Menir** | Pecahan tembakau kecil hasil sortir/proses. Bisa dijual kembali sebagai bahan sekunder. *(tablet web)* |
| **Rijekan** | Batangan gagal produksi (patah, tidak standar). Diretur ke proses ulang atau dibuang. *(tablet web)* |
| **Debu Kasar** | Sisa debu berbutir dari proses. Dikumpulkan untuk pengolahan. *(tablet web)* |
| **Debu Halus** | Sisa debu tepung/halus dari proses. Nilai jual paling rendah, tapi wajib dicatat untuk analisis waste. *(tablet web)* |
| **settlementStatus** | Status audit waste: `PENDING` (baru dicatat, belum diserahkan gudang) atau `LUNAS` (sudah ditimbang & diserahkan gudang). *(tablet web)* |

## Alur Supplier & Gudang (mobile)

| Istilah | Definisi |
|---|---|
| **SJ / Surat Jalan Supplier** | Dokumen digital pengiriman TSG dari gudang supplier ke pabrik. Dibuat mobile oleh `AREA_SJ_OFFICER` (`POST /supplier-sj`). Status: `DRAFT` → `SHIPPED` → (receiving) → `RECEIVED`. |
| **SJ DRAFT** | Status awal SJ — label masih boleh di-assign/ditimbang. Mutasi timbang hanya boleh saat DRAFT (`SJ_NOT_DRAFT` kalau dipaksa). |
| **SJ SHIPPED** | Status SJ setelah truk berangkat — semua boks wajib sudah tertimbang dulu. Ditandai via `PATCH /supplier-sj/:id` (`shippedAt` tercatat). Setelah SHIPPED tidak bisa diubah petugas lagi. |
| **Pool Label** | Label QR generik (`tsg_box`) yang **belum terikat SJ** — dicetak di **web area office** (permission `supplier.sj.pool`, printer XPrinter, `GET/POST /supplier-sj/pool` + `POST /supplier-sj/pool/pdf`). Saat petugas scan label pool di gudang supplier, label di-assign ke SJ + diberi jenis (`tsgType`) + berat dalam satu langkah (`POST /supplier-sj/:id/boxes/weigh`). Label punya `labelStatus`: `AVAILABLE` / `ASSIGNED` / `VOID`. |
| **from-sj** | Cara receiving **tanpa timbang ulang**: pabrik verifikasi Surat Jalan (`POST /tsg-receiving/from-sj`), receiving + inventory dibuat otomatis memakai berat timbangan supplier. Opsional kirim `verifiedBoxCodes` (label yang discan saat validasi jumlah di pabrik). |
| **Receiving / TSG Receiving** | Penerimaan TSG di pabrik (tabel `tsg_receiving`). Boks hasil receiving (`tsg_receiving_box`) masuk stok **AVAILABLE** setelah di-approve `PLANT_MANAGER` (`POST /tsg-receiving/:id/approve`). |

## QR (mobile)

| Istilah | Definisi |
|---|---|
| **URI QR / `ohmes://`** | Format URI QR: `ohmes://{type}/{plantCode}/{entityCode}?h=...`. Client **tidak boleh parse sendiri** — kirim URI utuh ke `POST /qr/resolve`; server yang mem-parse + verifikasi HMAC. |
| **`tsg_box`** | Tipe URI QR untuk boks TSG — `ohmes://tsg_box/{plantCode}/{boxCode}?h=...` (contoh boxCode `TSG-240810-001`). QR dinamis dengan HMAC; response resolve berisi `code` + `weightKg` untuk auto-fill. Label pool SJ juga bertipe ini. |
| **`nextAction`** | Field response resolve: `START_SHIFT` / `OPEN_BOX` / `HLP_PACK` / `VIEW_PACK` — penentu navigasi app setelah scan. |
| **`canAccess`** | Field response resolve: `false` = QR milik plant di luar scope user. **Tetap HTTP 200** (server tidak bocorkan keberadaan QR) — client wajib cek dan tampilkan pesan "QR ini untuk pabrik lain". |
| **`qr_registry`** | Tabel registrasi QR (type, entityId, uri, hmac, isActive). QR dinamis di-resolve dengan mencocokkan `?h=` terhadap `hmac` tersimpan (`timingSafeEqual`). |

## Konsep Sistem

| Istilah | Definisi |
|---|---|
| **Box Session** | Model produksi v2: buka **1–6 boks sekaligus** dalam satu sesi (`POST /shifts/:id/box-sessions`, body `inventoryBoxIds` 1–6 + `realWeightKg` opsional). Semua boks dalam sesi dianggap dipakai bersamaan; timbang dilakukan **kolektif** per sesi. Menggantikan model boks-tunggal v1. *(tablet web — dibuat di tablet; konsep penting untuk memahami batch)* |
| **Boks Parsial (`isPartial=true`)** | Boks TSG yang bukan boks baru utuh — merupakan carry-over sisa TSG dari shift sebelumnya via handoff. *(tablet web)* |
| **Shift Handoff** | Mekanisme serah-terima antar shift saat masih ada boks TSG aktif di feeder. Operator lama timbang sisa TSG + batangan sementara → dijadikan record `ShiftHandoff` → shift baru auto-claim. *(tablet web)* |
| **CORRECTION** | Mekanisme mengoreksi shift yang sudah LOCKED. Bukan UPDATE langsung — dibuat record turunan baru dengan audit trail. Hanya HQ_AUDITOR yang boleh. *(web)* |
| **Single-session mobile** | 1 user = 1 sesi mobile aktif. Login di device lain → `409 SESSION_EXISTS` (response memuat info device aktif). Pindah device wajib via revoke SUPERADMIN — tidak ada self-service. |
| **Refresh Token Rotation** | Setiap `POST /auth/refresh` menerbitkan refresh token baru dan langsung meng-invalidasi yang lama. Client wajib simpan token BARU dan serialkan refresh (single-flight) — refresh dua kali dengan token lama → `401 REFRESH_TOKEN_INVALID`. |
| **Scope** | Cakupan visibilitas data seorang user: `GLOBAL` (SUPERADMIN), `Company` (HQ), `Region` (Area), atau `Plant`. Satu user bisa punya banyak scope via `UserAssignment`. Scope REGION otomatis di-expand ke semua plant di region. Switch scope tanpa logout via `POST /auth/switch-scope`. |
| **Idempotency-Key** | **Koreksi v2**: header `Idempotency-Key` **TIDAK di-enforce** backend. Dedup hanya via field body `idempotencyKey` per item di `POST /mobile/sync` — format `<prefix resmi>-<uuid>`, window 24 jam, unik per `(userId, key)`. Replay → server return hasil tersimpan tanpa eksekusi ulang (`isReplay:true`). |
| **`mobile/sync`** | Endpoint flush offline queue: batch 1–50 item, tiap item `{idempotencyKey, method, path, body, queuedAt}`. Semua mutasi mobile lewat queue lokal → di-upload lewat endpoint ini saat online. |
| **`push-register`** | Endpoint daftar/lepas push token (`POST /mobile/push-register`, action `register`/`unregister`) — menulis `push_token` di `user_session`. **FCM server-side belum ada** — push belum dikirim; notifikasi saat ini via polling `GET /notifications`. |
| **RLS** | Row-Level Security — feature PostgreSQL yang otomatis memfilter row berdasarkan session context. Dipakai untuk multi-tenant isolation. |
| **Privileged Action** | Aksi yang dilakukan SUPERADMIN (bypass RLS, impersonate, force logout, dsb). Otomatis flag `is_privileged=true` di `audit_log` + broadcast notification ke SUPERADMIN lain (self-policing). |
| **Security Log** | Subset audit log khusus: login attempts (sukses/gagal), permission denied, IP suspicious, session revoked, password reset. Diakses eksklusif oleh SUPERADMIN. |
| **2FA** | Two-Factor Authentication — verifikasi tambahan selain password. Wajib untuk role SUPERADMIN. **Saat ini bypass** — OTP `000000` (env `OTP_BYPASS_CODE`); Twilio belum terpasang. |

## Master Data

| Istilah | Definisi |
|---|---|
| **Product** | Master data produk (Hummer + SKU lain). Dikelola pusat. *(web)* |
| **PlantProduct** | Aturan: produk mana boleh diproduksi di pabrik mana. *(web)* |
| **MachineTemplate** | Konfigurasi (yieldRange, target berat/batang, tolerance) per kombinasi `productId × machineType`. Menentukan indikator warna hijau/merah di tablet. *(tablet web)* |
| **ConsumableItem** | Master item consumable: Filter, Bobbin, Tipping, dst. Bisa berbeda spec per produk. *(web)* |
| **Sparepart** | Master item spare part maintenance: Nylon, Pisau Filter, dst. Distinct dari consumable. *(web)* |
| **ShiftRole** | Master role tim shift, fleksibel per pabrik. Contoh: Ketua Kecer, Operator, Pembantu. *(web)* |
| **DowntimeCategory** | Kategori berhenti produksi: `GANTI_MATERIAL`, `KENDALA_MESIN`, `TUNGGU_BAHAN`, `ISTIRAHAT_IZIN`, `MAINTENANCE`. *(tablet web)* |
| **RejectReason** | Alasan reject batangan/pack, master data terpisah dari kategori waste. *(tablet web)* |

---

## Konvensi Kode Entitas

Sepanjang dokumentasi & aplikasi:

- Plant: `PLT-{kode-kota}-{urut}` — contoh `PLT-MLG-01`, `PLT-KDR-02`
- Machine: `MKR-{urut}` untuk Maker, `HLP-{urut}` untuk HLP — unik per plant
- Product: `PRD-{brand-short}-{variant}` — contoh `PRD-HMR-STD`, `PRD-HMR-LTS`
- Shift ID: `shf_{ulid}` — server-generated ULID (sortable timestamp)
- Batch ID: `btc_{machine}_{yyyymmdd}_{urut}` — contoh `btc_MKR01_20260810_03` (dibuat oleh timbang kolektif Box Session)
- Boks number: integer 1-N per shift (bukan global unique)
- URI QR: `ohmes://{type}/{plantCode}/{entityCode}` — type lowercase: `machine`, `tsg_box`, `batch`, `pack`
