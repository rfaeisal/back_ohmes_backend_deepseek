# 17 · Operations Runbook — Incident Response & Common Issues

Runbook untuk tim ops (on-call). Berisi prosedur incident response, troubleshooting umum, dan escalation path.

**Prinsip**: **jangan panik, ikuti runbook**. Kalau kasus tidak ada di sini, log di post-mortem supaya runbook update.

---

## 1. On-Call Rotation

### 1.1. Struktur
- **Primary on-call**: 1 orang per minggu (rotasi mingguan).
- **Backup on-call**: 1 orang (auto-escalate kalau primary gagal ack 15 menit).
- **Tech lead**: dipanggil kalau P1 tidak resolved 1 jam.
- **PM / manajemen**: dipanggil kalau downtime > 30 menit atau ada dampak bisnis.

### 1.2. Jadwal
Publish di kalender tim + reminder H-1. Handoff Senin 09:00 WIB.

### 1.3. Response Time Target
| Severity | Ack | Resolution target |
|---|---|---|
| P1 (Critical) | 15 menit | 2 jam |
| P2 (High) | 1 jam | 8 jam |
| P3 (Medium) | 4 jam (business hours) | 3 hari |
| P4 (Low) | Next business day | Sprint |

---

## 2. Severity Definitions

### P1 · Critical (app down, data leak, security breach)
- Production API 5xx > 5% (semua user affected).
- DB unreachable / connection pool exhausted.
- Data leak cross-tenant confirmed (RLS violation).
- SUPERADMIN account compromise.
- Massive data corruption / hilang.
- Payment integration down (Fase future).

**Action**: page on-call langsung. Buka incident channel #incident. Update setiap 15 menit sampai resolved.

### P2 · High (partial outage, urgent bugs)
- 1 fitur besar rusak tapi workaround ada.
- Latency P95 > 5s selama 10 menit.
- Auth service degraded (login lambat tapi jalan).
- Migration gagal partial (DB inkonsisten).
- Backup gagal.

**Action**: WA #alerts, respond dalam 1 jam.

### P3 · Medium (annoying tapi tidak block business)
- Fitur minor bug.
- Dashboard load lambat (>3s tapi jalan).
- Approval backlog > 4 jam.
- Rate limit hit spike.

**Action**: log ticket, sprint priorization.

### P4 · Low (nice-to-fix)
- Typo, kosmetik UI.
- Warning log yang non-actionable.

**Action**: backlog.

---

## 3. Incident Response — Prosedur Umum

### 3.1. Ack (dalam 15 menit)
1. Terima alert (WA/phone).
2. Ack di monitoring tool (Sentry).
3. Post di #incident: "Ack, investigate."

### 3.2. Assess (dalam 30 menit)
1. Cek dashboard operational health.
2. Identifikasi impact: berapa user, plant mana, fitur apa.
3. Update severity kalau perlu.
4. Kalau P1 → notify stakeholder (PM + tech lead).

### 3.3. Mitigate
Prioritas: **restore service dulu**, root cause analysis kemudian.

Opsi mitigasi cepat:
- **Rollback deploy** ke version sebelumnya via Vercel Instant Rollback.
- **Disable fitur** via feature flag (env var).
- **Scale up** DB (kalau connection pool exhausted).
- **Enable circuit breaker** untuk endpoint yang bermasalah.

### 3.4. Communicate
- P1: update #incident setiap 15 menit.
- Kirim status ke user affected (via in-app banner atau WA group manajer pabrik) kalau > 30 menit.

### 3.5. Resolve
1. Verify fix di production (smoke test).
2. Monitor 30 menit untuk pastikan stable.
3. Update #incident: "Resolved."
4. Ack alert closed.

### 3.6. Post-Mortem (dalam 5 hari kerja)
Untuk P1 & P2 wajib. Template di §11.

---

## 4. Common Issues & Playbooks

### 4.1. Login Gagal Massal
**Gejala**: alert `LOGIN_FAILED > 50/menit`.
**Kemungkinan**:
- Auth service down → cek `/api/v1/health` + Sentry.
- Credential stuffing attack → cek IP distribution di security log.
- JWT_SECRET rotated tanpa migration → semua session invalid.

**Playbook**:
1. Cek health endpoint.
2. Kalau OK, cek security log — apakah dari 1 IP atau distributed?
3. Kalau attack:
   - Enable IP blocklist di Vercel WAF / Cloudflare.
   - Rate limit tighter sementara.
   - Notif tim security.
