# 19 · Data Migration — Dari Paper ke Sistem

Panduan **migrasi dari sistem manual paper** ke MES + WMS Hummer untuk pabrik pilot dan rollout. Ini adalah salah satu risiko terbesar go-live — operator terbiasa kertas, data historis di kertas, dan cutover butuh koordinasi ketat.

---

## 1. Konteks & Tantangan

### 1.1. Kondisi Existing (Sebelum Sistem)
- Pencatatan produksi manual di form kertas (contoh: `Desktop/WhatsApp Image 2026-08-10 at 00.13.26.jpeg`).
- Data direkap oleh supervisor pabrik → dikirim ke koordinator area mingguan/bulanan.
- Inventory TSG dikelola manual (ledger buku).
- Barang jadi + dispatch: surat jalan kertas.
- **Tidak ada digital reference historis** — kalau butuh data 3 bulan lalu, cari di arsip fisik.

### 1.2. Tantangan Utama
1. **Adopsi operator**: 40+ tahun umur rata-rata, tidak familiar tablet.
2. **Data historis**: 10+ tahun laporan kertas — tidak perlu masuk sistem, tapi harus tetap accessible untuk audit cukai.
3. **Cutover**: pabrik operasi 24/7 — tidak bisa "pause" untuk migrasi.
4. **Master data**: supplier, mesin, produk perlu masuk sistem dulu.
5. **Tim gudang**: TSG inventory harus reconcile physical vs digital saat cutover.

---

## 2. Strategi Migrasi — 3 Fase

### Fase A · Prep (2 minggu sebelum cutover)
1. Onboarding master data.
2. Training operator + supervisor.
3. Backfill inventory current.

### Fase B · Cutover (1 hari, direncanakan)
1. Freeze paper (jam X).
2. Physical stocktake TSG.
3. Digital seed inventory.
4. Go-live sistem (jam X+4).

### Fase C · Stabilize (1-2 minggu setelah)
1. Support intensive lapangan.
2. Reconcile paper vs digital (kalau ada gap).
3. Documented lesson learned.

---

## 3. Fase A · Prep (Detail)

### 3.1. Master Data Setup (H-14)

Data yang harus dimasukkan lewat HQ_ADMIN:
- **Company**: 1 (Hummer Group).
- **Region**: 1 (untuk pilot).
- **Plant**: 1 (pabrik pilot, mis. PLT-MLG-01).
- **User accounts**:
  - 1 SUPERADMIN (via CLI).
  - 1 HQ_ADMIN.
  - 1 PLANT_MANAGER.
  - 2-3 SHIFT_SUPERVISOR.
  - 5-30 OPERATOR_KECER (per shift).
  - 2-5 GUDANG_INBOUND.
- **Product**: Hummer STD + variant lain kalau ada.
- **Machine**: MKR-01, MKR-02, HLP-01 (sesuai fisik pabrik).
- **MachineTemplate**: yieldRange 110-114% untuk Hummer × Maker.
- **ShiftTemplate**: Siang 05:30 durasi 660 mnt, Malam 16:30 durasi 780 mnt.
- **ShiftRole**: Ketua Kecer, Operator, Pembantu.
- **ConsumableItem**: Bobin, Filter, Tipping per produk.
- **Sparepart**: Nylon, Pisau Filter, dsb.
- **DowntimeCategory**: GANTI_MATERIAL, KENDALA_MESIN, TUNGGU_BAHAN, ISTIRAHAT_IZIN, MAINTENANCE.
- **RejectReason**: Batang Patah, Berat Tidak Sesuai, dsb.
- **TsgSupplier**: 2-5 supplier existing.

Waktu: ~2 hari kalau HQ_ADMIN fokus.

### 3.2. Training (H-14 sampai H-3)

#### Operator Kecer & Ketua Kecer (per shift, 2-3 sesi @ 2 jam):
- Sesi 1: overview sistem + login + start shift.
- Sesi 2: input boks, event log, timbang.
- Sesi 3: end shift dengan waste + handoff.
- Hands-on di tablet emulator / staging env.

#### Supervisor Pabrik (1 sesi @ 4 jam):
- Approve flow.
- Dashboard pabrik.
- Handle anomaly (reopen, correction request).

#### Gudang Inbound (2 sesi @ 2 jam):
- Receiving TSG.
- Kelola inventory FIFO.
- Alokasi ke shift.

#### Material Training:
- Video 10 menit per role.
- Cheat sheet 1 halaman (printable).
- WhatsApp support group untuk Q&A.

