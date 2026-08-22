# Documentation Pack v2 — Aplikasi Mobile MES + WMS Hummer (Flutter)

**Versi paket**: v2.0.0 · **Tanggal snapshot**: 2026-08-22 · **Status backend**: live production

Paket dokumentasi ini adalah **kontrak kerja tim mobile** untuk membangun ulang aplikasi Flutter dari nol. Semua isi diverifikasi terhadap kode backend branch `main` (2026-08-22). Kalau ada perbedaan antara dokumen ini dan perilaku backend — **backend adalah sumber kebenaran**, laporkan ke backend team.

> ⚠️ Pack lama `../mobile-team/` (v1.3.0) sudah usang dan tidak lagi dipakai — jangan jadikan referensi.

---

## Base URL

| Environment | URL |
|---|---|
| Production | `https://ohmes.fzdev.my.id` |
| Staging | *(belum tersedia)* |

Semua endpoint: `/api/v1/...`

## Urutan baca

| Prioritas | File | Untuk siapa |
|---|---|---|
| 1 | [`00-brief.md`](./00-brief.md) | Semua — konteks bisnis & siapa penggunanya |
| 2 | [`01-rbac-mobile.md`](./01-rbac-mobile.md) | Semua — role & permission (sumber kebenaran) |
| 3 | [`02-auth-session.md`](./02-auth-session.md) | Dev auth / session |
| 4 | [`03-api-contract.md`](./03-api-contract.md) | Dev API — kontrak lengkap per endpoint |
| 5 | [`04-qr-strategy.md`](./04-qr-strategy.md) | Dev fitur QR |
| 6 | [`05-offline-sync.md`](./05-offline-sync.md) | Dev offline queue |
| 7 | [`06-flow-supplier-sj.md`](./06-flow-supplier-sj.md) | Dev + PM — spec layar SJ (detail) |
| 8 | [`07-flow-receiving.md`](./07-flow-receiving.md) | Dev + PM — alur receiving gudang |
| 9 | [`08-flow-monitoring.md`](./08-flow-monitoring.md) | Dev + PM — alur dashboard & stok TSG |
| 10 | [`09-design-system.md`](./09-design-system.md) | Designer / dev UI |
| 11 | [`10-analytics-events.md`](./10-analytics-events.md) | Dev + analis |
| 12 | [`11-testing-matrix.md`](./11-testing-matrix.md) | QA |
| 13 | [`12-deployment-store.md`](./12-deployment-store.md) | Dev + release |
| 14 | [`13-glossary.md`](./13-glossary.md) | Semua — istilah domain |

## Aturan kritikal (wajib dipatuhi)

1. **Kalkulasi server-side** — yield, berat per batang, dan semua kalkulasi produksi dihitung server. Client **tidak boleh** menghitung sendiri.
2. **Single-session mobile** — 1 user hanya 1 sesi mobile aktif. Login device kedua → `409 SESSION_EXISTS`. Pindah device wajib lewat revoke SUPERADMIN. Detail: [`02-auth-session.md`](./02-auth-session.md) §3.
3. **Offline queue** — semua mutasi dari mobile lewat queue lokal → batch upload via `POST /mobile/sync`. Detail: [`05-offline-sync.md`](./05-offline-sync.md).
4. **QR tidak boleh di-parse client** — kirim URI utuh ke `POST /qr/resolve`. Detail: [`04-qr-strategy.md`](./04-qr-strategy.md).
5. **Idempotency-Key header TIDAK di-enforce** di endpoint umum — deduplikasi hanya di `mobile/sync` (per item). Jangan mengandalkan header itu.
6. **Tidak ada force-update berbasis `X-Client-Version`** di backend — jangan bangun gating update dari header itu.
7. **OTP 2FA saat ini bypass** (`000000`) — Twilio belum terpasang. SUPERADMIN tetap wajib kirim field `otp`. Detail: [`02-auth-session.md`](./02-auth-session.md) §4.

## Test credentials (production)

| User | Password | OTP | Keterangan |
|---|---|---|---|
| `petugassj` | `12345678` | `000000` | AREA_SJ_OFFICER (flow SJ) |
| `gudangin` | `12345678` | `000000` | GUDANG_INBOUND (receiving) |
| `plantmanager` | `12345678` | `000000` | PLANT_MANAGER (monitoring + aksi) |
| `area.koordinator` | `12345678` | `000000` | AREA_COORDINATOR (dashboard area) |
| `areaqa` | `12345678` | `000000` | AREA_QA (read-only) |
| `admin` | `SUPERADMIN_DEFAULT_PASSWORD` (env) | `000000` | SUPERADMIN |

## Kontak

- Backend team: *(isi)*
- PM: *(isi)*
- Mobile lead: *(isi)*

---

## Riwayat paket

Lihat [`CHANGELOG.md`](./CHANGELOG.md).
