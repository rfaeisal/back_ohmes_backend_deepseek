# 01 · Product Requirements Document (PRD)

**Product**: MES + WMS Multi-Cabang — sistem terintegrasi untuk penerimaan bahan baku, produksi, dan distribusi pack rokok.
**Produk utama**: Hummer (dengan dukungan multi-merek).
**Skala target**: 30+ pabrik heterogen dalam struktur `Kantor Pusat → Koordinator Area → Pabrik`.
**Scope**: End-to-end 5 tahap — Terima TSG → Simpan TSG → Produksi (Maker+HLP) → Simpan Barang Jadi → Distribusi Basic. **Bukan** full WMS/ERP/TMS.

---

## 1. Latar Belakang & Masalah

### 1.1. Situasi Saat Ini
Pabrik rokok mengoperasikan mesin Maker (pembuat batangan) dan HLP (pengemas) untuk memproduksi rokok. Pencatatan produksi harian dilakukan **manual di kertas** oleh operator kecer per shift (contoh form lihat referensi visual). Data ini kemudian direkap oleh supervisor pabrik dan dikirim ke koordinator area / kantor pusat secara periodik.

### 1.2. Masalah yang Muncul
| Masalah | Dampak |
|---|---|
| **Laporan manual di kertas** — tulisan tangan, kadang tidak terbaca | Data entry ulang di HQ butuh 1–2 hari, sering typo |
| **Tidak ada counter otomatis di Maker** | Total batang harus dihitung dari output HLP, rawan salah |
| **Kalkulasi yield manual per boks** | Kalkulator sering error, operator lelah di akhir shift 12–13 jam |
| **Waste 4 kategori tercatat tidak konsisten** | Kadang lupa isi Menir, kadang Rijekan tidak dibedakan dari Debu |
| **Handoff antar shift tidak terdokumentasi** | Baris 1 shift baru sering anomali (yield literal >300%) → dashboard noisy |
| **Data cukai butuh compliance ketat** | Audit trail manual sulit direkonstruksi jika ada pemeriksaan |
| **Tidak ada visibility real-time ke HQ** | Rollup baru terlihat mingguan/bulanan, tidak bisa reaksi cepat ke masalah |

### 1.3. Peluang
- Standardisasi laporan lintas 30+ pabrik → benchmark internal per produk & mesin.
- Real-time dashboard untuk koordinator area & HQ → deteksi anomali dini.
- Data historis rapi → basis untuk analitik OEE, predictive maintenance (fase lanjut).

---

## 2. Tujuan Bisnis

| # | Tujuan | Metrik Sukses |
|---|---|---|
| G1 | **Digitalisasi pencatatan** — hilangkan kertas di lantai produksi | 100% shift dicatat lewat sistem dalam 3 bulan pasca-rollout |
| G2 | **Real-time visibility** — HQ lihat data harian, bukan mingguan | Dashboard HQ menampilkan data H+0 (setelah APPROVED) |
| G3 | **Standardisasi lintas pabrik** — laporan seragam meski konfigurasi mesin berbeda | Skema data unified; support multi-produk & multi-mesin per pabrik |
| G4 | **Reduksi waste** — visibility 4 kategori waste per pabrik | 5% penurunan Debu Halus dalam 6 bulan pasca full rollout |
| G5 | **Compliance-ready** — audit trail lengkap untuk cukai/BPOM | 100% mutasi punya AuditLog; export cukai bulanan < 30 detik |
| G6 | **Operator productivity** — kurangi waktu closing shift | Waktu end-shift → APPROVED < 30 menit (baseline manual: 2 jam) |

---

## 3. Persona (Konsumen Sistem)

### 3.1. Operator Kecer (Level Pabrik)
- **Konteks**: Berdiri di lantai produksi, tangan kadang kotor, memegang tablet industrial 10 inch.
- **Frekuensi input**: 20–30 kali per shift 13 jam (per boks + event).
- **Goal**: Input cepat & akurat, tanpa menghambat produksi.
- **Frustrasi utama**: UI yang terlalu banyak klik, form field kecil, kalkulator manual di akhir shift.

