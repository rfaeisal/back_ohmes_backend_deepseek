# 18 · Backup & Disaster Recovery

Strategy backup dan disaster recovery (DR) untuk MES + WMS Hummer. **Data cukai wajib retensi 10 tahun** — kehilangan data = pelanggaran regulator.

---

## 1. RTO & RPO — Objectives

| Metric | Definisi | Target Production |
|---|---|---|
| **RTO** (Recovery Time Objective) | Max waktu untuk restore service setelah disaster | **4 jam** |
| **RPO** (Recovery Point Objective) | Max data loss window (backup terakhir) | **1 jam** |

**Konteks bisnis**: pabrik operasi 24/7 dengan shift 8-13 jam. Downtime 4 jam = shift terganggu tapi tidak hancur (data pending di local queue mobile bisa sync). RPO 1 jam = max 1 jam entry data yang harus dientri ulang manual.

**Fase future**: kalau butuh lebih ketat (mis. RPO 5 menit), upgrade ke streaming replication atau active-active.

---

## 2. Backup Strategy

### 2.1. Automated Daily Backup (Managed by Neon/Supabase)
- **Frekuensi**: setiap 24 jam (jam 02:00 WIB, di antara shift).
- **Retensi**: 30 hari.
- **Storage**: managed provider (Neon/Supabase) — encrypted at rest.
- **Cost**: included in DB plan.

### 2.2. Point-in-Time Recovery (PITR)
- **Enabled**: Neon default aktif.
- **Window**: 7 hari (upgrade ke 30 hari untuk production plan).
- **Granularity**: restore ke titik waktu spesifik (mis. "restore ke 14:32:11 tadi").
- **Use case**: revert accidental data corruption tanpa hilangkan seluruh hari.

### 2.3. Weekly Snapshot ke Cold Storage
- **Frekuensi**: setiap Minggu jam 02:00 WIB.
- **Storage**: S3 Glacier / Vercel Blob dengan lifecycle policy.
- **Retensi**: 12 bulan.
- **Purpose**: DR jangka menengah, kalau managed backup rusak / provider issue.

### 2.4. Annual Archive (Compliance)
- **Frekuensi**: setiap 1 Januari.
- **Storage**: S3 Deep Archive atau tape backup (kalau ada) — offline immutable.
- **Retensi**: **10 tahun** (regulasi cukai).
- **Format**: pg_dump full DB + compressed (gzip) + encrypted (AES-256).
- **Verification**: annual restore test ke isolated env.

### 2.5. Backup Verification
Setiap bulan:
- **Automated**: restore latest backup ke staging DB → run smoke test.
- **Manual (quarterly)**: restore ke isolated env → verify sample data integrity.
- Alert kalau restore fail atau data corrupt.

---

## 3. Backup Coverage

### 3.1. Yang Di-Backup
- **Database Postgres** (semua tabel operasional + master + audit + compliance).
- **Vercel Blob** (PDF surat jalan, QR image, export cukai) — separate backup ke S3.
- **Environment variables** (via Vercel export ke secure vault, quarterly).
- **Application code** — GitHub sudah backup (multi-region), tidak perlu tambahan.

### 3.2. Yang TIDAK Di-Backup (Ephemeral)
- Cache Redis (rate limit, idempotency — dibuang OK).
- Log Vercel (retention Sentry sudah cover).
- Temp files di function runtime.

### 3.3. Session Data
- User session di DB — ter-backup.
- Namun setelah restore, semua active session di-invalidate (force re-login) untuk safety.

---

## 4. Restore Prosedur

### 4.1. Skenario 1: Accidental Data Delete
**Contoh**: HQ_AUDITOR salah delete shift.

**Prosedur**:
1. Identify: audit_log untuk timestamp delete.
2. Neon dashboard → PITR → select time = **sebelum** delete.
3. Restore ke temporary DB.
4. Export record affected → import ke production DB (SQL script manual).
5. Audit log entry: "manual restore by <SUPERADMIN>".

