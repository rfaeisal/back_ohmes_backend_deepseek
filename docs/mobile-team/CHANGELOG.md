# CHANGELOG — Paket Dokumentasi Tim Mobile

Log perubahan paket kurasi. Untuk update master docs (di luar paket ini), tanya PM.

---

## v1.2.0 — 2026-08-15

**Fitur baru: Surat Jalan Supplier (pre-labeling & pre-weighing TSG)**.

**Added**:
- `10-supplier-sj-app.md` — kontrak API & flow aplikasi SJ: petugas area (buat SJ, scan label, input berat supplier, SHIPPED) + gudang inbound pabrik (validasi JUMLAH boks sesuai SJ, terima). Validasi berat di pabrik = TODO tahap berikutnya (berat real diinput saat masuk mesin Maker via tablet web).

**Test user baru**:
- `petugassj` / `12345678` — role `AREA_SJ_OFFICER` (scope REGION)

**Endpoint baru**: `/supplier-sj` (CRUD), `/supplier-sj/options`, `/supplier-sj/labels/:boxCode`, `/supplier-sj/:id/boxes/weigh`, `/tsg-receiving/from-sj`, `/tsg-receiving/:id/approve`.

**Reference master commit**: lihat git history root repo (Agustus 2026 — fitur Surat Jalan Supplier).

---

## v1.1.0 — 2026-08-11

**Production-ready expansion**.

**Added**:
- `06-design-system.md` — colors, typography, spacing, component library, accessibility (WCAG AA)
- `07-analytics-events.md` — Firebase Analytics event catalog (~30 events) + FCM push notification spec
- `08-deployment-store.md` — Play Store + App Store submission + MDM distribution + release checklist
- `09-testing-device-matrix.md` — device matrix Android/iOS, manual QA checklist, accessibility & performance test

**Changed**:
- `README.md` — reading order updated (total ~1.5h → 2.5h untuk pemahaman lengkap)
- `04-glossary.md` — updated dari master

**Reference master commit**: `60ac93b` — root repo pack v0.1.0-docs.

---

## v1.0.0 — 2026-08-10

**Initial snapshot** dari master docs v2 (post scope expansion + SUPERADMIN + single-session mobile).

**Isi paket**:
- `README.md` — entry point paket.
- `00-mobile-brief.md` — ringkasan bisnis 1 halaman (BARU, kurasi khusus mobile).
- `01-app-spec.md` — spec app Flutter (dari master `13-mobile-app-spec.md`).
- `02-api-contract.md` — API contract mobile-relevant (curated dari master `06-api-spec.md`).
- `03-qr-strategy.md` — QR strategy & lifecycle (dari master `07-qr-strategy.md`).
- `04-glossary.md` — kamus istilah domain (dari master `00-glossary.md`).
- `05-rbac-mobile.md` — RBAC mobile-relevant (curated dari master `05-rbac-matrix.md`).

**Fitur yang dicakup**:
- Auth JWT + refresh + 2FA untuk SUPERADMIN.
- Single-session enforcement (409 SESSION_EXISTS di device kedua).
- Endpoint operasional Fase 1: shift lifecycle, TSG box, consumables, downtime, maintenance, handoff, waste 4 kategori.
- Endpoint WMS Inbound: receiving TSG, inventory FIFO.
- QR 4 jenis: machine, tsg, batch, pack.
- Local queue offline, deep link, push notification stub.

---

## Format Entry Future

Setiap update paket:

```
## vX.Y.Z — YYYY-MM-DD

**Perubahan**:
- {deskripsi ringkas per bullet}

**File yang berubah**:
- {file} — {alasan}

**Reference master commit**: {hash atau tanggal master docs update}
```

---

## Versioning

- **MAJOR** (X): breaking change di API contract atau aturan bisnis inti.
- **MINOR** (Y): endpoint tambahan, fitur baru non-breaking.
- **PATCH** (Z): typo, klarifikasi, koreksi minor.
