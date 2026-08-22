# CHANGELOG — Documentation Pack Mobile

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.0.0/). Versi paket = versi kontrak dokumentasi, bukan versi app.

---

## [v2.0.0] — 2026-08-22

### Breaking
- **Redesign role mobile**: operator lantai (`OPERATOR_KECER`, `OPERATOR_MEMBER`) **keluar** dari mobile (cukup tablet web). Yang masuk mobile: `AREA_SJ_OFFICER` (full flow SJ), `GUDANG_INBOUND` (receiving), `PLANT_MANAGER` (dashboard pabrik + stok TSG + aksi ringan), `AREA_COORDINATOR` (dashboard area + stok TSG), `AREA_QA` (read-only), `SUPERADMIN` (jarang).
- **Model produksi bergeser ke Box Session**: buka 1–6 boks sekaligus (`POST /shifts/:id/box-sessions`) + timbang kolektif → membentuk batch `btc_*`. Paket lama masih memodelkan boks-tunggal.
- **Offline queue resmi via `POST /mobile/sync`** (batch 1–50, idempotency per item) — menggantikan pola retry per-request manual.

### Ditambahkan
- Kontrak lengkap ±44 endpoint mobile-relevant, diverifikasi langsung dari route.ts (bukan salinan doc lama).
- Spec layar detail flow Surat Jalan supplier (satu-satunya flow dengan screen blueprint).
- Dokumen alur receiving gudang & monitoring dashboard (tanpa spec layar).
- Base URL produksi aktual: `https://ohmes.fzdev.my.id`.
- `09-design-system.md` (salinan design system v1 + komponen baru: scan label SJ, pool counter, badge status SJ, kartu stok TSG) dan `10-analytics-events.md` (katalog event + strategi notifikasi v2).

### Dikoreksi (vs v1.3.0 — yang lama salah)
- `POST /shifts/:id/end` aktual **PATCH**.
- Master data GET tanpa query param; `GET /users` auth-only tanpa param.
- `GET /auth/me/sessions` dan `GET /downtime-categories` **tidak ada** — dihapus dari kontrak.
- QR type aktual `tsg_box` (bukan `tsg`); response resolve = `{type, entity, plantId, canAccess, nextAction}` (bukan `hmacValid`/`lineage`); `canAccess:false` tetap HTTP 200 (bukan 403).
- `X-Client-Version` / `426 UPGRADE_REQUIRED` **tidak diimplementasikan backend** — semua klaim dihapus.
- Idempotency-Key tidak di-enforce di endpoint umum; dedup hanya `mobile/sync`.
- Push register aktual `POST /mobile/push-register` (bukan `/auth/me/register-push-token`); FCM server-side belum ada — notifikasi via polling `GET /notifications`.
- Event produksi operator (`shift_*`, `box_*`, `handoff_*`) dihapus dari katalog analytics — flow operator = tablet web, bukan scope mobile v2.
- Test credentials aktual seed: `petugassj`/`gudangin`/`plantmanager`/`12345678`, admin via env.

### Referensi
- Rasional keputusan redesign: `docs/catatan-diskusi.md` §15.

## Riwayat pack lama (arsip)

v1.0.0 – v1.3.0 ada di `../mobile-team/CHANGELOG.md` (pack lama, tidak dipakai lagi).
