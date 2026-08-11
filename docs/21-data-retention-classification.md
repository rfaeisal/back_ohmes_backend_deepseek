# 21 · Data Retention & Classification

Kebijakan formal retensi data dan klasifikasi. Compliance-driven — regulasi cukai Indonesia mewajibkan **retensi 10 tahun**, dan setiap data harus punya klasifikasi keamanan yang jelas.

---

## 1. Data Classification (4 Level)

Setiap tabel dan field diklasifikasi sesuai sensitivitas. Klasifikasi menentukan access control, encryption, dan logging.

### 1.1. PUBLIC
**Definisi**: informasi yang boleh dibagi ke publik tanpa consequence.
**Contoh**: dokumentasi API public (kalau nanti ada), health check endpoint response.
**Kontrol**: tidak ada.

### 1.2. INTERNAL
**Definisi**: informasi internal Hummer Group, tidak untuk external tapi bocor tidak fatal.
**Contoh**: nama produk, kode mesin (`MKR-01`), kategori downtime, level shift template.
**Kontrol**: authenticated user only.

### 1.3. CONFIDENTIAL
**Definisi**: data operasional yang punya nilai bisnis / kompetitif.
**Contoh**: yield per boks, waste per shift, produksi harian, formula produk, supplier list.
**Kontrol**:
- Authenticated + authorized (RBAC + scope).
- Audit log semua akses (read + write).
- Encrypted at rest + in transit.
- Retensi sesuai regulator.

### 1.4. RESTRICTED
**Definisi**: data yang bocor = risk regulasi / hukum / kompromise account.
**Contoh**: password hash, JWT/refresh token, OTP, HMAC secret, data pribadi user (nama full + phone + email), audit log privileged action.
**Kontrol**:
- Authenticated + explicit permission (bukan default).
- Full audit log dengan `is_privileged=true`.
- Encrypted at rest dengan customer-managed key.
- Access hanya lewat endpoint terkurasi (bukan raw SQL).
- Mask/tokenize saat display (mis. `203.194.***.***`).
- Retensi minimum untuk compliance, delete setelah expired.

---

## 2. Klasifikasi per Tabel

### 2.1. Tenancy & Master Data

| Tabel | Klasifikasi | Notes |
|---|---|---|
| `company` | INTERNAL | Nama holding |
| `region` | INTERNAL | Nama area |
| `plant` | INTERNAL | Kode + nama pabrik |
| `machine` | INTERNAL | Kode mesin |
| `product` | CONFIDENTIAL | Formulasi produk |
| `machine_template` | CONFIDENTIAL | Yield range = IP produksi |
| `consumable_item`, `sparepart` | INTERNAL | Item generic |
| `tsg_supplier` | CONFIDENTIAL | Kontrak supplier |
| `shift_template`, `shift_role` | INTERNAL | Struktur kerja |

### 2.2. Identity & RBAC

| Tabel | Klasifikasi | Notes |
|---|---|---|
| `user` | RESTRICTED | Nama, phone, email, password hash |
| `user_session` | RESTRICTED | Token hash, deviceId, IP |
| `role`, `permission`, `role_permission` | INTERNAL | Struktur akses |
| `user_assignment` | CONFIDENTIAL | Siapa punya akses apa |
| `auth_policy` | RESTRICTED | Aturan auth SUPERADMIN |

### 2.3. Operasional Shift

| Tabel | Klasifikasi | Notes |
|---|---|---|
| `shift_report` | CONFIDENTIAL | Data produksi |
| `shift_member` | CONFIDENTIAL | Siapa kerja shift mana (data karyawan) |
| `shift_waste` | CONFIDENTIAL | Waste = kompetitif intelligence |
| `shift_handoff` | CONFIDENTIAL | Handoff antar shift |
| `tsg_box_process` | CONFIDENTIAL | Boks produksi |
| `tsg_box_consumption` | CONFIDENTIAL | Pemakaian consumables |
| `downtime_log`, `maintenance_event` | CONFIDENTIAL | Efisiensi mesin |
| `batch`, `hlp_pack` | CONFIDENTIAL | Output produksi |

### 2.4. WMS

| Tabel | Klasifikasi | Notes |
|---|---|---|
| `tsg_receiving`, `tsg_receiving_box`, `tsg_inventory` | CONFIDENTIAL | Data supplier + volume |
| `finished_goods_receiving`, `carton`, `carton_content` | CONFIDENTIAL | Produksi + traceability |
| `dispatch_order`, `dispatch_item`, `dispatch_document` | CONFIDENTIAL | Customer + volume distribusi |