4. Kalau bug internal:
   - Cek Sentry error trace.
   - Rollback kalau baru deploy.

### 4.2. Shift Tidak Bisa End (SHIFT_HAS_ACTIVE_BOX)
**Gejala**: operator complain "tidak bisa akhiri shift".
**Root cause**: ada boks aktif tanpa handoff.

**Playbook**:
1. Cek shift detail via `GET /shifts/:id`.
2. Cari boks dengan `completedAt IS NULL`.
3. Operator harus:
   - Selesaikan boks (timbang), atau
   - Batalkan boks dengan alasan, atau
   - Buat handoff.
4. Kalau operator sudah pulang tanpa handle → supervisor pabrik correction (edit boks).

### 4.3. RLS Violation Detected
**Gejala**: log `event:"rls.violation"` muncul.
**Impact**: SECURITY BREACH. Data leak potential.

**Playbook** (P1):
1. Immediate: identifikasi user + query yang trigger.
2. Cek session variable `app.current_plant_ids` untuk user tsb.
3. Kalau bug (session variable salah) → hotfix + rollback.
4. Kalau attempted attack → block user + investigate.
5. Post-mortem WAJIB dengan external audit.

### 4.4. Database Connection Pool Exhausted
**Gejala**: alert `DB connection error` atau latency spike.
**Kemungkinan**:
- Traffic spike.
- Long-running query menyandera connection.
- Migration jalan di prod (harusnya di CI).

**Playbook**:
1. Cek Neon dashboard: connection count vs max.
2. Kalau spike traffic → scale up plan (Neon dashboard).
3. Kalau long query → identify via `pg_stat_activity`:
   ```sql
   SELECT pid, query, state, EXTRACT(EPOCH FROM (now() - query_start)) AS runtime
   FROM pg_stat_activity
   WHERE state = 'active' AND runtime > 10;
   ```
4. Kill query kalau perlu: `SELECT pg_terminate_backend(pid);`
5. Post-fix: identifikasi source (missing index? bad query?).

### 4.5. Migration Gagal di CI
**Gejala**: CI pipeline red di step `db:migrate`.
**Playbook**:
1. Cek log migration error.
2. Kalau syntax error di SQL → fix + re-run.
3. Kalau data conflict (mis. NOT NULL di kolom yang ada NULL) → tambah default value atau backfill script.
4. Kalau reversible → rollback ke commit sebelumnya, plan migration ulang.

### 4.6. Deploy Preview Berhasil Tapi Production Fail
**Gejala**: staging OK, prod error.
**Kemungkinan**:
- Env var berbeda / missing.
- DB migration belum jalan di prod.
- External service credentials salah.

**Playbook**:
1. Compare env vars staging vs prod di Vercel Dashboard.
2. Cek migration status: `pnpm db:migrate:status`.
3. Cek Sentry error stack trace.
4. Kalau tidak jelas → rollback → investigate offline.

### 4.7. Operator Report "Boks Tidak Bisa Dibuka"
**Gejala**: user complain `TSG_BOX_NOT_AVAILABLE`.
**Root cause**: boks yang di-pilih sudah USED atau WRITTEN_OFF.

**Playbook**:
1. Cek `tsg_inventory` untuk `inventoryBoxId` tsb.
2. Kalau status USED oleh shift lain → koordinasi supervisor: mana yang benar.
3. Kalau status WRITTEN_OFF → operator pilih boks lain.
4. Kalau boks tidak ada di inventory sama sekali → mungkin belum di-receiving oleh gudang. Kontak Gudang Inbound.

### 4.8. Handoff Tidak Muncul di Shift Berikutnya
**Gejala**: shift baru start tapi tidak auto-claim handoff.
**Kemungkinan**:
- Handoff sudah di-claim shift lain (race condition, seharusnya tidak — cek unique index).
- Machine ID beda (mungkin operator start shift di mesin lain).

**Playbook**:
1. Query `shift_handoff WHERE machineId = ? AND claimedByShiftId IS NULL`.
2. Kalau ada tapi tidak ter-claim → bug service, investigate.
3. Kalau tidak ada → mungkin handoff belum dibuat (shift lama lupa? cek `actualEnd`).
4. Manual claim via SUPERADMIN (SQL update) kalau perlu emergency.

### 4.9. Approval Backlog > 4 Jam
**Gejala**: alert.
**Root cause**: supervisor lupa approve.