### 3.3. Test Run (H-7 sampai H-3)
- 1 shift **dummy** di staging: operator jalankan shift lengkap dengan data fake.
- Supervisor review.
- Feedback → adjust UI/UX kalau perlu.

### 3.4. Backfill Inventory (H-1)
- Staff gudang lakukan stocktake TSG fisik.
- Input semua boks existing sebagai `TsgReceiving` retro (backdated 1 hari max, per aturan sistem).
- Verify total match physical count.

---

## 4. Fase B · Cutover (Detail — 1 Hari)

### T-24 jam (H-1 sore)
- **Freeze paper**: hentikan pencatatan kertas mulai shift MALAM H-1.
- Shift MALAM H-1 = **last paper shift**. Data hari itu akan direkap manual + entry ke sistem sebagai historical baseline (opsional).

### T-0 (H+0, 05:00 WIB)
- **Cutover start**.
- Shift SIANG mulai jam 05:30 = **first digital shift**.

### T-0 sampai T+4 jam (05:00-09:00)
- Backfill inventory final oleh Gudang Inbound.
- Verify semua master data lengkap.
- SUPERADMIN + tech lead standby di pabrik atau remote.

### T+4 sampai T+24 jam
- Shift SIANG pertama di sistem — support intensive.
- Setiap issue → real-time troubleshoot.
- Shift MALAM juga dibimbing.

### Rollback Plan (kalau critical issue)
- Kalau blocking bug (mis. shift tidak bisa dibuat) → **fallback ke paper** untuk 24 jam.
- Fix + re-cutover.
- Data manual yang dientri di paper selama fallback → dientri retro setelah sistem stabil.

---

## 5. Fase C · Stabilize (1-2 Minggu)

### Support Lapangan (Minggu 1)
- Tech + PM standby di pabrik minimal 3 hari.
- WhatsApp support group 24/7.
- Daily standup dengan operator: apa yang bermasalah?

### Reconciliation (Minggu 1-2)
- Compare output digital vs manual paper (kalau kertas masih ada paralel):
  - Total produksi per shift.
  - Total waste.
  - Yield.
- Kalau ada gap > 2% → investigate (data entry error, calculation bug, atau physical count).

### Adjustments
- UI/UX tweak berdasarkan feedback.
- Master data adjustment (mis. tambah RejectReason baru yang belum ke-catch).

### Lesson Learned (Minggu 2)
- Post-cutover meeting.
- Dokumentasi hal yang bekerja / tidak.
- Update runbook untuk cutover pabrik berikutnya.

---

## 6. Data Historis — Kertas 10 Tahun

**Keputusan**: **TIDAK di-import ke sistem**.

**Alasan**:
- Data manual sering inkonsisten format → import butuh manual cleaning yang berbulan-bulan.
- Compliance cukai butuh **traceability**, bukan **searchability** — arsip fisik cukup.
- Cost/benefit tidak worth.

**Strategi**:
- Arsip fisik tetap disimpan sesuai regulasi (10 tahun).
- Kalau auditor request data historis → cari di arsip.
- Kalau butuh trend analysis historis → aggregate manual sekali di Excel + import sebagai reference dataset (bukan operational).

---

## 7. Rollout ke Pabrik Berikutnya (Fase 2 · Multi-Plant)

Setelah pilot pabrik 1 stabil (min 1 bulan), rollout ke pabrik berikutnya:

### 7.1. Cadence
- 1 pabrik per minggu — jangan lebih (support capacity).
- Total 30 pabrik = ~30 minggu (Fase 2-4 durasi).

### 7.2. Playbook Per Pabrik
1. **Prep (H-14 s.d. H-1)**: master data + training + backfill inventory.
2. **Cutover (H+0)**: sesuai §4.
3. **Stabilize (H+1 s.d. H+14)**: sesuai §5.
4. **Handoff (H+15)**: ops takeover dari deployment team.

### 7.3. Playbook Optimization
Setiap pabrik cutover, update playbook berdasarkan lesson learned:
- Common issue → tambah di runbook.
- Master data yang missed → tambah checklist.
- Training material update.

Target: pabrik ke-30 = cutover 1 hari smooth (playbook matang).

---

## 8. Data Contamination Prevention

### 8.1. Aturan Kunci
- **Backfilled data** (input retro dari paper) → tandai dengan flag `isBackfilled=true` di record.
- **Manual data seed** → tandai source `MIGRATION`, bukan `USER`.
- Ini penting untuk analytics — jangan gabung backfilled dengan real data saat trend analysis.

