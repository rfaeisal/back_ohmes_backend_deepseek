# 10 · Spesifikasi Teknis WMS Inbound (Fase 1)

Dokumen operasional untuk **modul WMS Inbound** yang dibundel di Fase 1 bersama MES Produksi. Berisi user journey Staff Gudang Inbound, business rules FIFO, state machine inventory, kalkulasi, dan testing checklist.

**Ditujukan**: developer/QA Fase 1 (backend & tablet UI Gudang Inbound).
**Related**: [`04-data-model.md`](./04-data-model.md) §7A, [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.3 + §4.1, [`06-api-spec.md`](./06-api-spec.md) §4A, [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) §1.0.

---

## 1. Konteks Bisnis

**Alur real world**:
1. Truk supplier datang jam 05:00-07:00 di dock pabrik.
2. Bongkar boks TSG (biasanya 40-100 boks per truk, ~30 kg per boks).
3. Staff gudang timbang boks & catat manual di kertas (SEKARANG) atau tablet (SETELAH IMPLEMENT).
4. Boks disimpan di rak/palet gudang bahan baku.
5. Saat produksi request TSG, staff gudang alokasikan boks (FIFO — tertua dulu supaya TSG tidak menumpuk terlalu lama, karena TSG sensitif terhadap kelembaban).

**Masalah yang dihindari**:
- Boks "hantu" — operator open boks yang tidak tercatat di gudang → tidak accountable.
- TSG lama tidak terpakai — kualitas turun, waste tinggi.
- Data receiving tidak match produksi — audit cukai bermasalah.

---

## 2. User Journey — Staff Gudang Inbound

### 2.1. Terima Pengiriman TSG (05:00-07:00)

#### Step 1: Login & Setup
- Tablet di dock, login.
- Halaman utama Gudang Inbound: card "Terima TSG Baru" + card "Inventory" + card "Riwayat Receiving".

#### Step 2: Buat Receiving Header
- Tap "Terima TSG Baru" → modal:
  - Dropdown "Supplier" (dari master `tsg_supplier`).
  - Input "No Surat Jalan Supplier" (opsional, untuk match physical dokumen).
  - Input "Tanggal Terima" default now(), bisa di-override untuk backdated 1 hari max.

#### Step 3: Input per Boks (bulk)
Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Terima TSG dari SUP-JAWA-01 · SJ-SUP-2026-081 · 2026-08-10  │
├─────────────────────────────────────────────────────────────┤
│ No │ Kode Boks             │ Berat (kg) │              [X]  │
├────┼───────────────────────┼────────────┤                    │
│  1 │ TSG-20260810-001      │ [ 29.75 ]  │              [X]  │
│  2 │ TSG-20260810-002      │ [ 29.80 ]  │              [X]  │
│  3 │ TSG-20260810-003      │ [ 30.10 ]  │              [X]  │
│... │ ...                   │ ...        │                    │
├────┴───────────────────────┴────────────┴────────────────────┤
│ [+ Tambah Boks]              Total: 3 boks · 89.65 kg        │
├──────────────────────────────────────────────────────────────┤
│                                        [BATAL]  [SIMPAN]      │
└──────────────────────────────────────────────────────────────┘
```

- Field kode boks default auto-generate `TSG-YYYYMMDD-{seq}` (staff bisa override).
- Input berat via keyboard numeric.
- Total dihitung live (untuk kroscek dengan supplier bawaan).

#### Step 4: Simpan → Sistem Create
- Tap SIMPAN → POST `/tsg-receiving`.
- Server transaction:
  1. Validate total = sum(box weights) — kalau beda > 1% warn tapi lolos.
  2. Insert `TsgReceiving` header (auto-generate `receivingCode`).
  3. Bulk insert `TsgReceivingBox` (50 rows).
  4. Bulk insert `TsgInventory` (50 rows, status AVAILABLE, `createdAt` = `receivedAt`).
  5. Insert audit log entry per operasi.
- Response 201 → toast sukses: "Terima 50 boks · Total 1,485.75 kg · Kode: RCV-MLG-20260810-01".

#### Step 5: (Optional) Cetak Label
- Modal opsi: "Cetak label per boks" (untuk ditempel di boks fisik).
- Fase 1: label kode + berat + tanggal (Bluetooth printer).
- Fase 3: label QR (auto-parseable oleh Flutter operator kecer).

### 2.2. Lihat Inventory (Setiap Saat)

Halaman "Inventory TSG":
- Default filter: status AVAILABLE.
- Sort by `createdAt ASC` (tertua di atas).
- Kolom: Kode Boks · Berat · Umur (hari) · Lokasi Rak · Aksi.
- Bulk action: "Alokasikan ke shift" (pilih shift RUNNING) atau "Tandai Write-off".

### 2.3. Alokasi ke Shift (Fase 1 opsional; Fase 3 auto lewat scan)

**Fase 1 (tanpa QR)**:
- Operator kecer di tablet menekan "BUKA BOKS BARU" → sistem tampilkan FIFO list dari inventory.
- Operator pilih boks (default tertua) → POST `/shifts/:id/boxes` dengan `inventoryBoxId`.
- Sistem auto-update `tsg_inventory.status = 'USED'`.
- Alternatif: staff gudang bisa proactive pilih boks + assign ke shift RUNNING lewat `POST /tsg-inventory/:id/allocate` — status → ALLOCATED (menunggu operator open).

**Fase 3 (dengan QR)**:
- Operator scan QR boks di feeder → server resolve → auto-fill `POST /shifts/:id/boxes`.
- Alokasi manual dari gudang bisa dipertahankan sebagai backup.

### 2.4. Write-off Boks Rusak

- Halaman Inventory → filter atau pilih boks → tombol "Write-off".
- Modal minta:
  - Reason (dropdown: "Basah", "Rusak", "Hilang", "Kualitas tidak lolos", "Lain").
  - Textarea detail.
- Tap konfirmasi → PATCH `/tsg-inventory/:id/writeoff` → status `WRITTEN_OFF`, audit log record alasan + user.

---

## 3. State Machine — TsgInventory

```
       ┌──────────────┐
       │  AVAILABLE   │───── (staff proactive allocate) ──┐
       └──────┬───────┘                                    │
              │                                            ▼
              │   (operator open boks)          ┌──────────────┐
              │                                 │  ALLOCATED   │
              │                                 └──────┬───────┘
              ▼                                        │
       ┌──────────────┐                                │  (operator open boks)
       │    USED      │◀───────────────────────────────┘
       └──────────────┘
              ▲
              │
       ┌──────┴───────┐
       │ WRITTEN_OFF  │   (dari AVAILABLE — rusak/hilang)
       └──────────────┘
```

**Aturan transisi**:
- `AVAILABLE → USED` (via `POST /shifts/:id/boxes` dengan `inventoryBoxId`) — auto oleh operator.
- `AVAILABLE → ALLOCATED` (via `POST /tsg-inventory/:id/allocate`) — proactive staff.
- `ALLOCATED → USED` — operator open boks yang sudah ter-allocate.
- `AVAILABLE → WRITTEN_OFF` (via `PATCH /tsg-inventory/:id/writeoff`) — reason wajib.
- **Tidak ada rollback** dari USED atau WRITTEN_OFF (kalau salah → CORRECTION flow).

---

## 4. Business Rules yang Di-Enforce

### 4.1. Receiving
| Rule | Enforcement |
|---|---|
| `boxCode` global unique (bukan hanya per plant) | DB unique |
| Berat > 0 dan < 100 kg (sanity check) | zod |
| Total header = sum(boxes) ± 1% | Service warning, tetap lolos |
| Backdated max 24 jam | Service 400 kalau lebih |
| Supplier harus `isActive = true` | Service 400 |

### 4.2. Inventory FIFO
| Rule | Enforcement |
|---|---|
| Endpoint `/tsg-inventory/available` sort by `createdAt ASC` | Service query |
| Operator open boks non-tertua → butuh permission `tsg.inventory.allocate.override` | Service 403 |
| Override → audit log wajib `overrideReason` | Service + audit |
| Boks ALLOCATED > 24 jam tanpa USED → auto-release ke AVAILABLE | Cron job harian |

### 4.3. Write-off
| Rule | Enforcement |
|---|---|
| Hanya boks status AVAILABLE yang boleh write-off | Service 409 |
| `writeoffReason` wajib | zod |
| Setelah WRITTEN_OFF, tidak bisa direvive (harus receiving baru) | State machine |

### 4.4. Integrity Cross-Tabel
| Rule | Enforcement |
|---|---|
| `TsgReceivingBox` di-delete/soft-delete → cek tidak ada `TsgInventory.status = 'USED'` untuk boks itu | Service 409 |
| `TsgBoxProcess.inventoryBoxId` NOT NULL kecuali `isPartial = true` (handoff) | DB check constraint + service |

---

## 5. Kalkulasi & Metric

### 5.1. Inventory Age
```
ageInDays = FLOOR(EXTRACT(EPOCH FROM (now() - createdAt)) / 86400)
```
Threshold peringatan:
- 0-14 hari: normal (hijau)
- 15-30 hari: caution (kuning) — sarankan pakai duluan
- 30+ hari: alert (merah) — quality risk, mungkin harus write-off

### 5.2. Inventory Turnover per Plant
```
turnoverPerDay = COUNT(TsgInventory WHERE status = 'USED' AND usedAt >= today) / days
```
Berguna untuk forecast: kalau turnover 40 boks/hari dan inventory AVAILABLE 200 boks, cukup untuk 5 hari.

### 5.3. Reconciliation Report
Per hari, per plant:
```
opening_inventory = COUNT AVAILABLE at start of day
+ received_today  = COUNT new TsgReceivingBox today
- used_today      = COUNT USED today
- writtenoff      = COUNT WRITTEN_OFF today
= closing_inventory (harus match COUNT AVAILABLE at end of day)
```

---

## 6. UI/UX Guidelines Gudang Inbound

- Halaman receiving harus **cepat bulk input** — target < 15 detik per boks di keyboard numeric.
- Autofocus ke field berikutnya setelah enter berat.
- Barcode scanner (fisik USB) di dock — kalau supplier bawa label sendiri, scan langsung fill `boxCode`.
- FIFO list: highlight boks tertua dengan badge kuning; warning merah kalau >30 hari.

---

## 7. Testing Checklist

### 7.1. Unit Test
- [ ] Kalkulasi total receiving = sum boxes.
- [ ] Age calculation dari `createdAt`.
- [ ] State machine transitions valid.

### 7.2. Integration Test
- [ ] POST /tsg-receiving 50 boks → 50 inventory rows dibuat.
- [ ] POST /shifts/:id/boxes dengan `inventoryBoxId` AVAILABLE → sukses, status berubah USED.
- [ ] POST /shifts/:id/boxes dengan boks USED → 400.
- [ ] POST /shifts/:id/boxes tanpa `inventoryBoxId` untuk boks non-partial → 400.
- [ ] Override FIFO → permission required.
- [ ] Write-off dari status USED → 409.
- [ ] Reconciliation report satu hari → balanced.

### 7.3. E2E Test (browser automation)
- [ ] Staff gudang login → terima 20 boks → operator kecer bisa pick boks → sistem update inventory.
- [ ] Multi-plant: staff plant A tidak lihat inventory plant B (RLS).

### 7.4. Manual Acceptance
- [ ] Staff gudang bisa input 50 boks dalam ~10 menit.
- [ ] Operator kecer bisa lihat FIFO list intuitive.
- [ ] Reconciliation report harian match physical count.

---

## 8. Migration Path

**Untuk pabrik pilot yang sudah operasional dengan manual paper**:
1. Cutover date ditentukan.
2. Sehari sebelum cutover: staff gudang input **semua inventory existing** sebagai receiving retro (backdated) supaya tidak ada boks lolos tracking.
3. Cutover: mulai receive TSG baru lewat sistem. Operator wajib `inventoryBoxId` untuk open boks — training operator sebelumnya.
4. Runtime error yang wajar minggu pertama: boks fisik ada tapi tidak di sistem → staff catat retro dengan reason "backfill migration".

---

## 9. Referensi
- [`04-data-model.md`](./04-data-model.md) §7A — skema tabel.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.3, §4.1 — permission.
- [`06-api-spec.md`](./06-api-spec.md) §4A — endpoint.
- [`09-fase-1-pilot-spec.md`](./09-fase-1-pilot-spec.md) — spec keseluruhan Fase 1.