### 3.2. Ketua Kecer / Supervisor Shift (Level Pabrik)
- **Konteks**: Sama seperti operator, tapi juga bertanggung jawab administratif — start & end shift, koordinasi tim 3–5 orang.
- **Goal**: Pastikan semua data shift lengkap sebelum end, verifikasi handoff bersih.
- **Frustrasi utama**: Ketika data tim di absensi tidak match dengan output.

### 3.3. Supervisor Pabrik / Plant Manager
- **Konteks**: Kantor pabrik, laptop/desktop. Meng-approve shift yang sudah COMPLETED.
- **Goal**: Verifikasi data masuk akal, approve tanpa harus baca detail per boks.
- **Frustrasi utama**: Data anomali (yield ekstrem, waste ekstrem) yang harus digali penyebabnya.

### 3.4. Koordinator Area
- **Konteks**: Kantor area (bisa lokasi berbeda dari pabrik), laptop. Bertanggung jawab 5–15 pabrik.
- **Goal**: Cepat identifikasi pabrik yang bermasalah, drill-down untuk cari root cause.
- **Frustrasi utama**: Dashboard yang menampilkan angka tapi tidak jelas "ini masalah atau normal?" tanpa konteks historis.

### 3.5. HQ Analyst
- **Konteks**: Kantor pusat, konsumen dashboard cross-area untuk laporan management.
- **Goal**: Trend & benchmarking lintas 30+ pabrik, export data untuk laporan pihak eksternal (cukai, direksi).
- **Frustrasi utama**: Data yang tidak konsisten formatnya antar pabrik.

### 3.6. HQ Admin
- **Konteks**: Kantor pusat, mengelola master data (produk, mesin template, role, dsb) dan onboarding pabrik baru.
- **Goal**: Sekali setup master data → seluruh pabrik terpengaruh serentak.
- **Frustrasi utama**: Perubahan master data yang lupa versioned → dashboard historis jadi salah.

### 3.7. HQ Auditor
- **Konteks**: Compliance officer, ad-hoc access saat ada temuan audit.
- **Goal**: Ubah data shift yang sudah LOCKED lewat CORRECTION dengan alasan tertulis.
- **Frustrasi utama**: Sistem yang tidak menyediakan trail correction → tidak bisa jawab pertanyaan auditor eksternal.

### 3.7A. Super Admin (vendor developer + IT lead)
- **Konteks**: Vendor developer sistem + 1-2 IT lead perusahaan. Akses dari kantor / VPN.
- **Frekuensi akses**: jarang (< 5×/bulan pasca-launch), tapi kritikal saat troubleshoot.
- **Goal**: Debugging isu produksi (bypass RLS untuk baca cross-tenant), audit trail security & privileged actions, force logout user compromised, reset password user lain, dan onboarding SUPERADMIN pengganti.
- **Frustrasi utama**: Kalau harus ganti-ganti user login untuk test permission — impersonate menghemat waktu; kalau sistem tidak track privileged actions dengan jelas — hard to audit sendiri.
- **Batasan**: Max 3 aktif per system. Semua aksi ke audit log dengan `is_privileged=true`. Session pendek (JWT 5 menit). 2FA wajib.

### 3.8. Staff Gudang Inbound (Fase 1)
- **Konteks**: Dock area, tablet industrial. Menerima TSG dari supplier.
- **Frekuensi input**: 5–15 pengiriman per hari, per pengiriman 20–100 boks.
- **Goal**: Cepat catat receiving (per boks: kode, berat) + cetak label. Setelah masuk inventory, atur alokasi FIFO ke operator.
- **Frustrasi utama**: Timbangan sync ke tablet lambat; kesulitan kalau supplier kirim tanpa PO reference.

### 3.9. Staff Gudang Outbound (Fase 5)
- **Konteks**: Area gudang barang jadi, tablet + printer label karton.
- **Frekuensi input**: terima pack dari HLP tiap shift; cartoning saat sudah cukup pack terkumpul.
- **Goal**: Match jumlah pack HLP dengan yang diterima; bundle pack ke karton dengan lineage traceable.
- **Frustrasi utama**: Discrepancy antara data MES dan physical count — perlu dispute flow.