### 2.5. Compliance & Audit

| Tabel | Klasifikasi | Notes |
|---|---|---|
| `audit_log` | RESTRICTED | Semua mutasi + before/after |
| `qr_registry` | INTERNAL | QR yang di-generate |
| `security_log` | RESTRICTED | Login attempts, privileged actions |
| `idempotency_key` | INTERNAL | Dedup cache |

---

## 3. Retention Matrix

Waktu retensi per data type. Setelah retensi expired, data di-delete otomatis lewat lifecycle cron.

| Data | Klasifikasi | Retention | Alasan |
|---|---|---|---|
| **Operasional shift** (semua tabel operasional) | CONFIDENTIAL | **10 tahun** | Regulasi cukai + BPOM |
| **Audit log** | RESTRICTED | **10 tahun** | Compliance audit trail |
| **Master data** (product, machine, dsb.) | INTERNAL/CONFIDENTIAL | **10 tahun** | Referensi historis untuk data operasional |
| **Security log** | RESTRICTED | **2 tahun** | Incident investigation + PDP compliance |
| **User account** | RESTRICTED | **10 tahun** (aktif) / **2 tahun** setelah deactivate | Cukai + PDP requirement |
| **User session** | RESTRICTED | **90 hari** setelah revoke | Debugging session issues |
| **Idempotency cache** | INTERNAL | **24 jam** | Dedup window |
| **Rate limit counter** | INTERNAL | **1 jam** rolling | Ephemeral |
| **Application log (info/warn)** | INTERNAL | **90 hari** | Debug recent issues |
| **Application log (error/fatal)** | INTERNAL | **1 tahun** | Post-mortem |
| **QR scan log** | INTERNAL | **1 tahun** | Traceability + analitik |
| **Backup daily** | CONFIDENTIAL | **30 hari** | Point-in-time recovery |
| **Backup weekly snapshot** | CONFIDENTIAL | **12 bulan** | DR + compliance |
| **Backup annual archive** | CONFIDENTIAL | **10 tahun** | Regulator |

**Overhead retensi 10 tahun**: gunakan **partitioning** di PostgreSQL (per year), auto-archive partisi lama ke cold storage → query hot data tetap cepat.

---

## 4. Soft Delete vs Hard Delete

### 4.1. Soft Delete (default)
Semua tabel operasional pakai kolom `deleted_at TIMESTAMP NULL`. `DELETE FROM ...` di aplikasi = set `deleted_at = now()`. Data tetap ada di DB.

**Alasan**: compliance — data cukai tidak boleh hilang.

**Query**: helper otomatis filter `WHERE deleted_at IS NULL`.

### 4.2. Hard Delete
Hanya boleh untuk:
- Data ephemeral: `idempotency_key`, session revoked, log expired.
- Retensi expired: cron menghapus data yang `deleted_at + retention` sudah lewat.

Hard delete tidak boleh manual — hanya lewat cron / migration.

### 4.3. Restoration
Kalau soft-deleted data perlu di-restore:
- SUPERADMIN eksekusi SQL: `UPDATE ... SET deleted_at = NULL WHERE id = ?`.
- Audit log entry: `restore` action + reason.

---

## 5. Data Subject Rights (PDP UU 27/2022)

Sesuai UU Perlindungan Data Pribadi Indonesia, user berhak:

### 5.1. Access (Right to Access)
User dapat request data pribadinya via kontak PM / IT.
Response: export JSON semua record dengan `userId = <userId>`.

### 5.2. Rectification (Perbaikan)
User dapat request koreksi data pribadi.
Contoh: nama typo, phone berubah.
Prosedur: kontak admin → update user record + audit log.

### 5.3. Erasure (Right to be Forgotten) — Limited
Data pribadi user dapat di-anonymize (bukan delete) setelah user resign / kontrak berakhir + retensi habis.
Anonymize: `user.full_name = 'Deleted User <hash>'`, `email = NULL`, `phone = NULL`.
**Tetap ada** di audit log & shift historis (compliance cukai > PDP).

### 5.4. Portability
Export data dalam format JSON standard. Tersedia via `GET /users/me/export` (Fase 2+).

### 5.5. Objection / Withdrawal
User boleh objection ke pemakaian data untuk marketing (kalau ada nanti). MES ini tidak marketing — tidak applicable.

Detail: [`22-compliance-pdp.md`](./22-compliance-pdp.md).

---

## 6. Cross-Border Data Transfer

**Hosting**: primary region **Singapore** (Vercel + Neon).
**Backup**: S3 region Singapore + optional Tokyo (fallback).