**Playbook**:
1. Cek daftar shift COMPLETED yang belum approved.
2. Notif supervisor pabrik terkait (WA / call).
3. Kalau supervisor tidak available → plant manager approve.
4. Long-term: bikin reminder notification lebih agresif.

### 4.10. QR Palsu Terdeteksi
**Gejala**: `QR_INVALID` spike di security log.
**Playbook**:
1. Cek: apakah dari 1 device / user atau distributed?
2. Kalau 1 user → mungkin QR sticker rusak / smudged. Verify manual.
3. Kalau distributed → kemungkinan attack. Notif security. Rotasi HMAC secret plant tersebut (jangan seluruh sistem — impact seluruh QR).

---

## 5. Setup Issue Troubleshooting (Untuk Dev Baru)

### 5.1. `pnpm install` gagal
- Cek Node version: `node --version` harus 20+.
- Clear cache: `pnpm store prune`.
- Retry.

### 5.2. Docker Postgres tidak konek
- Cek Docker running: `docker ps`.
- Cek port 5432 tidak dipakai: `lsof -i :5432`.
- Recreate: `docker compose down && docker compose up -d`.

### 5.3. Migration error di local
- Kemungkinan schema drift → `pnpm db:migrate:reset` (DEV ONLY, hapus data).
- Re-seed: `pnpm db:seed`.

### 5.4. Login gagal di local (SUPERADMIN)
- Cek password yang di-print saat `seed:superadmin` — hanya muncul sekali. Kalau lupa → re-seed (delete user dulu).
- 2FA dev: skip / accept OTP `000000`.

---

## 6. Rollback Procedures

### 6.1. Rollback Deploy
1. Vercel Dashboard → Deployments → find deployment sebelumnya.
2. Click ⋯ menu → **Promote to Production**.
3. Verify dalam 5 menit.

### 6.2. Rollback Migration
Migration harus reversible. Kalau tidak:
1. Restore DB dari backup terakhir (lihat `18-backup-recovery.md`).
2. Point-in-time recovery kalau perlu granular.

### 6.3. Rollback Data (Corruption Insiden)
1. Identify affected records (query audit_log).
2. Restore dari backup ke temporary DB.
3. Selective restore ke prod (SQL script per record).
4. Verify + notify affected user.

---

## 7. Escalation Path

```
Alert
  ↓
Primary On-Call (ack 15 min)
  ↓ (fail ack)
Backup On-Call (15 min)
  ↓ (fail ack)
Tech Lead
  ↓ (P1, > 1 hour unresolved)
PM + Manajemen
  ↓ (data breach / security)
Compliance Officer + Legal
```

Kontak (isi dengan real names):
- Primary on-call: cek jadwal
- Tech Lead: *(nama + WA + phone)*
- PM: *(nama + WA + phone)*
- Compliance Officer: *(nama + email)*
- Vendor Support (Vercel): support ticket + priority chat (Enterprise plan)

---

## 8. Emergency Procedures

### 8.1. SUPERADMIN Compromise
1. Immediate: revoke session compromised SUPERADMIN (via SUPERADMIN lain).
2. Reset password.
3. Rotate JWT_SECRET (invalidate semua session).
4. Audit log semua aksi SUPERADMIN 30 hari terakhir.
5. Post-mortem + security review.

### 8.2. Full DB Failure
1. Failover ke read replica (kalau tersedia).
2. Kalau replica juga fail → restore dari latest backup.
3. Data loss potential: hitung RPO (max data loss window = backup interval).
4. Notify stakeholder + user (in-app banner).

### 8.3. Ransomware / Data Encryption Attack
1. Isolate DB (block external access).
2. Restore dari backup offline (immutable).
3. Rotate semua credentials.
4. Forensic analysis.
5. Legal notification.

---

## 9. Common Fix Commands (Copy-Paste Ready)

### Restart function (Vercel)
```bash
# Redeploy without code change
vercel --prod --force
```

