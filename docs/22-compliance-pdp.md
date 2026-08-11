# 22 · Compliance PDP (UU 27/2022 Indonesia)

Spec compliance terhadap **Undang-Undang Perlindungan Data Pribadi Indonesia (UU 27/2022)** yang berlaku efektif Oktober 2024.

**Konteks**: MES + WMS Hummer memproses data pribadi (nama, phone, email operator). Walau tidak public-facing, wajib comply karena data karyawan/kontraktor dilindungi UU PDP.

---

## 1. Ruang Lingkup

### 1.1. Data Pribadi yang Diproses
| Kategori | Contoh field | Klasifikasi |
|---|---|---|
| **Identitas** | `user.full_name`, `user.username` | RESTRICTED |
| **Kontak** | `user.email`, `user.phone` | RESTRICTED |
| **Kredensial** | `user.password_hash` | RESTRICTED |
| **Sesi** | `user_session.device_id`, `user_session.ip_address` | RESTRICTED |
| **Audit** | Nama user di `audit_log.actor_user_id` (via join) | CONFIDENTIAL |
| **Aktivitas kerja** | `shift_member.user_id`, `leave_minutes`, `note` (izin) | CONFIDENTIAL |

**BUKAN data pribadi** (walau terlihat mirip):
- Kode mesin (`MKR-01`) — asset, bukan pribadi.
- Produk kode — bisnis IP.
- Data produksi (yield, waste) — bisnis operasional.

### 1.2. Subjek Data
- Operator kecer, ketua kecer, anggota tim.
- Supervisor pabrik.
- Koordinator area.
- HQ staff (admin, analyst, auditor).
- SUPERADMIN (vendor developer + IT lead).
- Gudang inbound/outbound, ekspedisi.

Total estimasi: 500-2000 user aktif saat 30+ pabrik operasional.

### 1.3. Pengendali & Pemroses
- **Pengendali Data Pribadi (Data Controller)**: Hummer Group.
- **Pemroses Data Pribadi (Data Processor)**: Vercel, Neon (host + DB), Sentry (log), Twilio (OTP).
- Semua sub-processor terdaftar di appendix (buat file terpisah kalau perlu).

---

## 2. Prinsip Perlindungan (Pasal 3 UU PDP)

### 2.1. Legitimasi Pemrosesan
Basis hukum: **Pasal 20 ayat (2)** — pemrosesan diperlukan untuk pelaksanaan **kewajiban dari Peraturan Perundang-undangan** dan **hubungan kerja** (kontrak kerja karyawan).

**Konsekuensi**: tidak perlu persetujuan eksplisit dari user untuk pemrosesan dasar operasional. Tapi tetap wajib:
- Notifikasi (§3).
- Purpose limitation (§4).
- Data minimization (§5).

### 2.2. Purpose Limitation
Data dipakai HANYA untuk:
- Autentikasi & otorisasi user ke sistem.
- Attribusi aksi produksi ke user (compliance cukai).
- Audit trail keamanan.
- Analitik produksi (dalam bentuk aggregate, tidak individual profiling).

**Tidak untuk**:
- Marketing.
- Third-party sharing.
- Profiling AI/ML untuk keputusan otomatis yang impact user (mis. otomatis fire karyawan).

### 2.3. Data Minimization
Simpan hanya yang perlu:
- Email opsional (kalau perlu password reset).
- Phone opsional (kalau perlu OTP).
- NIK / NPWP: **TIDAK disimpan** (di luar scope).
- Foto: **TIDAK disimpan**.
- Alamat rumah: **TIDAK disimpan**.
- Data gaji: **TIDAK disimpan** (ada di sistem HR terpisah).

### 2.4. Akurasi
- User bisa update profile sendiri (Fase 2+).
- Sistem prompt user verifikasi email + phone setahun sekali.

### 2.5. Storage Limitation
Detail retensi di [`21-data-retention-classification.md`](./21-data-retention-classification.md) §3.

### 2.6. Keamanan
Detail di [`SECURITY.md`](../SECURITY.md).

### 2.7. Akuntabilitas
- DPO (Data Protection Officer) — placeholder, ditunjuk oleh Hummer Group.
- Dokumentasi kepatuhan lengkap (file ini + related docs).
- Audit tahunan.

---

## 3. Notifikasi & Persetujuan (Pasal 27-29)

### 3.1. Notifikasi Saat Onboarding
Saat user baru dibuat oleh HQ_ADMIN, wajib **Data Privacy Notice** diserahkan (email + printed acknowledgment):

**Template Notifikasi** (Bahasa Indonesia):

