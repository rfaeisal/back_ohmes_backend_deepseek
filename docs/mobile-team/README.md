# MES + WMS Hummer — Paket Dokumentasi Tim Mobile (Flutter)

**Versi paket**: v1.0.0
**Snapshot dari master docs**: 2026-08-10
**Untuk**: tim pengembang aplikasi mobile Flutter (Android + iOS).

---

## Apa Ini?

Paket dokumentasi **mandiri & terkurasi** untuk tim mobile Flutter yang mengerjakan aplikasi lapangan **MES + WMS Hummer** — sistem produksi pabrik rokok multi-cabang.

Paket ini berisi **hanya** informasi yang relevan implementasi client mobile. Detail internal (data model backend, roadmap, business flow ops, dashboard supervisor/HQ) **tidak** disertakan — tanya PM/backend lead kalau butuh.

---

## Cara Baca — Urutan yang Disarankan

Total waktu baca ~1.5 jam untuk pemahaman awal.

| # | File | Waktu | Kapan baca |
|---|---|---|---|
| **0** | [`00-mobile-brief.md`](./00-mobile-brief.md) | 5 mnt | **Wajib pertama** — apa & untuk siapa |
| **1** | [`01-app-spec.md`](./01-app-spec.md) | 30 mnt | Spesifikasi lengkap app: auth, single-session, offline, deep link |
| **2** | [`02-api-contract.md`](./02-api-contract.md) | 30 mnt | Endpoint yang app panggil (auth, ops, WMS, QR) |
| **3** | [`03-qr-strategy.md`](./03-qr-strategy.md) | 15 mnt | QR lifecycle & format URI |
| **4** | [`04-glossary.md`](./04-glossary.md) | 5 mnt | Referensi istilah domain (baca sesuai kebutuhan) |
| **5** | [`05-rbac-mobile.md`](./05-rbac-mobile.md) | 10 mnt | Permission per role untuk endpoint mobile |
| **6** | [`06-design-system.md`](./06-design-system.md) | 20 mnt | Colors, typography, tap targets, komponen, accessibility |
| **7** | [`07-analytics-events.md`](./07-analytics-events.md) | 15 mnt | Firebase Analytics event catalog + FCM push notification |
| **8** | [`08-deployment-store.md`](./08-deployment-store.md) | 15 mnt | Play Store + App Store + MDM distribution + release checklist |
| **9** | [`09-testing-device-matrix.md`](./09-testing-device-matrix.md) | 20 mnt | Device matrix, manual QA checklist, accessibility test |
| **10** | [`10-supplier-sj-app.md`](./10-supplier-sj-app.md) | 30 mnt | **Fitur baru**: Surat Jalan Supplier — kontrak API & flow app (petugas area + gudang inbound) |
| — | [`CHANGELOG.md`](./CHANGELOG.md) | — | History versi paket |

---

## Prasyarat Teknis

- **Flutter**: 3.16+ (Dart 3.x).
- **Target Android**: 8.0+ (API 26+).
- **Target iOS**: 13+.
- **Packages utama** (rekomendasi):
  - `mobile_scanner` — QR/barcode scanner
  - `drift` — SQLite ORM untuk local queue
  - `flutter_secure_storage` — token storage
  - `dio` atau `http` — HTTP client
  - `firebase_messaging` — push notification (Android FCM + iOS APNs)

---

## Backend

- **Base URL** (staging/prod akan diberikan PM saat kick-off).
- **API versi**: v1.
- **Format**: JSON, UTF-8.
- **Auth**: JWT + refresh token. Untuk SUPERADMIN wajib 2FA (OTP).

---

## Aturan Kritikal (Wajib Dipahami di Awal)

1. **Single-session mobile** — 1 user hanya boleh 1 sesi aktif di mobile. Pindah device wajib SUPERADMIN revoke sesi lama dulu.
2. **Idempotency-Key** wajib di setiap POST/PATCH — mencegah dobel-record saat retry.
3. **Offline tolerance** — semua mutasi harus masuk local queue kalau network gagal, retry dengan idempotency.
4. **Kalkulasi server-side** — jangan pernah hitung yield / berat per batang di client. Kirim raw data, server hitung.
5. **QR dinamis pakai HMAC** — server verify anti-forgery.

---

## Kontak

| Peran | Nama | Kontak |
|---|---|---|
| Product Manager | *(tulis di sini)* | *(email/WA)* |
| Backend Lead | *(tulis di sini)* | *(email/WA)* |
| Design Lead | *(tulis di sini)* | *(email/WA)* |

---

## Cara Report Isu

- Bug backend / API tidak sesuai spec → escalate ke Backend Lead.
- Kebutuhan endpoint tambahan → discuss dengan PM.
- Update spec dari master docs → cek [`CHANGELOG.md`](./CHANGELOG.md) untuk versi terbaru.

---

*Paket ini adalah snapshot per {tanggal di CHANGELOG}. Kalau ada update spec dari master docs, PM akan re-generate paket & kirim ulang. Jangan share paket ini di luar tim tanpa persetujuan.*
