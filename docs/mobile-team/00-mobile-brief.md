# 00 · Mobile Brief — Apa & Untuk Siapa

Ringkasan bisnis 1 halaman untuk mobile dev yang baru masuk. Baca ini sebelum masuk ke spec teknis.

---

## Apa Sistemnya

**MES + WMS Hummer** — sistem terintegrasi untuk pabrik rokok multi-cabang milik grup Hummer:

- **MES** (Manufacturing Execution System) — mencatat produksi rokok di lantai pabrik.
- **WMS Inbound** — mencatat kedatangan bahan baku TSG (Tembakau Saos Gagang) dari supplier + inventory FIFO.
- **WMS Outbound & Distribusi** — receiving pack HLP, cartoning, surat jalan (fase belakang, bukan target mobile awal).

**Skala target**: 30+ pabrik heterogen (produk & konfigurasi mesin bisa berbeda). Hierarki organisasi: `Kantor Pusat → Koordinator Area → Pabrik`.

**Produk utama**: **Hummer** (rokok kretek mesin). Sistem mendukung multi-merek — satu mesin bisa produksi produk berbeda antar shift.

---

## Aplikasi Mobile — Untuk Siapa

App Flutter ini untuk **pengguna lantai / lapangan**. Dashboard supervisor, koordinator area, HQ = **web** (bukan mobile).

| User mobile | Fase | Aktivitas utama |
|---|---|---|
| **Operator Kecer** | 1 | Input produksi per boks TSG: buka boks, log event, timbang selesai |
| **Ketua Kecer** | 1 | Start/end shift, tambah anggota tim, handoff pergantian shift, input waste 4 kategori |
| **Anggota Tim** | 1 | Read-only ke shift aktif (tercatat di ShiftMember) |
| **Gudang Inbound** | 1 | Terima TSG dari supplier, kelola inventory FIFO |
| **Gudang Outbound** | 5 | Confirm pack dari HLP, cartoning |
| **SUPERADMIN** | 0+ | Jarang login mobile; kalau login juga single-session + 2FA |

**Tidak untuk mobile** (mereka pakai web):
- Supervisor Pabrik (approve shift)
- Koordinator Area (dashboard rollup)
- HQ Analyst/Admin/Auditor
- Ekspedisi (dispatch)

---

## Workflow Utama Per Shift (Operator Kecer)

Alur real-world dari start shift sampai LOCKED:

```
1. LOGIN (single-session enforce)
   ↓
2. SCAN QR MESIN (Maker/HLP) — pre-fill form Start Shift
   ↓
3. START SHIFT — pilih produk, template shift, anggota tim
   → Kalau ada handoff dari shift sebelumnya, auto-claim
   ↓
4. LOOP produksi (26+ boks per shift 8-13 jam):
   a. SCAN QR BOKS TSG (dari inventory gudang) → open boks
   b. Selama produksi, opsional log:
      - + Tambah pemakaian (bobin/filter/tipping)
      - + Log downtime
      - + Log maintenance sparepart
   c. Boks habis → TIMBANG hasil batangan → server hitung yield
   d. Ulangi ke a
   ↓
5. END SHIFT:
   - Kalau ada boks aktif belum habis → wajib timbang HANDOFF (sisa TSG + batangan sementara)
   - Input 4 kategori waste: Menir, Rijekan, Debu Kasar, Debu Halus
   - Input izin/waktu kerja tim
   ↓
6. Status → COMPLETED. Supervisor pabrik approve di web (bukan mobile).
```

**Rata-rata**: 1 boks ≈ 30 menit produksi. Input UI harus cepat (< 60 detik per boks).

---

## Aturan Kritikal yang Harus Di-Enforce di App

### 1. Single-Session Mobile
Satu user hanya boleh 1 sesi mobile aktif. Kalau login di device kedua → server balikin **409 SESSION_EXISTS**. UI harus tampil modal jelas dengan info device lama + tombol "Hubungi IT" (untuk SUPERADMIN revoke sesi lama). User **tidak bisa self-service** pindah device.

### 2. Offline Tolerance
Sinyal 4G sering drop di lantai produksi (blok beton, mesin). App wajib:
- Local queue (SQLite via `drift`) untuk semua mutasi yang gagal kirim.
- Retry otomatis saat online (backoff exponential).
- **Idempotency-Key** di setiap request → server dedup duplikat.

### 3. Kalkulasi Server-Side
**Jangan hitung yield atau berat per batang di client** — semua kalkulasi di server. Client kirim raw data (TSG kg, output kg). Server tarik `MachineTemplate` untuk produk yang lagi dijalankan → hitung yield & indicator (NORMAL/WARNING). Alasannya: multi-produk, tolerance beda per produk, dan operator tidak boleh manipulasi via DevTools.

### 4. Boks TSG Wajib dari Inventory
Operator **tidak bisa** input boks TSG sembarangan. Boks harus dari `tsg_inventory` status `AVAILABLE`. App tampilkan FIFO list (tertua di atas) atau scan QR boks yang sudah ada di inventory. Kalau input `inventoryBoxId` yang tidak available → server 400.

### 5. QR Dinamis dengan HMAC
QR boks TSG, batch, pack punya HMAC signature di query string. Server verify — QR palsu / hasil re-print ilegal ditolak.

### 6. Handoff Wajib di Pergantian Shift
Kalau shift diakhiri dengan boks aktif belum habis → sistem block end shift sampai operator timbang `sisaTsgKg` + `batanganSementaraKg`. Data ini masuk `ShiftHandoff` — shift baru berikutnya auto-claim.

---

## Yang Bukan Scope Mobile

- **Dashboard supervisor / koordinator / HQ** — semua di web responsive.
- **Master data CRUD** (Product, Machine, ShiftTemplate, dsb) — hanya HQ_ADMIN via web.
- **Approval shift** — supervisor pabrik via web (mobile hanya lihat status).
- **CORRECTION shift LOCKED** — HQ_AUDITOR via web.
- **Cartoning & dispatch** — Gudang Outbound & Ekspedisi via web/tablet (bukan mobile awal).
- **Report export cukai** — HQ Analyst via web.

---

## Backend Highlights (yang mobile perlu tahu)

- **Multi-tenant** dengan Row-Level Security (RLS) — user hanya lihat data plant di scope-nya.
- **Multi-scope user** — 1 user bisa punya banyak `UserAssignment`. Login response berisi list assignment; kalau lebih dari 1, user pilih active scope. Bisa switch via `/auth/switch-scope`.
- **Approval workflow**: `RUNNING → COMPLETED → APPROVED (LOCKED)`. Setelah LOCKED, immutable.
- **Semua mutasi tercatat** di `audit_log` dengan `before → after`.
- **SUPERADMIN** = role privileged (max 3 aktif per system) untuk vendor developer + IT lead. Bisa impersonate, force logout, akses audit lintas company. Mobile app mereka juga single-session + 2FA.

---

**Lanjut ke** [`01-app-spec.md`](./01-app-spec.md) **untuk spec teknis lengkap.**
