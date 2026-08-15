# 11 · Panduan Migrasi — Surat Jalan Supplier v1.1 (BREAKING)

**Tanggal**: 2026-08-15
**Target**: Tim mobile (Flutter) — fitur Surat Jalan Supplier
**Referensi**: [10-supplier-sj-app.md](./10-supplier-sj-app.md) v1.1.0 · CHANGELOG v1.3.0

---

## Ringkasan Perubahan Alur

1. Label **tidak lagi digenerate saat buat SJ**. Label sekarang dicetak petugas area di **area office via web app** (pool label 100×75mm direct thermal — QR + centang 3 jenis TSG), dibawa ke gudang supplier.
2. Alur di gudang supplier: buat SJ (tanpa label) → scan label = **assign ke SJ + pilih jenis + input berat (satu panggilan)** → semua boks tertimbang → SHIPPED.

---

## API Berubah (Breaking)

| Endpoint | v1.0 | v1.1 |
|---|---|---|
| `POST /supplier-sj` | body `{ sjNumber, supplierId, plantId, labels: [{tsgType, count}] }`, response berisi `labels` | field `labels` **DIHAPUS**. Response `{ sjId, sjNumber, status, poolAvailable }` |
| `POST /supplier-sj/:id/boxes/weigh` | `{ boxCode, supplierWeightKg }` | `{ boxCode, tsgType, supplierWeightKg }` — `tsgType` wajib saat label pertama di-assign; jika label sudah terikat SJ tapi belum ditimbang, cukup `boxCode` + berat |
| `GET /supplier-sj/labels/:boxCode` | field SJ selalu terisi | + `labelStatus` (AVAILABLE / ASSIGNED / VOID). Saat AVAILABLE: `sjId`, `sjNumber`, `sjStatus`, `tsgType`, `supplierName`, `plantCode` = `null` |

**Endpoint baru**: `POST /supplier-sj/labels/:boxCode/void` — tandai label hilang/rusak (hanya label AVAILABLE).

**Error baru**: `LABEL_ALREADY_ASSIGNED`, `LABEL_VOIDED`, `LABEL_NOT_AVAILABLE`, `SJ_EMPTY`.

---

## Penting di UI App

- **Centang di label kertas tidak terbaca sistem** — app wajib menampilkan pilihan jenis (REGULER/MILD/PUTIHAN) secara besar + konfirmasi saat scan. Jenis yang masuk sistem = yang dipilih di app, bukan centang kertas.
- Kode label sekarang format **`TSG-YYYYMMDD-NNN`** (bukan `SJL-`). QR berisi `boxCode` itu langsung.
- Satu SJ bisa **multi jenis TSG**. Validasi di pabrik saat ini hanya jumlah & identitas label — validasi per jenis & berat = tahap berikutnya (§7 dokumen 10).
- Tampilkan **`poolAvailable`** saat buat SJ supaya petugas tahu sisa label yang bisa dipakai.

---

## Status Backend

v1.1 sudah diimplementasikan (pool label, assign, VOID, RLS aktif). Jadwal testing E2E menunggu deploy staging — PM yang umumkan.

**Kredensial tes**: `petugassj` / `12345678` (petugas area), `gudangin` / `12345678` (gudang inbound).

---

## Kontak

Kalau ada yang ambigu, tanya via thread diskusi tim / ke PM.
