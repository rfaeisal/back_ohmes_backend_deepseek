# Draft RAB — Aplikasi Mobile (untuk diisi Tim Mobile)

> Dokumen pelengkap `docs/spesifikasi-teknis-acuan-rab.pdf` (sisi backend/web).
> Bagian yang sudah diketahui dari sisi backend diisi otomatis; bagian kosong
> bertanda **`[ISI TIM MOBILE]`**. Setelah diisi, dokumen ini bisa dijadikan
> lampiran RAB keseluruhan.

---

## 1. Identitas Aplikasi

| Item | Isi |
|---|---|
| Nama aplikasi | flutter_ohmes_claude |
| Versi terbaru | 0.2.1+2010 |
| Platform | Android (iOS `[ISI TIM MOBILE]`) |
| Repositori | `flutter_ohmes_claude` |
| Distribusi | `[ISI TIM MOBILE]` (Play Store / APK internal / App Center) |
| Bahasa | `[ISI TIM MOBILE]` |
| Tim pengembang | `[ISI TIM MOBILE]` |

## 2. Tech Stack Mobile

| Komponen | Teknologi |
|---|---|
| Framework | Flutter (Dart SDK ^3.12.0) |
| State management | flutter_riverpod 2.6 |
| Routing | go_router 14.6 |
| HTTP client | dio 5.7 |
| Local storage aman | flutter_secure_storage 9.2 |
| DB lokal | drift 2.20 + sqlite3_flutter_libs |
| QR scanning | mobile_scanner 5.2 |
| Konektivitas | connectivity_plus 6.1 |
| Device info | device_info_plus, package_info_plus |
| Push notification | `[ISI TIM MOBILE]` (firebase_messaging versi? APNs untuk iOS?) |
| Arsitektur folder | core / data / features (auth, mobile, monitoring, onboarding, receiving, shared, sj, support) |

## 3. Fitur Mobile yang Sudah Ada (terverifikasi dari backend + struktur repo)

- [x] Login + OTP 2 lapis + switch scope (multi plant)
- [x] Approve shift (detail shift, boks produksi, yield)
- [x] Receiving TSG (verifikasi, reject receiving)
- [x] Surat Jalan Supplier (sj) — scan pool label / verifikasi
- [x] Monitoring / dashboard `[ISI TIM MOBILE — rincian layar]`
- [x] Onboarding `[ISI TIM MOBILE — isi]`
- [x] Support `[ISI TIM MOBILE — isi]`
- [x] FCM push + deep-link (shift_id / receiving_id / sj_id; rilis v0.2.1+2006)
- [ ] `[ISI TIM MOBILE — fitur lain yang belum tercatat di sini]`

## 4. Integrasi dengan Backend

- Kontrak API: REST `/api/v1`, error-envelope standar + requestId (koordinasi wajib, lihat `docs/06-api-spec.md`)
- Payload FCM deep-link (mobile parse):
  | Route | Key data |
  |---|---|
  | /shifts/:id | `shift_id` |
  | /receiving/:id | `receiving_id` |
  | /sj/:id | `sj_id` |
  - `data.type`: SHIFT_COMPLETED / RECEIVING_PENDING / EXTERNAL_BATANGAN_PENDING / HLP_REJECT_HIGH
- Field baru menunggu render mobile: `tsgType` di `boxes` (GET /shifts/:id dan GET /shifts/:id/box-sessions)

## 5. Rilis & QA

| Item | Isi |
|---|---|
| Versi QA terpasang | v0.2.1+2006 (HP QA Infinix X6882) |
| Versi terbaru repo | 0.2.1+2010 |
| Device QA | `[ISI TIM MOBILE — daftar device + OS]` |
| Skenario QA | deep-link tap (foreground/background/cold-start), `[ISI TIM MOBILE]` |

## 6. Perangkat & Infrastruktur Mobile

- HP Android per role lapangan: `[ISI TIM MOBILE — jumlah & spesifikasi per pabrik]`
- Akun developer store: `[ISI TIM MOBILE]` (Play Console? Apple Developer?)
- Firebase project: `back-ohmes` (dipegang IT resmi — koordinasi service account dengan backend)

## 7. Sisa Pengembangan Mobile (candidate backlog)

- [ ] Render `tsgType` di detail shift (approve)
- [ ] Halaman external/makloon receiving (`external_receiving_id` — saat ini fallback beranda)
- [ ] Halaman detail batch / HLP (push HLP_REJECT_HIGH — saat ini fallback beranda)
- [ ] `[ISI TIM MOBILE — backlog lain]`

## 8. Estimasi Biaya & Upaya — untuk diisi Tim Mobile

| Item | Estimasi | Catatan |
|---|---|---|
| Effort sisa pengembangan (daftar seksi 7) | `[ISI TIM MOBILE]` | |
| Maintenance bulanan | `[ISI TIM MOBILE]` | |
| Biaya store / signature / distribusi | `[ISI TIM MOBILE]` | |
| Perangkat pengujian | `[ISI TIM MOBILE]` | |
| `[ISI TIM MOBILE — baris lain]` | | |

---

**Catatan:** angka sisi backend/web ada di `docs/spesifikasi-teknis-acuan-rab.pdf`.
Setelah diisi, PDF acuan + dokumen ini digabung menjadi satu paket RAB.