**Estimasi**: 30 menit.

### 4.2. Skenario 2: Corrupt Table (bad migration / bug)
**Contoh**: migration rusak tabel `shift_waste`.

**Prosedur**:
1. Immediate: enable feature flag off untuk fitur affected → cegah write baru.
2. Neon PITR → restore full DB ke temporary.
3. Compare table `shift_waste` old vs current → identify affected rows.
4. Fix schema / data → import back.
5. Re-enable feature flag.

**Estimasi**: 1-2 jam.

### 4.3. Skenario 3: Full DB Failure
**Contoh**: Neon DB unreachable, tidak recover dalam 1 jam.

**Prosedur**:
1. Notify user (banner "Sistem sedang maintenance").
2. Failover ke read replica (kalau tersedia) — READ-ONLY mode.
3. Restore latest daily backup ke new DB instance.
4. Update `DATABASE_URL` di Vercel env.
5. Redeploy production.
6. Verify + monitor.

**Estimasi**: 2-4 jam (dalam RTO).

**Data loss**: max 1 jam (RPO) — user diminta re-entry data yang hilang (dari mobile local queue kalau ada).

### 4.4. Skenario 4: Ransomware / Data Encryption
**Contoh**: attacker encrypt DB, demand ransom.

**Prosedur**:
1. **Jangan bayar ransom**.
2. Isolate DB → disable public access.
3. Notify security + legal.
4. Restore dari **offline immutable backup** (annual archive) — asumsi weekly snapshot juga terkompromise.
5. Rotate semua credentials (JWT_SECRET, HMAC, DB password, env vars).
6. Forensic analysis.
7. Report ke authorities (POLDA cyber crime).
8. Notify user + regulator (kalau data cukai terpengaruh).

**Estimasi**: 8-24 jam.
**Data loss**: max 7 hari (dari weekly snapshot terakhir).

### 4.5. Skenario 5: Cloud Region Down
**Contoh**: Vercel/Neon region Singapore mengalami outage berjam-jam.

**Prosedur**:
1. Check provider status page.
2. Kalau outage < 2 jam → tunggu, notify user.
3. Kalau > 2 jam → deploy ke fallback region (Tokyo `hnd1`):
   - Vercel: redeploy ke region alternatif.
   - Neon: create DB baru di region fallback + restore backup.
   - Update env vars + DNS.
4. Sync back saat primary online.

**Estimasi**: 4-8 jam (di batas RTO).

---

## 5. DR Drill (Latihan)

### 5.1. Frekuensi
- **Quarterly**: skenario partial (accidental delete, corrupt table).
- **Annually**: skenario full DR (region down, ransomware simulasi).

### 5.2. Tujuan Drill
- Verify prosedur bekerja.
- Latih tim ops.
- Update runbook based on findings.
- Verify RTO/RPO tercapai.

### 5.3. Cara Drill
1. Announce ke tim (bukan surprise).
2. Setup isolated env (staging clone).
3. Jalankan skenario end-to-end.
4. Ukur waktu tiap step.
5. Post-drill review: identify gap, update runbook.

---

## 6. Backup Cost Estimate

| Item | Retensi | Storage | Cost/bulan (est) |
|---|---|---|---|
| Neon daily backup (30 days) | 30 hari | Managed | Included in plan |
| S3 weekly snapshot (12 months) | 12 bulan | Standard | ~$5 (untuk 10 GB) |
| S3 Deep Archive annual (10 years) | 10 tahun | Deep Archive | ~$1/GB/year |
| Total (est Fase 1) | | | **~$10** |
| Total (est Fase 4, 30 pabrik ~100GB) | | | **~$100** |

Cost akan naik seiring growth data. Review annual.

---

## 7. Encryption

