# SECURITY.md — Kebijakan Keamanan

Kebijakan keamanan untuk sistem MES + WMS Hummer. Karena ini sistem produksi yang menyangkut **data cukai (compliance regulator)** dan **operasional pabrik**, keamanan adalah prioritas utama.

---

## 1. Ancaman yang Dipertimbangkan (Threat Model Ringkas)

### 1.1. Data Leak Cross-Tenant
**Ancaman**: user plant A bisa lihat/modifikasi data plant B.
**Mitigasi**: PostgreSQL Row-Level Security (RLS) sebagai final gate. Semua tabel operasional wajib `plantId` NOT NULL + policy `plant_id = ANY(current_setting('app.current_plant_ids')::uuid[])`. Test RLS di CI dengan cross-plant negative case.

### 1.2. Credential Compromise
**Ancaman**: password bocor / phishing → akun user dipakai orang lain.
**Mitigasi**:
- Password hashing bcrypt (cost 12+).
- Rate limit login (10 attempts/menit per IP + username).
- 2FA wajib untuk SUPERADMIN.
- Single-session mobile enforcement (device kedua ditolak, SUPERADMIN wajib revoke).
- Force logout & reset password via SUPERADMIN untuk incident.

### 1.3. Privilege Escalation
**Ancaman**: user biasa gain permission SUPERADMIN.
**Mitigasi**:
- Max 3 SUPERADMIN aktif (enforced service).
- Assignment SUPERADMIN hanya oleh SUPERADMIN existing.
- Semua privileged action → audit log `is_privileged=true` + broadcast ke SUPERADMIN lain (self-policing).
- Bootstrap awal via CLI script (bukan UI) — chicken-and-egg protection.

### 1.4. Data Tampering (Compliance Cukai)
**Ancaman**: user modifikasi data shift yang sudah LOCKED untuk manipulasi laporan cukai.
**Mitigasi**:
- Shift APPROVED = immutable (RLS block UPDATE).
- Perubahan hanya lewat CORRECTION (record baru, audit trail lengkap).
- Soft delete (`deletedAt`) — data tidak pernah hilang.
- Semua mutasi di `audit_log` dengan `before → after` snapshot.
- Retensi 10 tahun.

### 1.5. SQL Injection
**Ancaman**: user input malicious → SQL injection.
**Mitigasi**:
- Drizzle ORM dengan parameterized query (default).
- Tidak ada raw SQL dari user input.
- Code review khusus untuk raw SQL kalau ada.

### 1.6. QR Forgery
**Ancaman**: attacker cetak QR palsu → sistem terima data invalid.
**Mitigasi**:
- QR dinamis (TSG box, batch, pack) berisi HMAC pendek dari `entityId + createdAt`.
- Server verify HMAC saat scan → invalid → 400 + log ke security log.
- Secret HMAC per plant, encrypted at rest, rotasi setahun.

### 1.7. Idempotency Abuse
**Ancaman**: attacker replay request untuk manipulasi (dobel record).
**Mitigasi**:
- Idempotency-Key wajib di POST/PATCH.
- Server dedup 24 jam via cache/DB.

### 1.8. Denial of Service
**Ancaman**: overload API → downtime saat shift kritikal.
**Mitigasi**:
- Rate limit per user (100 req/menit) + per IP.
- Cloudflare / Vercel Edge DDoS protection.
- Circuit breaker di API layer.

---

## 2. Kebijakan Password & Auth

### 2.1. Password
- Minimum 8 karakter (10+ recommended).
- Wajib mengandung: huruf besar, huruf kecil, angka.
- Simbol opsional tapi recommended.
- Tidak boleh sama dengan 5 password terakhir (history check).
- Force change setiap 90 hari untuk SUPERADMIN, 180 hari untuk role lain.
- Reset password via SUPERADMIN atau email flow (Fase 2+).

### 2.2. JWT
- Access token: 15 menit (5 menit untuk SUPERADMIN).
- Refresh token: 30 hari (7 hari untuk SUPERADMIN).
- Refresh token rotated setiap refresh (mencegah replay).
- Refresh token hashed di DB (SHA-256).
- JWT signed HS256 dengan `JWT_SECRET` env var (min 32 bytes, rotasi setahun).

### 2.3. 2FA (SUPERADMIN)
- WhatsApp OTP (via Twilio Business API) atau TOTP (RFC 6238).
- OTP TTL: 5 menit.
- 5 attempts failed → lock 15 menit + notif SUPERADMIN lain.

### 2.4. Session
- Single-session mobile (1 device per user).
- SUPERADMIN opsi IP allowlist per environment.
- Session auto-expire lewat refresh token TTL.
- Force logout: SUPERADMIN atau user sendiri (semua device).

---

## 3. Data Protection

### 3.1. Encryption at Rest
- PostgreSQL: full-disk encryption (AES-256) provided by managed service (Neon/Supabase/RDS).
- Backup: encrypted dengan customer-managed key.
- Secret HMAC QR: encrypted dengan `HMAC_KEY_ENCRYPTION` env var.

