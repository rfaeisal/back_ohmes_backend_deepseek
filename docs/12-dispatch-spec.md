# 12 · Spesifikasi Teknis Distribusi Basic (Fase 6)

Dokumen operasional untuk **modul Distribusi Basic** — dieksekusi di Fase 6, setelah Fase 5 (WMS Outbound) stabil. Fokus: dispatch order + surat jalan PDF. **Bukan** full order management / TMS.

**Ditujukan**: developer/QA Fase 6 (backend + PDF generation + tablet UI Ekspedisi).
**Related**: [`04-data-model.md`](./04-data-model.md) §7C, [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.5 + §4.1, [`06-api-spec.md`](./06-api-spec.md) §4C.

---

## 1. Konteks Bisnis

**Alur real world**:
1. Distributor / customer order (biasanya via telepon atau sales rep).
2. Staff ekspedisi terima info: customer name, alamat, jumlah karton, kapan pickup.
3. Ekspedisi pilih karton READY di gudang jadi → assembly pesanan.
4. Load ke truk, cetak surat jalan (2 rangkap: pabrik & customer).
5. Truk berangkat.

**Masalah yang dihindari**:
- Karton keluar tanpa dokumentasi.
- Karton yang belum siap (OPEN status) keluar duluan.
- Rekonsiliasi pengeluaran bulanan sulit karena data tersebar di kertas surat jalan.

---

## 2. User Journey — Staff Ekspedisi

### 2.1. Buat Dispatch Order

#### Step 1: Order Baru
- Halaman Ekspedisi utama: tombol "+ Order Baru".
- Modal:
  - Input Customer Name (bisa ada quick-fill dari histori — pelanggan yang sering).
  - Input Customer Address.
  - Input Contact (opsional).
  - Input Driver Name.
  - Input Vehicle No (mis. "N 1234 XY").

#### Step 2: Pilih Karton
- Section "Pilih Karton":
  - Filter by produk & tanggal.
  - Hanya karton status READY yang muncul.
  - Sort by `closedAt ASC` (FIFO — karton lama dulu supaya tidak menumpuk).
  - Checkbox multi-select.
  - Live counter: "12 karton dipilih".

#### Step 3: Preview & Simpan Draft
- Preview: header order (customer, driver, kendaraan) + list karton (kode + product + jumlah pack).
- Total karton, total pack, total batang.
- Tap "Simpan Draft" → POST `/dispatch/orders` → status `DRAFT`.
- Response `orderId` + `orderCode`.

### 2.2. Generate Surat Jalan

#### Step 4: Generate PDF
- Halaman detail order → tombol "Cetak Surat Jalan".
- POST `/dispatch/orders/:id/documents/SURAT_JALAN` → server generate PDF.
- Server-side (misal `puppeteer` render HTML template ke PDF):
  - Header: logo pabrik, alamat pabrik.
  - Nomor SJ: `SJ-MLG-20260810-001`.
  - Customer info.
  - Table: no · kode karton · produk · jumlah pack · berat estimasi.
  - Total di bawah tabel.
  - Ttd digital (kalau ada) atau spot ttd manual.
- PDF disimpan di storage (Vercel Blob / S3), URL di `dispatch_document.pdfUrl`.
- Response: URL untuk download / preview.

#### Step 5: Print & Ttd
- Staff download PDF, print 2 rangkap.
- Ttd manual oleh driver + ekspedisi (kalau tidak ada ttd digital).

### 2.3. Konfirmasi Dispatch

#### Step 6: Dispatched
- Setelah truk berangkat, staff kembali ke tablet.
- Buka detail order → tombol "Konfirmasi Dispatch".
- Modal konfirmasi: "Yakin truk N 1234 XY dengan 12 karton sudah berangkat?".
- POST `/dispatch/orders/:id/dispatch`:
  - Order status → `DISPATCHED`.
  - Semua karton di items → status `DISPATCHED`.
  - Audit log lengkap.

### 2.4. Lihat Riwayat

Halaman "Riwayat Dispatch":
- Filter by tanggal, status, customer, driver.
- Bisa export CSV bulanan untuk laporan.

---

## 3. State Machine — DispatchOrder

```
       ┌──────────────┐
       │    DRAFT     │───── ubah karton/customer OK ────┐
       └──────┬───────┘                                   │
              │                                           │
              │ dispatch (semua karton status jadi DISPATCHED)
              ▼                                           │
       ┌──────────────┐                                   │
       │  DISPATCHED  │───── (Fase future: track delivery)│
       └──────┬───────┘                                   │
              │                                           │
              ▼                                           │
       ┌──────────────┐                                   │
       │  DELIVERED   │  (Fase future — customer confirm) │
       └──────────────┘                                   │
```

**Aturan transisi**:
- `DRAFT → DISPATCHED` (via `POST /dispatch/orders/:id/dispatch`) — karton auto-update.
- `DRAFT` bisa di-cancel / edit karton.
- `DISPATCHED` tidak bisa di-cancel (audit compliance). Kalau salah → CORRECTION flow.
- `DELIVERED` — Fase future, butuh delivery confirmation.

---

## 4. Business Rules yang Di-Enforce

### 4.1. Order Creation
| Rule | Enforcement |
|---|---|
| Karton harus status `READY` (bukan OPEN atau DISPATCHED) | Service 400 |
| Karton hanya boleh di satu dispatch order (unique) | DB unique di `dispatch_item.cartonId` |
| Customer name & alamat wajib | zod |
| Minimum 1 karton per order | Service 400 |

### 4.2. Document Generation
| Rule | Enforcement |
|---|---|
| PDF template versioned per plant | Config file per plant |
| Nomor dokumen unique per plant per type per tahun | DB unique constraint + service |
| Setelah generate, PDF disimpan permanent (tidak boleh dihapus) | Storage policy |

### 4.3. Dispatch Confirmation
| Rule | Enforcement |
|---|---|
| Hanya user `EKSPEDISI` yang boleh dispatch | Permission |
| Semua karton auto-update status → DISPATCHED (transaction) | Service transaction |
| Audit log: siapa dispatch, kapan, kendaraan apa | Audit |

---

## 5. PDF Template — Surat Jalan (Contoh)

```
┌────────────────────────────────────────────────────────────────┐
│  [LOGO]        PT HUMMER INDONESIA                             │
│                Pabrik Malang 1                                 │
│                Jl. Industri No. 123, Malang                    │
├────────────────────────────────────────────────────────────────┤
│                     SURAT JALAN                                │
│                     Nomor: SJ-MLG-20260810-001                 │
│                     Tanggal: 10 Agustus 2026                   │
├────────────────────────────────────────────────────────────────┤
│  Kepada:                          Kendaraan:                   │
│  Distributor Jaya Abadi          N 1234 XY                     │
│  Jl. Merdeka 45, Surabaya        Driver: Pak Karto             │
│  081234567890                                                  │
├────────────────────────────────────────────────────────────────┤
│  No │ Kode Karton              │ Produk       │ Pack │ Batang  │
├─────┼──────────────────────────┼──────────────┼──────┼─────────┤
│  1  │ CTN-MLG-20260810-001     │ Hummer STD   │  48  │  960    │
│  2  │ CTN-MLG-20260810-002     │ Hummer STD   │  50  │ 1000    │
│  3  │ CTN-MLG-20260810-003     │ Hummer STD   │  50  │ 1000    │
├─────┴──────────────────────────┴──────────────┼──────┼─────────┤
│                                    TOTAL:     │ 148  │ 2960    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   Pengirim,                                Penerima,           │
│                                                                │
│   __________                              __________           │
│   (nama)                                  (nama & ttd)         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Template disimpan di `src/templates/dispatch/surat-jalan-{plantCode}.hbs` — bisa berbeda per plant.

---

## 6. UI/UX Guidelines Ekspedisi

- Order form: quick-fill customer dari histori (autocomplete).
- Karton picker: table dengan checkbox bulk-select.
- Preview PDF sebelum finalisasi (in-browser via `<iframe>` atau download).
- Notification untuk order DRAFT > 24 jam (mungkin lupa dispatch).

---

## 7. Testing Checklist

### 7.1. Unit Test
- [ ] Rules karton READY only.
- [ ] Karton unique per order.
- [ ] Nomor dokumen unique generation.

### 7.2. Integration Test
- [ ] Buat order + generate PDF → PDF valid, nomor unique.
- [ ] Dispatch → karton status batch update.
- [ ] Karton status OPEN atau DISPATCHED tidak boleh masuk order.
- [ ] Multi-plant: dispatch plant A tidak visible di plant B (RLS).

### 7.3. E2E Test
- [ ] Full: pilih 5 karton READY → buat order → generate PDF → download → dispatch → cek karton status.

### 7.4. Manual Acceptance
- [ ] Staff ekspedisi bisa buat 5 order + generate 5 PDF dalam < 30 menit.
- [ ] PDF layout profesional, printable A4.
- [ ] Data karton di PDF match dengan database.

---

## 8. Referensi
- [`04-data-model.md`](./04-data-model.md) §7C
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.5, §4.1
- [`06-api-spec.md`](./06-api-spec.md) §4C
- [`11-wms-outbound-spec.md`](./11-wms-outbound-spec.md) — sumber karton READY
