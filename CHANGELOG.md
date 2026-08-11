# CHANGELOG

Semua perubahan penting pada sistem MES + WMS Hummer tercatat di sini.

Format: [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) · Semver: [SemVer](https://semver.org/lang/id/).

Tipe entry:
- **Added** — fitur baru
- **Changed** — perubahan behavior existing
- **Deprecated** — fitur yang akan dihapus
- **Removed** — fitur yang sudah dihapus
- **Fixed** — bugfix
- **Security** — patch keamanan
- **Docs** — dokumentasi only

---

## [Unreleased]

Fitur / perbaikan yang belum di-release.

### Added
- (belum ada)

---

## [0.1.0-docs] — 2026-08-10

**Documentation-only release.** Belum ada source code — semua persiapan dokumentasi sebelum Fase 0 coding dimulai.

### Docs
- Documentation pack lengkap (23 file di `docs/`, ~10.5k baris):
  - Master pack: glossary, PRD, user stories, architecture (9 ADR), data model (Drizzle + RLS), RBAC matrix (13 role incl. SUPERADMIN), API spec, QR strategy, roadmap 7 fase, spec detail Fase 1 + WMS Inbound/Outbound + Dispatch, mobile app spec.
  - Production readiness: deployment infra, testing strategy, observability, operations runbook, backup/DR, data migration, error catalog, data retention & classification, compliance PDP.
- Paket mobile team di `docs/mobile-team/` (12 file mandiri siap kirim as ZIP).
- Root repo files: README, CLAUDE.md, SETUP.md, CONTRIBUTING.md, SECURITY.md, LICENSE, .env.example, docker-compose.dev.yml, CI workflow template.

### Decisions Kunci (dari `docs/catatan-diskusi.md`)
- Multi-tenant shared schema + RLS PostgreSQL (bukan DB per pabrik).
- Drizzle ORM (bukan Prisma) — RLS support lebih native.
- JWT + refresh token + 2FA untuk SUPERADMIN (bukan NextAuth cookie).
- Waste 4 kategori dengan `settlementStatus` — Menir, Rijekan, Debu Kasar, Debu Halus.
- Shift Handoff eksplisit untuk carry-over TSG antar shift.
- Multi-produk (Hummer + SKU lain) dengan `MachineTemplate` per produk.
- Tim shift many-to-many dengan `ShiftRole` fleksibel per pabrik.
- WMS Inbound bundled di Fase 1 (bareng MES produksi).
- Single-session mobile — pindah device wajib SUPERADMIN revoke.
- SUPERADMIN max 3 aktif per system.
- Approval 1 level → LOCKED, perubahan pasca-LOCKED lewat CORRECTION.

### Scope Milestone
- **Fase 0 (Foundation)**: multi-tenant + RBAC + auth + master data. Est. 3-4 minggu.
- **Fase 1 (Pilot)**: MES + WMS Inbound end-to-end di 1 pabrik. Est. 6-8 minggu.
- **Total roadmap**: 7 fase, 30-36 minggu ke production penuh 30+ pabrik.

---

## Format Entry Selanjutnya

```
## [X.Y.Z] — YYYY-MM-DD

### Added
- Fitur baru dengan link ke issue/PR.

### Changed
- Perubahan behavior + migration note kalau breaking.

### Fixed
- Bug fix dengan reference issue.

### Security
- Patch security (CVE atau internal ref).
```

**Versioning**:
- **MAJOR** (X): breaking change di API/data model.
- **MINOR** (Y): fitur baru non-breaking.
- **PATCH** (Z): bugfix / doc update.

Tag di git: `v0.1.0`, `v0.2.0-beta`, dst. Release notes juga di GitHub Releases.