### 8.2. Retro Entry Limits
- Backfill retro max 7 hari — lebih dari itu butuh SUPERADMIN approve.
- Backfill ke shift APPROVED → tidak boleh, harus CORRECTION.

---

## 9. Migration Checklist per Pabrik

### 9.1. H-14
- [ ] Master data ready (Company/Region/Plant/Machine/Product/Template/User).
- [ ] User account created untuk semua operator + supervisor + gudang.
- [ ] Training video + cheat sheet ready dalam bahasa lokal (Bahasa Indonesia).

### 9.2. H-7
- [ ] Training operator sesi 1-3 selesai.
- [ ] Training supervisor selesai.
- [ ] Training gudang selesai.
- [ ] Test run di staging berhasil.

### 9.3. H-1
- [ ] Stocktake TSG selesai + di-input ke sistem sebagai retro receiving.
- [ ] Backup paper final direkap (opsional untuk historical baseline).
- [ ] Freeze paper diumumkan.
- [ ] Tech + PM on-site atau standby remote.

### 9.4. H+0
- [ ] Cutover kickoff jam 05:00.
- [ ] Shift SIANG pertama di sistem (05:30).
- [ ] Real-time support aktif.

### 9.5. H+7
- [ ] Support harian aktif.
- [ ] Reconciliation daily.
- [ ] Feedback loop dengan operator.

### 9.6. H+14
- [ ] Post-cutover meeting.
- [ ] Lesson learned dokumentasi.
- [ ] Handoff ke ops.

---

## 10. Failure Modes & Contingency

### 10.1. Operator Tidak Bisa Login Massal
- **Cause**: kredensial belum di-share dengan benar.
- **Fix**: SUPERADMIN reset password + broadcast baru.
- **Contingency**: kembali ke paper 1 shift, fix, resume digital shift berikut.

### 10.2. Inventory Tidak Match Physical
- **Cause**: input backfill retro tidak akurat.
- **Fix**: stocktake ulang → correction di sistem via SUPERADMIN + audit log.
- **Contingency**: pause receiving TSG baru sampai reconcile.

### 10.3. Operator Tidak Mau Pakai Sistem
- **Cause**: adopsi lambat, tablet dianggap ribet.
- **Fix**: training tambahan 1-on-1 + supervisor mendampingi.
- **Contingency**: kalau > 50% operator tolak → post-mortem, mungkin UI perlu perbaikan besar sebelum full-rollout.

### 10.4. Critical Bug Terdeteksi Post-Cutover
- **Fix**: rollback deploy + fallback paper 24 jam.
- **Post-fix**: retro entry data paper ke sistem.
- **Post-mortem**: kenapa bug lolos test?

---

## 11. Timeline Contoh (Pabrik Pilot Malang-1)

```
Minggu -3 (2026-08-11 s.d. 2026-08-17):
  - Master data setup by HQ_ADMIN
  - Deploy staging env ready

Minggu -2 (2026-08-18 s.d. 2026-08-24):
  - Training operator sesi 1 (Senin)
  - Training operator sesi 2 (Rabu)
  - Training operator sesi 3 (Jumat)
  - Training supervisor (Sabtu)

Minggu -1 (2026-08-25 s.d. 2026-08-31):
  - Test run di staging (Senin-Selasa)
  - Training gudang (Rabu)
  - Backfill inventory (Kamis-Jumat)
  - Freeze paper (Sabtu 16:30)

CUTOVER: Minggu 2026-09-01
  - Sabtu 05:00 — Cutover start (backfill final)
  - Sabtu 05:30 — Shift SIANG pertama digital
  - Sabtu-Selasa — Support intensive on-site

Minggu +1 (2026-09-02 s.d. 2026-09-08):
  - Support harian on-site
  - Reconciliation daily

Minggu +2 (2026-09-09 s.d. 2026-09-15):
  - Post-cutover review
  - Handoff ke ops
```

---

## 12. Referensi

- [`10-wms-inbound-spec.md`](./10-wms-inbound-spec.md) §8 — migration WMS Inbound.
- [`17-operations-runbook.md`](./17-operations-runbook.md) — incident procedure saat cutover.
- [`08-roadmap.md`](./08-roadmap.md) Fase 2 — rollout multi-pabrik.
- [`01-prd.md`](./01-prd.md) §3 — persona operator (untuk empathy saat training).