### 3.10. Staff Ekspedisi (Fase 6)
- **Konteks**: Dock keluar, tablet + akses printer PDF.
- **Frekuensi input**: 3–10 dispatch order per hari.
- **Goal**: Input customer + pilih karton yang keluar, cetak surat jalan.
- **Frustrasi utama**: Data customer yang harus retype (belum ada CRM/order management terintegrasi).

---

## 4. Fitur Utama — Per Level

### 4.1. Level Pabrik (Tablet Web · Flutter Mobile)
| Fitur | Fase |
|---|---|
| **WMS Inbound**: catat receiving TSG dari supplier (per boks + berat + label) | 1 |
| **WMS Inbound**: inventory dengan location + FIFO enforcement | 1 |
| **WMS Inbound**: alokasi boks ke shift (auto-suggest FIFO, boleh override + audit) | 1 |
| Start Shift dengan pilih ShiftTemplate, Produk, Anggota Tim | 1 |
| Auto-claim handoff dari shift sebelumnya (jika ada) | 1 |
| Input boks TSG (buka dari inventory, timbang selesai) dengan yield indicator | 1 |
| Log event: consumables, downtime, maintenance | 1 |
| Batch tracking per Maker → lineage ke HLP pack | 1 |
| End Shift dengan input 4 kategori waste + settlementStatus | 1 |
| Handoff wajib jika boks aktif belum habis | 1 |
| Approval oleh supervisor pabrik → LOCKED | 1 |
| Dashboard sederhana per pabrik: list shift, KPI harian | 1 |
| QR scan mesin & boks TSG (Flutter) | 3 |
| Offline mode dengan local queue (Flutter) | 3 |
| **WMS Outbound**: auto-receive pack dari HLP saat shift APPROVED | 5 |
| **WMS Outbound**: cartoning — bundle pack ke karton dengan mapping pack↔karton | 5 |
| **WMS Outbound**: dispute/correction untuk count discrepancy | 5 |
| **Distribusi**: buat dispatch order (customer + karton) | 6 |
| **Distribusi**: generate surat jalan PDF | 6 |
| **Distribusi**: track status karton (READY → DISPATCHED) | 6 |

### 4.2. Level Area (Web Dashboard)
| Fitur | Fase |
|---|---|
| List pabrik + status real-time | 2 |
| Rollup KPI harian per pabrik: yield, produksi, waste, downtime | 2 |
| Drill-down ke pabrik → shift → boks | 2 |
| Notifikasi shift menunggu approval > 2 jam | 2 |
| Perbandingan pabrik dalam area | 2 |

### 4.3. Level HQ (Web Dashboard)
| Fitur | Fase |
|---|---|
| Cross-plant KPI: trend yield, OEE, waste | 4 |
| Benchmark per produk lintas pabrik | 4 |
| Waste analysis 4 kategori lintas pabrik | 4 |
| Export cukai bulanan (CSV/Excel) | 4 |
| CORRECTION flow oleh HQ_AUDITOR | 4 |
| Master data governance (Produk, MachineTemplate, ShiftRole, dsb) | 0 |

---

## 5. Non-Functional Requirements

### 5.1. Performance
- **Input boks di tablet**: response < 500ms.
- **Kalkulasi yield server-side**: < 200ms.
- **Dashboard Area load**: < 3 detik (5–15 pabrik).
- **Dashboard HQ load**: < 5 detik (30+ pabrik × 12 bulan data).
- **Export cukai bulanan**: < 30 detik untuk 30 pabrik.

### 5.2. Availability
- **Target uptime**: 99.5% (∼3.5 jam downtime/bulan yang dapat ditolerir).
- **Backend maintenance window**: bukan saat shift MALAM (16:30–05:30 WIB) — mayoritas pabrik operasional.