> **Pemberitahuan Perlindungan Data Pribadi**
>
> Yth. {nama user},
>
> Sistem MES + WMS Hummer akan memproses data pribadi Anda dengan detail berikut:
>
> **Data yang dikumpulkan**: nama lengkap, username, email (opsional), phone (opsional), password (hashed), device info (mobile), IP address, log aktivitas kerja.
>
> **Tujuan**: autentikasi sistem, attribusi produksi, compliance cukai/BPOM, keamanan.
>
> **Retensi**: aktif = 10 tahun; setelah tidak aktif = 2 tahun kemudian anonymized.
>
> **Hak Anda**: akses, koreksi, penghapusan (dengan pengecualian compliance), portabilitas, keluhan.
>
> **Kontak DPO**: dpo@hummer.example
>
> Sistem ini di-host di Vercel (Singapore) dan Neon (Singapore). Data disimpan sesuai regulasi cross-border transfer UU PDP Pasal 56.
>
> Dengan menggunakan sistem ini, Anda mengonfirmasi telah menerima pemberitahuan ini sebagai bagian dari kontrak kerja.
>
> Tanggal: {tanggal onboard}
> Nomor referensi: {userId}

### 3.2. Bukti Acknowledgment
- User tanda tangan digital saat login pertama (Fase 2 feature).
- Alternatif: printed form + scan → simpan.

### 3.3. Perubahan Notifikasi
Kalau ada perubahan material (mis. tambah pemrosesan data), user diberi tahu ulang sebelum berlaku.

---

## 4. Hak Subjek Data (Pasal 5-15)

### 4.1. Right to Access
User request via kontak DPO / PM. Response dalam **3 hari kerja** (regulasi 72 jam):
- Export JSON semua record dengan `userId = <userId>`.
- Format standar (portable).

### 4.2. Right to Rectification
User request update. Response dalam **7 hari kerja**.
- Nama typo → update user record + audit log.
- Phone/email → self-service via profile (Fase 2+).

### 4.3. Right to Erasure (Right to be Forgotten) — LIMITED
Data operasional (shift, boks, batch) **tidak bisa dihapus** karena regulasi cukai.
Tapi data pribadi (nama, phone, email) bisa **di-anonymize**:
- Ganti `full_name = 'Deleted User <hash>'`.
- Set `email = NULL`, `phone = NULL`.
- Preserve `id` untuk foreign key integrity.

Trigger: user resign/kontrak berakhir + retensi 2 tahun berlalu → auto-anonymize cron.

### 4.4. Right to Data Portability
Export JSON (Fase 2+ feature):
```
GET /users/me/export
→ {
  "userId": "...",
  "profile": {...},
  "sessions": [...],
  "shifts": [...],
  "waste": [...]
}
```

### 4.5. Right to Object
Kalau ada profiling (Fase 4+ analytics), user boleh objection. Sistem harus stop profiling untuk user tsb.

### 4.6. Right to Withdraw Consent
User boleh withdraw consent untuk pemrosesan berbasis consent (mis. marketing kalau ada).
Untuk pemrosesan berbasis kewajiban hukum (basis default kita), withdraw = kontrak kerja terminate.

### 4.7. Right to Lodge Complaint
User boleh keluhan ke:
1. DPO Hummer Group (internal).
2. Otoritas Perlindungan Data Pribadi Indonesia (external, kalau nanti terbentuk badan-nya).

---

## 5. Data Protection Officer (DPO)

Sesuai UU PDP Pasal 53, **DPO wajib** untuk pengendali dengan pemrosesan skala besar.

**Kriteria kualifikasi DPO**:
- Ahli hukum + IT + pemrosesan data.
- Independen (tidak conflict interest).
- Diberi otoritas untuk enforce compliance.

**DPO Hummer Group** (placeholder):
- Nama: *(TBD)*
- Kontak: dpo@hummer.example *(placeholder)*
- Kewajiban:
  - Advise stakeholder terkait compliance.
  - Monitor implementasi.
  - Handle inquiry / complaint.
  - Kontak point ke regulator.

---

## 6. Data Breach Notification (Pasal 46)

**Timeline**: notification ke otoritas dalam **3x24 jam** sejak deteksi breach.

### 6.1. Kriteria "Data Breach"
- Data pribadi tak sah diakses / diubah / hilang / disclosed.
- Cross-tenant leak.
- Ransomware / data encryption.
- Massive credential compromise.

### 6.2. Prosedur (dari [`SECURITY.md`](../SECURITY.md) §6)
1. Immediate: contain (isolate, rotate credentials).
2. Assess: impact — berapa user, data mana, sensitivity.
3. Notify:
   - **Otoritas Perlindungan Data Pribadi**: dalam 3x24 jam.
   - **Data subject affected**: kalau breach berdampak signifikan pada hak & kepentingan mereka.
   - Format notifikasi: uraian kejadian, kategori data, jumlah subjek, konsekuensi, mitigasi.
4. Document: log incident + notification bukti untuk audit.

### 6.3. Template Notifikasi Breach

**Ke Otoritas / DPO**:
```
Kepada: Otoritas Perlindungan Data Pribadi Indonesia
Perihal: Notifikasi Kejadian Breach Data Pribadi

Tanggal deteksi: YYYY-MM-DD HH:MM WIB
Deskripsi: ...
Kategori data: RESTRICTED (kredensial + session)
Jumlah data subjek: ~X orang
Konsekuensi: ...
Mitigasi yang sudah dilakukan: ...
Timeline resolusi: ...

DPO Hummer Group,
{nama} — {kontak}
```

