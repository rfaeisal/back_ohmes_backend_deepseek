# 11 · Spesifikasi Teknis WMS Outbound (Fase 5)

Dokumen operasional untuk **modul WMS Outbound** — dieksekusi di Fase 5, setelah Fase 1-4 stabil. Berisi user journey Staff Gudang Outbound, business rules cartoning, state machine karton, traceability, dan testing checklist.

**Ditujukan**: developer/QA Fase 5 (backend & tablet UI Gudang Outbound).
**Related**: [`04-data-model.md`](./04-data-model.md) §7B, [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.4 + §4.1, [`06-api-spec.md`](./06-api-spec.md) §4B, [`08-roadmap.md`](./08-roadmap.md) Fase 5.

---

## 1. Konteks Bisnis

**Alur real world**:
1. HLP produksi pack (default 20 batang per pack).
2. Pack dikumpulkan di area output HLP (setelah shift).
3. Staff gudang outbound terima → hitung → konfirmasi.
4. Pack dibundle jadi karton (biasanya 40-50 pack per karton, satu produk sama).
5. Karton tersimpan di gudang jadi menunggu dispatch.

**Masalah yang dihindari**:
- Discrepancy count HLP vs gudang jadi tidak ter-follow-up.
- Pack tercampur produk berbeda dalam satu karton (isu QA).
- Traceability recall tidak bisa: kalau ada isu QA di lapangan, tidak bisa trace balik pack asalnya dari mana.

---

## 2. User Journey — Staff Gudang Outbound

### 2.1. Auto-Receiving dari HLP (setelah shift APPROVED)

**Pemicu**: shift status → `APPROVED`. Trigger otomatis:
1. Sistem hitung `sum(hlp_pack.packsLolos)` untuk shift itu.
2. Insert `FinishedGoodsReceiving` dengan `packsExpectedCount = sum`, `status = 'PENDING'`.
3. Notif ke tablet Gudang Outbound: "Shift shf_xxx menunggu confirmation (820 pack expected)".

### 2.2. Confirm Receiving

#### Step 1: Buka Task
- Tablet Gudang Outbound: card "Menunggu Confirmation (3)".
- Tap card → list shift APPROVED yang PENDING.

#### Step 2: Physical Count
- Staff pergi ke area output HLP, hitung pack fisik.
- Kembali ke tablet: input `packsActualCount`.

#### Step 3: Confirm atau Dispute
- Kalau `actual == expected` → tap "CONFIRM" → POST `/finished-goods/:shiftId/confirm` → status CONFIRMED.
- Kalau `actual < expected` (kurang) → modal minta dispute notes → POST `/finished-goods/:shiftId/dispute`.
  - Sistem create pending task ke Supervisor Pabrik untuk verify + optional CORRECTION shift.
  - Karton nanti bisa dibuat dari `packsActualCount`, bukan expected.
- Kalau `actual > expected` (lebih) — jarang, warn tapi bisa lanjut. Semua tercatat.

### 2.3. Cartoning

#### Step 1: Buka Karton Baru
- Halaman "Cartoning" → tombol "+ Buka Karton Baru".
- Modal:
  - Dropdown Produk (mis. Hummer STD) — semua pack dalam karton harus produk sama.
  - Input Kapasitas (default 50 pack).
- Tap "Buka" → POST `/cartons` → status OPEN.
- Karton dapat kode auto `CTN-{plant}-{YYYYMMDD}-{seq}`.

#### Step 2: Tambah Pack ke Karton
- Kalau ada pack scanner (barcode/QR Fase 3): scan → POST `/cartons/:id/add-pack`.
- Kalau tidak: pilih dari list pack yang belum ter-carton (`hlp_pack WHERE NOT IN cartonContent`) — bulk-select.
- Sistem validasi: pack produk sama dengan karton; unique per karton.
- Live counter: "23/50 pack".

#### Step 3: Tutup Karton
- Saat karton penuh (atau tim outbound decide "cukup"): tap "Tutup Karton".
- Konfirmasi: `actualPackCount > 0`.
- POST `/cartons/:id/close` → status READY.
- Cetak label karton (kode + jumlah pack + tanggal + produk).

### 2.4. Traceability (QA / Auditor)

Halaman "Cari Karton":
- Input kode karton (manual) atau scan.
- GET `/cartons/:code/lineage` → tampilkan tree:
  ```
  Karton CTN-MLG-20260810-001 (48 pack, Hummer STD)
  │
  ├── Pack pack_shf_2b9f1a_042  ← Batch btc_MKR01_20260810_03 ← Shift shf_2b9f1a (2026-08-10 · Malam · Alfi)
  ├── Pack pack_shf_2b9f1a_043  ← Batch btc_MKR01_20260810_03 ← Shift shf_2b9f1a
  ├── Pack pack_shf_2c8e2b_001  ← Batch btc_MKR02_20260811_01 ← Shift shf_2c8e2b (2026-08-11 · Siang · Bambang)
  └── ...
  ```
- Berguna untuk recall investigation: kalau customer report isu di karton → langsung tahu shift/operator/mesin sumber.

---

## 3. State Machine — Carton

```
       ┌──────────────┐
       │    OPEN      │───── add pack (multi-batch OK) ────┐
       └──────┬───────┘                                     │
              │                                             │
              │ close (actualPackCount > 0)                 │
              ▼                                             │
       ┌──────────────┐                                     │
       │    READY     │───── dispatched via /dispatch ─────▶│
       └──────┬───────┘                                     │
              │                                             │
              ▼                                             ▼
       ┌──────────────┐                            (loop continues
       │  DISPATCHED  │                             until karton
       └──────────────┘                             ditutup)
```

**Aturan transisi**:
- `OPEN → READY` (via `POST /cartons/:id/close`) — butuh actualPackCount > 0.
- `READY → DISPATCHED` — otomatis saat karton masuk ke `dispatch_item` dan order dispatched.
- **Tidak ada reverse** — kalau salah (mis. tutup karton dengan pack salah), buat karton baru + audit note.

---

## 4. Business Rules yang Di-Enforce

### 4.1. FinishedGoodsReceiving
| Rule | Enforcement |
|---|---|
| `finished_goods_receiving.status = 'PENDING'` unique per shift | DB unique (satu shift satu record) |
| Confirm harus dari user role `GUDANG_OUTBOUND` di plant sama | RLS + permission |
| Dispute → trigger notif ke supervisor + optional CORRECTION | Service transaction |

### 4.2. Cartoning
| Rule | Enforcement |
|---|---|
| Pack dalam satu karton harus produk sama | Service 400 |
| Pack tidak boleh di 2 karton (unique `hlpPackId` di `cartonContent`) | DB unique |
| Karton hanya bisa tambah pack saat status OPEN | Service 409 |
| Karton hanya bisa ditutup saat `actualPackCount > 0` | Service 400 |
| Setelah READY, tidak bisa tambah/hapus pack | RLS + service |

### 4.3. Traceability
| Rule | Enforcement |
|---|---|
| Lineage query harus balik dalam < 2 detik untuk karton 50 pack | Index optimasi |
| Semua akses lineage log ke audit (untuk compliance) | Service audit |

---

## 5. Kalkulasi & Metric

### 5.1. Cartoning Efficiency
```
efficiency = actualPackCount / capacityPack
```
Target > 90% (karton tidak dibuat setengah-setengah).

### 5.2. Discrepancy Rate
Per bulan, per plant:
```
discrepancy_rate = COUNT(finished_goods_receiving WHERE status = 'DISPUTED') / COUNT(all APPROVED shifts)
```
Threshold: > 2% → red flag → investigasi HLP counter accuracy.

### 5.3. Traceability Coverage
```
% pack terlacak = COUNT(hlp_pack WHERE id IN carton_content) / COUNT(all hlp_pack)
```
Target 100% — semua pack HLP end up di suatu karton dalam < 7 hari.

---

## 6. UI/UX Guidelines Gudang Outbound

- Layar "Menunggu Confirmation" prominent — badge merah kalau > 24 jam.
- Cartoning: hitung live pack count dengan animasi (tap → +1).
- Traceability: hasil display seperti tree — mudah baca lineage.
- Print label karton via Bluetooth printer.

---

## 7. Testing Checklist

### 7.1. Unit Test
- [ ] Auto-create `finished_goods_receiving` saat shift APPROVED.
- [ ] Product mismatch validation di add-pack.
- [ ] Discrepancy calculation.

### 7.2. Integration Test
- [ ] Shift APPROVED → `finished_goods_receiving` auto-created.
- [ ] Confirm dengan match count → status CONFIRMED.
- [ ] Dispute → task ke supervisor + CORRECTION path.
- [ ] Tambah pack produk lain → 400.
- [ ] Close karton kosong → 400.
- [ ] Traceability lineage 50 pack → return < 2 detik.

### 7.3. E2E Test
- [ ] Full flow: shift APPROVED → receiving confirm → cartoning 3 karton → traceability check.

### 7.4. Manual Acceptance
- [ ] Gudang outbound bisa confirm 5 shift dan cartoning 3 karton per hari tanpa error.
- [ ] Discrepancy dispute flow terpakai kalau ada beda count.

---

## 8. Referensi
- [`04-data-model.md`](./04-data-model.md) §7B
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.4, §4.1
- [`06-api-spec.md`](./06-api-spec.md) §4B
- [`12-dispatch-spec.md`](./12-dispatch-spec.md) — karton READY masuk sini
