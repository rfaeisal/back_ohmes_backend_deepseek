---
name: Bug Report
about: Laporkan bug atau anomali di sistem
title: 'bug: [singkat]'
labels: bug, triage
assignees: ''
---

## Deskripsi Bug

<!-- Jelas dan singkat: apa yang terjadi. -->

## Steps to Reproduce

1. Login sebagai role `___` di plant `___`
2. Buka halaman `___`
3. Klik `___`
4. Lihat error `___`

## Expected Behavior

<!-- Apa yang seharusnya terjadi. -->

## Actual Behavior

<!-- Apa yang benar-benar terjadi. -->

## Screenshot / Video

<!-- Attach kalau ada. -->

## Environment

- **Environment**: [ ] dev / [ ] staging / [ ] production
- **Browser / OS**: (mis. Chrome 130 · macOS 14 / Android 12 tablet)
- **App version**: (dari `X-Client-Version` header atau footer app)
- **User role**: (mis. OPERATOR_KECER)
- **Plant**: (mis. PLT-MLG-01)

## Data Context

- **Shift ID** (kalau ada): `shf_...`
- **Boks ID** (kalau ada): `box_...`
- **Request ID** (dari response header): `req_...` — untuk trace lookup

## Error Code (kalau ada)

- **Code**: (mis. `TSG_BOX_NOT_AVAILABLE`)
- **HTTP status**: (mis. 400)
- **Message**: (dari response.error.message)

Cek [`docs/20-api-error-catalog.md`](../../docs/20-api-error-catalog.md) untuk playbook.

## Severity

- [ ] **P1** — production down / data leak / security breach
- [ ] **P2** — fitur besar rusak, workaround ada
- [ ] **P3** — annoying tapi tidak block
- [ ] **P4** — kosmetik / typo

Detail severity: [`docs/17-operations-runbook.md`](../../docs/17-operations-runbook.md) §2.

## Additional Context

<!-- Log Sentry, screenshot dashboard, dll. -->