### 7.1. At Rest
- Neon: AES-256 default.
- S3 backup: SSE-S3 (managed key) atau SSE-KMS (customer key untuk sensitive backup).
- Annual archive: AES-256 dengan customer-managed key (KMS).

### 7.2. In Transit
- Backup transfer HTTPS/TLS 1.3.
- pg_dump lewat SSL connection.

### 7.3. Key Management
- KMS key rotation: annual.
- Key access: 2 SUPERADMIN + 1 external escrow (kalau ada regulasi).

---

## 8. Compliance & Audit

### 8.1. Regulator Cukai
- Retensi 10 tahun.
- Format archive: pg_dump SQL + JSON export.
- Available untuk audit request dalam 5 hari kerja.

### 8.2. Audit Log
- Semua restore action tercatat di audit_log dengan `is_privileged=true`.
- Restore laporan: siapa, kapan, kenapa, hasil.

---

## 9. Backup Automation Script (Template)

`scripts/backup/weekly-snapshot.sh`:
```bash
#!/bin/bash
set -euo pipefail

DATE=$(date +%Y%m%d)
DB_URL="${DATABASE_MIGRATION_URL}"
S3_BUCKET="s3://hummer-mes-backup"

# Full DB dump
pg_dump "$DB_URL" | gzip | openssl enc -aes-256-cbc -pass file:/etc/hummer/backup.key > "backup-$DATE.sql.gz.enc"

# Upload to S3
aws s3 cp "backup-$DATE.sql.gz.enc" "$S3_BUCKET/weekly/" --storage-class STANDARD_IA

# Verify checksum
CHECKSUM=$(sha256sum "backup-$DATE.sql.gz.enc" | cut -d' ' -f1)
aws s3api put-object-tagging --bucket hummer-mes-backup --key "weekly/backup-$DATE.sql.gz.enc" --tagging "TagSet=[{Key=checksum,Value=$CHECKSUM}]"

# Cleanup local
rm "backup-$DATE.sql.gz.enc"

# Alert on success
curl -X POST "$SLACK_WEBHOOK" -d "{\"text\":\"✅ Weekly backup $DATE completed\"}"
```

Cron: `0 2 * * 0` (Setiap Minggu 02:00 WIB).

---

## 10. Immutability & Air-Gap

Untuk protection dari ransomware:
- **S3 Object Lock** untuk annual archive — file tidak bisa di-overwrite/delete selama compliance period.
- **Offline copy** (tape / offline HDD) untuk backup annual — di-store secara fisik terpisah.
- **Air-gap**: backup key stored offline (paper printed di safe), bukan cloud secret manager.

---

## 11. Communication Plan Saat DR

### 11.1. Internal
- Slack/WA #incident: real-time update.
- Email stakeholder: setiap 1 jam.

### 11.2. External (User)
- In-app banner: "Sistem sedang dalam maintenance, ETA XX menit".
- Email/WA ke plant manager kalau downtime > 30 menit.

### 11.3. Regulator (kalau applicable)
- Kalau data cukai berpotensi hilang: notify Bea Cukai dalam 24 jam sesuai regulasi.

---

## 12. Checklist Backup — Post-Setup

Setelah setup awal, verify:
- [ ] Neon daily backup enabled + retention 30 hari.
- [ ] Neon PITR enabled + retention 7 hari.
- [ ] S3 weekly snapshot cron running.
- [ ] S3 Deep Archive annual policy set.
- [ ] Backup encryption key stored offline + accessible.
- [ ] Restore test lulus di staging.
- [ ] Runbook incident tersedia di lokasi accessible saat DR.

---

## 13. Referensi

- [`14-deployment-infra.md`](./14-deployment-infra.md) — infra setup.
- [`17-operations-runbook.md`](./17-operations-runbook.md) — incident response.
- [`SECURITY.md`](../SECURITY.md) — encryption + compliance.
- [Neon backup docs](https://neon.tech/docs/manage/backups) — provider-specific.