### Kill long-running query
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%SELECT ...%';
```

### Reset user session (emergency)
```sql
UPDATE user_session SET revoked_at = now(), revoked_reason = 'emergency' WHERE user_id = 'xxx';
```

### Manual approve shift (bypass UI kalau bug)
```sql
BEGIN;
UPDATE shift_report SET status = 'APPROVED', approved_by = 'usr_xxx', approved_at = now() WHERE id = 'shf_xxx';
INSERT INTO audit_log (...) VALUES (...);
-- REFRESH MATERIALIZED VIEW mv_area_daily_kpi;
COMMIT;
```

**HATI-HATI**: manual DB write bypass audit log — jangan lakukan kecuali emergency + dokumentasikan.

---

## 10. Chaos Testing (Quarterly)

Test resilience system secara terjadwal:
- **Kill 1 function instance** → cek failover.
- **Simulate DB slow query** → cek circuit breaker.
- **Simulate Twilio outage** → cek 2FA fallback (TOTP).

Jadwal: setiap Q1/Q2/Q3/Q4 minggu kedua. Coordinate dengan tim tidak saat pilot / high-load.

---

## 11. Reset Data Produksi (Uji Coba) & Catatan Deployment Docker/Coolify

### 11.1. Reset data produksi ("kosongkan produksi")

Untuk testing manual alur produksi berulang kali dari data bersih (dev/UAT). Jalankan via psql (contoh dev: `docker exec mes_dev_postgres psql -U mes_user -d mes_dev`):

```sql
DELETE FROM tsg_box_consumption;
DELETE FROM downtime_log;
DELETE FROM maintenance_event;
DELETE FROM shift_waste;
DELETE FROM tsg_box_process;
DELETE FROM hlp_pack;
DELETE FROM tsg_box_session;
DELETE FROM batch;
DELETE FROM shift_handoff;
DELETE FROM shift_member;
DELETE FROM shift_correction;
DELETE FROM shift_report;
UPDATE tsg_inventory SET status = 'AVAILABLE', used_at = NULL,
       allocated_to_shift_id = NULL, allocated_at = NULL
WHERE status IN ('USED', 'ALLOCATED');
```

Urutan penting: tabel child (`tsg_box_process`, `tsg_box_session`, `batch`, `hlp_pack`) sebelum `shift_report` (FK).

### 11.2. Deployment Docker/Coolify

- **Migrasi 0004 & 0005 di luar journal drizzle** — diaplikasikan manual via psql. Dockerfile hanya meng-*copy* file migrasi, TIDAK menjalankannya → setelah deploy, jalankan manual `0004_box_session.sql` dan `0005_session_events.sql` ke DB produksi. Gejala kalau lupa: `relation "tsg_box_session" does not exist` saat buka boks.
- **Build gagal yang pernah terjadi & fix-nya** (sudah ter-commit):
  - `ERROR packages field missing or empty` (pnpm@9) → `pnpm-workspace.yaml` wajib punya field `packages`.
  - Halaman yang query DB saat build harus `export const dynamic = "force-dynamic"` (contoh `/admin`) — build stage Docker memakai `DATABASE_URL` placeholder.
  - `COPY /app/public` gagal → folder `public/` wajib ada (ada `.gitkeep`).
- **GOTCHA: jangan jalankan `pnpm build` saat dev server jalan** — `.next` dipakai bersama; build menimpa state dev → `MODULE_NOT_FOUND` / UI rusak (tombol disabled). Fix: matikan dev (`kill $(lsof -t -i :3001)`) → `rm -rf .next` → `pnpm dev` ulang.

## 12. Post-Mortem Template

Setiap P1/P2 wajib post-mortem dalam 5 hari kerja. Simpan di `docs/postmortems/YYYY-MM-DD-slug.md`.

```markdown
# Post-Mortem: <judul>

**Date**: YYYY-MM-DD
**Severity**: P1/P2
**Duration**: X jam Y menit
**Impact**: (berapa user affected, data loss, revenue)
**On-call**: (nama)

## Timeline
- HH:MM — event 1
- HH:MM — event 2

## Root Cause
(what actually broke)

## Contributing Factors
(what made it worse or hard to detect)

## Detection
(bagaimana kita tahu — alert? user report?)

## Resolution
(langkah yang bekerja)

## What Went Well
(hal positif dalam response)

## What Went Wrong
(gap dalam response)

## Action Items
- [ ] AI-1 — Assign: __ — Due: __
- [ ] AI-2 — ...

## Lessons Learned
(insights untuk masa depan)
```

---

## 13. Referensi

- [`16-observability.md`](./16-observability.md) — alert rules & dashboard.
- [`18-backup-recovery.md`](./18-backup-recovery.md) — restore prosedur.
- [`SECURITY.md`](../SECURITY.md) — security incident detail.
- [`14-deployment-infra.md`](./14-deployment-infra.md) §8 — deploy & rollback.
