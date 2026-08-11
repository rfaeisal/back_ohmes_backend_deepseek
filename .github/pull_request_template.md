## Ringkasan

<!-- 1-3 kalimat: apa yang diubah & kenapa. -->

## Type

- [ ] `feat` — fitur baru
- [ ] `fix` — bugfix
- [ ] `docs` — dokumentasi only
- [ ] `refactor` — refactor tanpa perubahan behavior
- [ ] `test` — tambah/perbaiki test
- [ ] `chore` — maintenance
- [ ] `perf` — improvement performance
- [ ] `security` — patch security

## Changes

<!-- Bullet list perubahan spesifik. -->

- [ ] Change 1
- [ ] Change 2

## Breaking Change?

- [ ] Ya — jelaskan migration di bawah + bump MAJOR di CHANGELOG
- [ ] Tidak

<!-- Kalau ya, tuliskan migration steps. -->

## Testing

- [ ] Unit test — coverage tetap ≥ 80%
- [ ] Integration test — endpoint + RLS
- [ ] E2E test (kalau UI/journey change)
- [ ] Manual test — langkah reproducible

<!-- Deskripsikan skenario test yang di-cover. -->

## RLS / Multi-Tenant

<!-- Wajib kalau ada tabel baru atau query cross-plant. -->

- [ ] N/A (tidak affect data)
- [ ] Tabel baru — RLS policy added + tested
- [ ] Query baru — sudah pakai `withScope()` helper
- [ ] Test cross-plant isolation lulus

## Docs

- [ ] Update `docs/XX-*.md` sesuai perubahan
- [ ] Update `docs/mobile-team/` kalau affect mobile API
- [ ] Update `CHANGELOG.md` (kalau release-worthy)
- [ ] Update `docs/20-api-error-catalog.md` kalau ada error code baru

## Security Impact

- [ ] N/A
- [ ] Affect auth/session — reviewed dengan security lead
- [ ] Affect audit log — verified log entry lengkap
- [ ] Affect SUPERADMIN privilege — reviewed dengan security lead

## Screenshot / Video (kalau UI change)

<!-- Attach screenshot atau loom. -->

## References

<!-- Link issue, PR terkait, spec doc. -->

Closes #___
Refs: `docs/XX-*.md`

## Pre-merge Checklist

- [ ] `pnpm lint` pass
- [ ] `pnpm typecheck` pass
- [ ] `pnpm test` pass
- [ ] `pnpm build` pass (local verify)
- [ ] Conventional Commits format
- [ ] Reviewer minimal 1 approve
- [ ] Migration reversible (kalau ada)
- [ ] Tidak commit secret / .env
- [ ] Codeowners review (auto-assigned)