### 5.3. Security
- Auth: JWT + refresh token (short-lived JWT 15 menit, refresh 30 hari).
- Password: bcrypt, min 8 karakter.
- HTTPS only.
- Rate limiting per user & per IP.
- SQL injection: parameterized queries wajib (Drizzle).

### 5.4. Compliance
- **Audit trail**: setiap mutasi tabel operasional & master data menulis `AuditLog(userId, action, before, after, timestamp)`.
- **Soft delete**: `deletedAt` di semua tabel operasional; data cukai tidak boleh hilang.
- **Immutable shifts**: setelah `APPROVED`, RLS menolak UPDATE. Perubahan hanya lewat CORRECTION.
- **Data retention**: minimal 10 tahun (regulasi cukai).

### 5.5. Compatibility
- **Tablet**: Chrome/Safari terbaru di iPad 10" & tablet Android 10" (industrial-grade).
- **Desktop**: Chrome/Firefox/Safari terbaru.
- **Mobile Flutter**: Android 8+ dan iOS 13+.

### 5.6. Localization
- Fase 1–4: **Bahasa Indonesia only**.
- Zona waktu: WIB (Asia/Jakarta) seragam.

---

## 6. Constraint & Asumsi

### 6.1. Constraint
- Deployment: **online-first, single cloud instance** (bukan on-prem per pabrik, bukan offline-first backend).
- Approval workflow: **1 level saja** — supervisor pabrik. Tidak berjenjang ke area.
- ORM: **Drizzle** (bukan Prisma) untuk mendukung RLS PostgreSQL native.
- Tenancy: **shared schema + `plantId` + RLS** — bukan DB-per-pabrik.

### 6.2. Asumsi
- Setiap pabrik pilot punya WiFi/4G stabil di lantai produksi (fase 1).
- Operator kecer minimal bisa mengoperasikan tablet dasar (tap, swipe, ketik angka).
- Multi-produk: satu mesin bisa berpindah produk antar shift, tapi **tidak dalam satu shift yang sama**.
- Shift bisa lintas midnight (contoh: MALAM 16:30–05:30).
- Master data (Produk, MachineTemplate) dikelola pusat, bukan per pabrik.

---

## 7. Out of Scope (Bukan bagian dari sistem ini)

> **Catatan**: Setelah scope expansion 2026-08-10, warehouse (inbound + outbound) dan distribusi basic **masuk scope** sistem. Item di bawah ini tetap out-of-scope.

- **Payroll / HR** — absensi tim shift hanya untuk konteks operasional, bukan payroll. Ada API export ke sistem HR terpisah.
- **Quality Control (QC) laboratorium TSG** — sample & test kualitas TSG (kadar air, dsb.) di luar scope WMS Inbound Fase 1. Kalau perlu, jadi fase future.
- **Inventory location detail barang jadi** — WMS Outbound Fase 5 hanya track "diterima → cartoning → dispatched", tidak track lokasi rak spesifik.
- **Full Order Management / TMS** — Fase 6 hanya buat dispatch order manual + surat jalan PDF. Bukan sistem CRM/order-to-cash lengkap.
- **Predictive maintenance ML** — bisa ditambahkan pasca Fase 4 sebagai analytics layer.
- **Integrasi ERP** — direncanakan sebagai fase lanjutan (bukan bagian dari 7 fase awal). API export tersedia untuk sinkronisasi ke ERP kalau nanti diadopsi.
- **Mobile untuk supervisor/koordinator** — Flutter di Fase 3 hanya untuk operator lapangan (kecer + gudang). Supervisor pakai web responsive.

---

## 8. Referensi

- [`00-glossary.md`](./00-glossary.md) — istilah domain.
- [`03-architecture.md`](./03-architecture.md) — arsitektur teknis.
- [`04-data-model.md`](./04-data-model.md) — skema data.
- [`08-roadmap.md`](./08-roadmap.md) — fase implementasi.
- [`catatan-diskusi.md`](./catatan-diskusi.md) — log diskusi awal & rasionale.
- [`draft.txt`](./draft.txt) — konsep awal single-plant (superseded).