**Konsekuensi**: data physically outside Indonesia. Sesuai PDP UU pasal 56, transfer lintas batas boleh dengan:
1. Perlindungan setara UU PDP di negara tujuan (Singapore compliant per assessment).
2. Persetujuan dari data subject (di terms of service saat onboarding user).

**Documentation**: assessment cross-border transfer harus disimpan sebagai internal compliance evidence.

---

## 7. Data Masking di Log & Export

Field RESTRICTED wajib di-mask saat masuk log external (Sentry, dsb.):

| Field | Format Mask |
|---|---|
| `password` | Never logged |
| `refreshToken` | First 4 char + `...` (mis. `rft_...`) |
| `otp` | Never logged |
| `email` | `an***@hummer.example` |
| `phone` | `+62 812 *** 5678` |
| `ipAddress` | `203.194.***.***` di external; full di internal audit |
| `hmacSecret` | Never logged |

Helper utility: `sanitizeForLog(obj)`.

---

## 8. Audit Log Content

Untuk setiap mutasi:
- `actor_user_id` — siapa
- `scope_type`, `scope_id` — dalam scope apa
- `action` — event key (mis. `shift.approve`)
- `entity_table`, `entity_id` — apa yang diubah
- `before`, `after` — snapshot JSON (mask RESTRICTED fields)
- `ip_address` — full (INTERNAL) atau masked (kalau di-forward ke external)
- `user_agent`
- `is_privileged` — true kalau SUPERADMIN
- `created_at`

**Immutable**: audit log tidak bisa di-UPDATE/DELETE oleh siapa pun (RLS + DB permission).

---

## 9. Encryption Key Management

| Key | Scope | Rotation | Storage |
|---|---|---|---|
| `JWT_SECRET` | System-wide auth | Setahun | Vercel env vars (sensitive) |
| `HMAC_KEY_ENCRYPTION` | QR HMAC (per plant sub-key) | Setahun | Vercel env vars (sensitive) |
| DB encryption at rest | Full DB | Managed Neon | KMS |
| Backup encryption | Weekly/annual snapshots | Setahun | Offline paper safe |

Rotation prosedur di [`SECURITY.md`](../SECURITY.md) §7.3.

---

## 10. Data Retention Enforcement

Cron job harian `scripts/retention-cleanup.ts`:

```typescript
// Pseudocode
async function retentionCleanup() {
  // Hard delete session revoked > 90 hari
  await db.delete(userSession).where(and(
    isNotNull(userSession.revokedAt),
    lt(userSession.revokedAt, sql`now() - INTERVAL '90 days'`)
  ));

  // Hard delete idempotency keys expired
  await db.delete(idempotencyKey).where(lt(idempotencyKey.expiresAt, sql`now()`));

  // Hard delete security log > 2 tahun
  await db.delete(securityLog).where(lt(securityLog.createdAt, sql`now() - INTERVAL '2 years'`));

  // Anonymize deactivated user > 2 tahun
  // (audit log & shift history dijaga)
  await db.update(user).set({
    fullName: sql`'Deleted User ' || SUBSTR(id::text, 1, 8)`,
    email: null,
    phone: null,
  }).where(and(
    eq(user.isActive, false),
    lt(user.deletedAt, sql`now() - INTERVAL '2 years'`),
    isNotNull(user.fullName), // not yet anonymized
  ));

  // Archive shift APPROVED > 5 tahun ke cold storage
  // (tetap accessible via query terpisah, tapi hot table lebih ringan)
  // Implementation: partitioning + move partition to archive tablespace.
}
```

Schedule: `0 03 * * *` (Setiap hari 03:00 WIB, saat traffic rendah).

---

## 11. Verifikasi & Audit

### 11.1. Internal
- Quarterly review: apakah retention policy jalan? Sample check data > retention masih ada tidak?
- Post-cleanup verification: log jumlah record deleted.

### 11.2. Eksternal
- Audit cukai / BPOM: siapkan export lengkap dalam 5 hari kerja request.
- Audit PDP (kalau ada regulator inquiry): tunjukkan data classification + retention policy + anonymization log.

---

## 12. Referensi

- [`SECURITY.md`](../SECURITY.md) — encryption + incident detail.
- [`22-compliance-pdp.md`](./22-compliance-pdp.md) — PDP UU spesifik.
- [`18-backup-recovery.md`](./18-backup-recovery.md) — backup retention.
- [`04-data-model.md`](./04-data-model.md) §9 — RLS policy.
- UU 27/2022 tentang Perlindungan Data Pribadi.
- PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik.