### 3.2. Encryption in Transit
- Semua traffic HTTPS (TLS 1.3).
- Vercel default: HTTPS enforced, HSTS enabled.
- Certificate: managed by Vercel (Let's Encrypt).

### 3.3. PII Handling
- Data user: nama, username, email, phone. **Bukan** national ID / password plaintext.
- Log: masking IP address di log external (mis. Sentry) — full IP hanya di internal audit.
- Export cukai: sertakan hash checksum, watermark timestamp.

### 3.4. Retensi
- **Data operasional** (shift, boks, dsb): 10 tahun (regulasi cukai).
- **Audit log**: 10 tahun.
- **Security log**: 2 tahun.
- **Session log**: 90 hari.
- Delete: soft delete (`deletedAt`) selama retensi, hard delete setelah retensi expired.

---

## 4. Security Log

Event yang wajib di-log ke security log (viewable oleh SUPERADMIN):

| Event | Trigger |
|---|---|
| `LOGIN_SUCCESS` | Login berhasil |
| `LOGIN_FAILED` | Login gagal (password salah) |
| `OTP_FAILED` | 2FA OTP salah |
| `PERMISSION_DENIED` | Akses tanpa permission (403) |
| `SESSION_REVOKED` | Session di-revoke (user logout / SUPERADMIN force) |
| `SESSION_CONFLICT` | Login mobile tolak karena SESSION_EXISTS |
| `IP_SUSPICIOUS` | Login dari IP baru / geolocation anomali |
| `PRIVILEGED_ACTION` | SUPERADMIN action (impersonate, force logout, dsb) |
| `RLS_VIOLATION` | Attempted cross-tenant access (defensive log) |
| `QR_INVALID` | QR HMAC verify gagal |
| `RATE_LIMIT_HIT` | Rate limit terpicu |

Retensi security log: 2 tahun.

---

## 5. Vulnerability Disclosure

### Untuk Peneliti Keamanan Eksternal

Kalau menemukan kerentanan:
1. **Jangan** exploit di production.
2. **Jangan** publish public sebelum patch.
3. Kirim email ke: **security@hummer.example** *(placeholder — isi email real)*.
4. Include:
   - Deskripsi kerentanan.
   - Langkah reproduce.
   - Impact assessment.
   - Suggested fix (opsional).
5. Kami akan respond dalam 3 hari kerja.

### Reward
Fase awal (2026-2027): terima kasih + acknowledgment publik (kalau boleh).
Fase future: bug bounty program berbasis severity.

---

## 6. Insiden Keamanan

Kalau tim internal deteksi incident:

### Severity 1 (Critical)
- Data leak cross-tenant confirmed.
- SUPERADMIN account compromise.
- Massive data exfiltration.

**Action**:
1. **Immediate**: revoke session yang suspicious via SUPERADMIN emergency.
2. Rotate credentials (JWT_SECRET, HMAC_KEY, DB password).
3. Buka incident channel #incident.
4. Notify stakeholder (PM + IT lead + compliance officer).
5. Isolate attack surface (block IP, disable endpoint kalau perlu).
6. **Post-mortem** dalam 5 hari kerja.

### Severity 2 (High)
- Kerentanan yang exploitable tapi belum ter-exploit.
- Rate limit gagal / mass credential stuffing terdeteksi.

**Action**:
1. Patch dalam 48 jam.
2. Communicate ke stakeholder.
3. Post-mortem dalam 10 hari kerja.

### Severity 3 (Medium/Low)
- Minor misconfiguration.
- Non-exploitable finding.

**Action**: Backlog untuk sprint terdekat.

**Detail runbook**: [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md) §Incident Response.

---

## 7. Compliance & Audit

- **Retensi data**: 10 tahun (cukai + BPOM).
- **Audit trail**: 100% mutasi tabel operasional & master data.
- **CORRECTION flow**: pasca-LOCKED, HQ_AUDITOR only, tercatat lengkap.
- **Export cukai**: watermarked, checksummed, versioned per periode.
- **External audit**: siap sedia audit log lengkap 10 tahun ke belakang untuk regulator.

---

## 8. Third-Party Dependencies

- Pinning versi di `pnpm-lock.yaml`.
- Renovate/Dependabot untuk security update.
- Review dependency change > MAJOR sebelum merge.
- Prohibited: package dari registry tidak dikenal, package abandoned > 2 tahun.

---

## 9. Development Security

- **Jangan commit secret** — pakai `.env`, sudah di-gitignore.
- **Test dengan data dummy** — jangan gunakan data production di dev.
- **CI/CD**: secret di GitHub Secrets, tidak plain text di workflow.
- **Code review** wajib untuk PR ke `main`.
- **Security review** (`/security-review` di Claude Code) wajib sebelum deploy production.

---

## 10. Referensi

- [`docs/03-architecture.md`](./docs/03-architecture.md) §7 — trust boundaries.
- [`docs/04-data-model.md`](./docs/04-data-model.md) §9 — RLS policy detail.
- [`docs/05-rbac-matrix.md`](./docs/05-rbac-matrix.md) — permission matrix.
- [`docs/17-operations-runbook.md`](./docs/17-operations-runbook.md) — incident response.

---

## Kontak Security

- **Security lead**: *(nama + email)*
- **Escalation**: PM + IT lead perusahaan
- **Public disclosure**: security@hummer.example *(placeholder)*
- **Emergency 24/7**: on-call rotation (lihat runbook)