**Ke Data Subject**:
```
Yth. {nama},

Kami memberi tahu bahwa terjadi insiden keamanan pada tanggal {tanggal} yang berpotensi 
mempengaruhi data pribadi Anda: {kategori data}.

Yang sudah kami lakukan: {mitigasi}.
Yang perlu Anda lakukan: {saran, mis. ganti password}.
Kontak untuk pertanyaan: dpo@hummer.example.
```

---

## 7. Data Protection Impact Assessment (DPIA)

Untuk pemrosesan risiko tinggi (Pasal 33), wajib DPIA sebelum implementasi.

### 7.1. Kapan DPIA Wajib
- Fitur baru yang tambah pemrosesan data pribadi signifikan.
- Perubahan sub-processor.
- Cross-border transfer baru.
- Profiling AI/ML.

### 7.2. Template DPIA
Simpan di `docs/dpia/YYYY-MM-DD-<fitur>.md`:
```markdown
# DPIA — <fitur>

## Deskripsi Pemrosesan
- Data apa dikumpulkan
- Untuk apa
- Berapa lama

## Necessity & Proportionality
- Kenapa data ini butuh dikumpulkan
- Alternatif yang dipertimbangkan

## Risk Assessment
- Risiko terhadap data subject
- Likelihood + severity

## Mitigasi
- Kontrol teknis + prosedural

## Kesimpulan
- Approve / reject / conditional

Ditandatangani oleh: DPO
Tanggal: YYYY-MM-DD
```

---

## 8. Sub-Processor Management

### 8.1. Daftar Sub-Processor (aktif)
| Vendor | Layanan | Data | Location | DPA (Data Processing Agreement) |
|---|---|---|---|---|
| Vercel | Hosting + CDN | Semua request log | Singapore | Vercel DPA (built-in) |
| Neon | PostgreSQL managed | Semua data operational | Singapore | Neon DPA |
| Sentry | Error tracking | Log error (sanitized) | Multi-region | Sentry DPA |
| Twilio | WhatsApp OTP | Phone number, OTP delivery | US + local number | Twilio DPA |
| Upstash | Redis | Rate limit + idempotency | Singapore | Upstash DPA |
| Vercel Blob | File storage | PDF surat jalan | Multi-region | Vercel DPA |
| Firebase (Fase 3+) | FCM push | Device token | Multi-region | Google DPA |

### 8.2. DPA Requirement per Vendor
Wajib punya DPA yang mencakup:
- Confidentiality obligation.
- Security measures.
- Incident notification (72 jam).
- Sub-processor cascading (kalau vendor pakai sub-vendor).
- Return / delete data saat kontrak berakhir.

### 8.3. Vendor Change
Kalau ganti vendor, notify user (kalau signifikan) + update DPIA + DPA.

---

## 9. Cross-Border Data Transfer (Pasal 56)

Data hosted di Singapore (Vercel + Neon).
Basis hukum transfer:
- **Pasal 56 ayat (1)(a)**: Singapore memiliki perlindungan data setara Indonesia (per PDPA Singapore 2012 yang diakui equivalent).
- Backup Tokyo (fallback): Jepang juga memiliki perlindungan setara (APPI 2003).

**Dokumentasi**:
- Assessment cross-border harus disimpan.
- Notifikasi ke user tentang lokasi hosting (di notifikasi §3.1).

---

## 10. Hak Anak (Pasal 25-26)

Sistem ini **tidak ditujukan untuk anak < 18 tahun**. Semua user adalah karyawan/kontraktor dewasa Hummer Group.

Kalau nanti ada extension yang mungkin melibatkan magang < 18 tahun:
- Persetujuan orang tua/wali eksplisit.
- Age verification saat onboarding.
- Data anak diberi perlakuan khusus (retensi lebih pendek, encryption tambahan).

---

## 11. Kepatuhan Berkelanjutan

### 11.1. Annual Audit
- Q1 setiap tahun: DPO + tech lead review implementasi vs UU PDP.
- Update file ini kalau ada gap.
- Report ke management.

### 11.2. Training Compliance
- Semua HQ_ADMIN + SUPERADMIN wajib training PDP tahunan.
- Certification tersimpan sebagai bukti compliance.

### 11.3. Update Regulasi
- Monitor peraturan turunan (PP, Permen) dari UU 27/2022.
- Update kebijakan setiap ada perubahan material.

---

## 12. Kontak Compliance

- **DPO**: dpo@hummer.example *(placeholder — isi nama & email real)*
- **Legal Counsel**: legal@hummer.example
- **Security Lead**: (lihat [`SECURITY.md`](../SECURITY.md))
- **Data Subject Inquiry**: dpo@hummer.example

---

## 13. Referensi

- [UU 27/2022 tentang Perlindungan Data Pribadi](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022) — sumber utama.
- PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik.
- [`SECURITY.md`](../SECURITY.md) — implementasi teknis.
- [`21-data-retention-classification.md`](./21-data-retention-classification.md) — retention detail.
- [`17-operations-runbook.md`](./17-operations-runbook.md) — incident procedure.
