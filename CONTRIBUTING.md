# CONTRIBUTING.md — Panduan Kontribusi

Terima kasih untuk kontribusinya! Panduan ini merangkum workflow, konvensi, dan checklist agar merge PR lancar.

---

## Prinsip Umum

1. **Baca dulu, kode kemudian**. Sebelum PR baru, cek dokumentasi relevan di `docs/` — hindari duplikasi atau deviasi dari spec.
2. **Kode = kontrak**. Setiap PR mempengaruhi tim lain (frontend, mobile, ops). Test & dokumentasi mandatory.
3. **Prefer edit dari refactor besar**. Kalau bisa fix di 5 baris, jangan restructure 500 baris.
4. **Konvensi lebih penting dari preferensi personal**. Ikuti CLAUDE.md.

---

## Workflow Kontribusi

### 1. Ambil / Buat Ticket
- Cek issue tracker (GitHub Issues atau tools tim).
- Kalau bug: reproduce dulu di local, sertakan langkah di deskripsi.
- Kalau fitur baru: cek `docs/02-user-stories.md` — sudah ada storyID belum?

### 2. Buat Branch
```bash
git checkout main
git pull
git checkout -b <type>/<nama-singkat>
```

Naming:
- `feat/shift-handoff-flow`
- `fix/rls-cross-plant-leak`
- `docs/update-api-spec`
- `refactor/consolidate-audit-helpers`
- `chore/upgrade-drizzle`
- `test/e2e-shift-approval`

### 3. Coding

Baca dulu:
- [`CLAUDE.md`](./CLAUDE.md) — konvensi wajib.
- [`docs/04-data-model.md`](./docs/04-data-model.md) — skema data (jangan modif tanpa sync ADR).
- [`docs/06-api-spec.md`](./docs/06-api-spec.md) — API contract.
- [`docs/15-testing-strategy.md`](./docs/15-testing-strategy.md) — level test yang diperlukan.

Prinsip coding:
- TypeScript strict, tanpa `any`.
- Zod validation di boundary.
- Server-side calculation untuk semua business logic.
- RLS-aware — set session variable sebelum query.
- Idempotency-Key di POST/PATCH.
- Audit log untuk mutasi.

### 4. Commit — Conventional Commits

Format:
```
<type>(<scope>): <subject>

<body opsional>

<footer opsional>
```

Type:
- `feat` — fitur baru
- `fix` — bugfix
- `docs` — dokumentasi only
- `refactor` — refactor tanpa change behavior
- `test` — tambah/perbaiki test
- `chore` — maintenance (dependency, build)
- `perf` — improvement performance
- `style` — formatting (tidak affect logic)

Scope (opsional): area code (mis. `auth`, `shift`, `wms-inbound`).

Contoh:
```
feat(shift): implement handoff flow at end shift

Add ShiftHandoff table + endpoints for weighing sisa TSG
& batangan sementara at shift-end when active box exists.

- Add DB migration + Drizzle schema
- POST /shifts/:id/handoff endpoint with permission check
- Auto-claim in POST /shifts/start when unclaimed handoff exists
- Unit + integration tests

Refs: docs/09-fase-1-pilot-spec.md §3.4
```

Subject:
- Max 72 karakter.
- Lowercase, imperative ("add", not "added" or "adds").
- No period di akhir.

Body:
- Explain **what** dan **why**, bukan **how**.
- Wrap 72 karakter.

### 5. Sebelum Push

Wajib pass:
```bash
pnpm lint          # ESLint
pnpm typecheck     # TypeScript
pnpm test          # Unit + integration
```

Nice-to-have:
```bash
pnpm test:e2e      # E2E kalau relevant
pnpm build         # Build local — catch build error dini
```

### 6. Buat PR

```bash
git push -u origin <branch>
gh pr create
```

PR template minimal:
```markdown
## Ringkasan
(1-3 kalimat: apa yang diubah & kenapa)

## Changes
- [ ] Change 1
- [ ] Change 2

## Testing
- [ ] Unit test: <deskripsi>
- [ ] Integration test: <deskripsi>
- [ ] Manual test: <langkah>

## Docs
- [ ] Update `docs/XX-*.md` sesuai perubahan
- [ ] Update `docs/mobile-team/` kalau affect mobile API
- [ ] Update CHANGELOG (kalau release-worthy)

## Checklist
- [ ] Lint + typecheck + test pass
- [ ] Screenshot / video kalau UI change
- [ ] Breaking change? → tandai di title & body
- [ ] RLS test — kalau ada tabel baru
- [ ] Migration reversible

Refs: #issueId, docs/XX
```

### 7. Code Review

- Minimal 1 reviewer approve sebelum merge.
- Reviewer cek: correctness, test coverage, konvensi CLAUDE.md, dokumentasi update.
- Kalau reviewer request changes, address semua sebelum re-request review.
- **Jangan force-push ke branch yang sudah di-review** (rebase silakan, tapi push --force akan hilangkan comment context).

### 8. Merge

- **Squash merge** default (branch history clean di main).
- Merge commit message = PR title (adjust ke Conventional Commit format).
- Delete branch setelah merge.

---

## Aturan Khusus per Kategori Change

### Perubahan Skema Data (`docs/04-data-model.md`)
1. Tulis ADR dulu di `docs/03-architecture.md` (kalau perubahan besar).
2. Update Drizzle schema + generate migration.
3. Update `docs/04-data-model.md` (Mermaid ERD + skema Drizzle).
4. Tambah RLS policy kalau tabel baru.
5. Update `docs/06-api-spec.md` kalau ada endpoint terpengaruh.
6. Update `docs/mobile-team/` kalau affect mobile.
7. Tulis integration test yang covers migration + RLS.

### Perubahan API Contract
1. Update `docs/06-api-spec.md` — payload, response, error code.
2. Update `docs/20-api-error-catalog.md` kalau ada error code baru.
3. Update `docs/mobile-team/02-api-contract.md` kalau relevant mobile.
4. Bump `docs/mobile-team/CHANGELOG.md` versi.
5. Coordinate dengan tim mobile (avoid breaking change tanpa notice).

### Perubahan RBAC / Permission
1. Update `docs/05-rbac-matrix.md`.
2. Update seed roles/permissions.
3. Tambah negative test — user tanpa permission dapat 403.

### Migration DB
1. **Migration harus reversible** — punya `down` script.
2. Test lokal: `pnpm db:migrate` → run app → `pnpm db:migrate:down` → seharusnya kembali ke state semula.
3. Migration destructive (drop column / rename) → warning di PR body, coordinate merge dengan tim.

### Perubahan Kebijakan / Business Rule
1. Update dokumentasi PRD / spec.
2. Log di `docs/catatan-diskusi.md` — rasionale untuk future reference.
3. Update test.

---

## Pre-Push Checklist Cepat

```
[ ] Lint pass
[ ] Typecheck pass
[ ] Test pass
[ ] Konvensi commit message
[ ] Dokumentasi terupdate
[ ] Tidak commit secret / .env
[ ] Migration reversible (kalau ada)
[ ] Screenshot / video kalau UI change
```

---

## Kalau Nge-Blocking

- Butuh clarify spec → tanya di channel tim + link PR.
- Isu backend ↔ mobile → escalate ke PM + backend lead.
- Isu security → private message ke security contact (lihat [`SECURITY.md`](./SECURITY.md)).

---

## Kontak

- **PR Reviewer** (auto-assign): backend team lead.
- **Escalation**: PM.
- **Emergency (production incident)**: on-call schedule di [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md).
