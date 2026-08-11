# 09 · Spesifikasi Teknis Fase 1 — Pilot 1 Pabrik (MES + WMS Inbound)

Dokumen operasional untuk **implementasi Fase 1 (pilot 1 pabrik)**. Ditujukan langsung ke tim developer & QA yang akan mengeksekusi sprint. Berisi user journey lengkap (produksi + WMS Inbound), business rules yang di-enforce, state machine, kalkulasi, dan testing checklist.

**Scope Fase 1**: MES Produksi (Maker + HLP + shift) + WMS Inbound (receiving TSG + inventory FIFO). WMS Outbound & Distribusi masuk Fase 5-6 — lihat [`10-wms-inbound-spec.md`](./10-wms-inbound-spec.md), [`11-wms-outbound-spec.md`](./11-wms-outbound-spec.md), [`12-dispatch-spec.md`](./12-dispatch-spec.md).

**Pilot recommendation**: `PLT-MLG-01` (Pabrik Malang 1) — 2 Maker (MKR-01, MKR-02) + 1 HLP (HLP-01). Produk pilot: `PRD-HMR-STD` (Hummer STD). Supplier pilot: `SUP-JAWA-01`.

---

## 1. User Journey per Role

### 1.0. Journey Staff Gudang Inbound — Terima Supply TSG (Fase 1 baru)

**Konteks**: Pagi jam 05:00, truk supplier datang dengan 50 boks TSG. Staff gudang perlu catat receiving lengkap dalam ~15 menit supaya operator shift pagi bisa mulai produksi tanpa delay.

#### Step 1: Login & pilih supplier
- Staff buka tablet di dock, login.
- Halaman utama: card "Terima TSG Baru" + card "Inventory TSG".
- Tap "Terima TSG Baru" → modal:
  - Dropdown "Supplier" (dari master, mis. SUP-JAWA-01).
  - Input "No Surat Jalan Supplier" (opsional).

#### Step 2: Input per boks
- Modal berlanjut ke halaman list boks:
  - Baris tabel: `No Boks | Kode | Berat (kg)` — auto-increment no.
  - Field bisa diisi cepat via keyboard numeric.
  - Tombol "+ Tambah Boks" untuk row baru.
  - Kode boks default generated `TSG-YYYYMMDD-{seq}` — bisa di-override kalau supplier bawa label sendiri.
- Setelah semua boks diinput (misal 50 boks) → tap "Simpan".

#### Step 3: Sistem create receiving + inventory
- POST `/tsg-receiving` → server buat:
  - 1 record `TsgReceiving` (header).
  - 50 record `TsgReceivingBox`.
  - 50 record `TsgInventory` status `AVAILABLE`, `createdAt = receivedAt`.
- Response modal: "Berhasil terima 50 boks (total 1,485.75 kg)".
- Optional: cetak label QR (Fase 3) — untuk sekarang, cetak label kode manual dari sistem.

#### Step 4: Cek inventory
- Kembali ke halaman "Inventory TSG":
  - List boks AVAILABLE sorted by age (tertua di atas).
  - Filter by status (AVAILABLE / ALLOCATED / USED / WRITTEN_OFF).
- Kalau operator kecer nanti request via tablet → sistem otomatis pick boks tertua.

### 1.1. Journey Operator Kecer — Satu Shift Malam

**Konteks**: Shift Malam 16:30 → 05:30 (13 jam), tim 4 orang, mesin MKR-01, produk Hummer STD.

#### Step 1: Login (16:20)
- Buka tablet, buka Chrome bookmark `mes.hummer.example`.
- Login dengan username + password.
- Halaman utama: card 3 mesin di pabrik + status masing-masing.

#### Step 2: Start Shift (16:30)
- Tap card MKR-01 → tombol "Mulai Shift".
- Modal:
  - Dropdown "Template Shift" — default "Shift Malam".
  - Dropdown "Produk" — default "Hummer STD" (dari `plant_product` yang aktif).
  - Section "Anggota Tim":
    - Search picker user pabrik → tap add.
    - Setiap anggota diassign `ShiftRole` (Ketua Kecer / Operator / Pembantu).
- Tap "Mulai Shift" → POST `/shifts/start`.
- Kalau ada handoff: banner kuning muncul "Boks 1 akan partial: carry-over 7.20 kg TSG + 6.10 kg batangan sementara dari shift sebelumnya".

#### Step 3: Halaman Shift Aktif (16:35+)
Layout:
```
┌───────────────────────────────────────────────────────────────┐
│  SHIFT MALAM · MKR-01 · Hummer STD                            │
│  Mulai 16:30 · Sudah berjalan 5 menit                         │
│  Tim: Alfi (Ketua), Ahmadi, Didik, Zaini                      │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  BOKS AKTIF                                             │  │
│  │  Boks #1 · TSG 7.90 kg (PARTIAL)                        │  │
│  │  Dibuka: 16:35 · Sudah 32 menit                         │  │
│  │  ┌──────────────────────────────────────────────┐       │  │
│  │  │   BOKS SELESAI · TIMBANG HASIL BATANGAN     │       │  │
│  │  └──────────────────────────────────────────────┘       │  │
│  │  [+ Tambah Pemakaian]  [+ Log Downtime]  [+ Log Mtnc]   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  Ringkasan hari ini:                                          │
│  · Boks selesai: 0     · Yield rata2: —                       │
│  · Downtime: 0 mnt     · Consumables: 0 event                 │
│                                                                │
│  [BUKA BOKS BARU]  [AKHIRI SHIFT]                             │
└───────────────────────────────────────────────────────────────┘
```

**Interaksi utama**:
- **"BOKS SELESAI"** = tombol paling dominan (H1 size, warna aksen).
- **"BUKA BOKS BARU"** = disabled kalau ada boks aktif belum ditutup.
- **"AKHIRI SHIFT"** = disabled kalau ada boks aktif; server juga tolak.

#### Step 4: Boks Selesai — Timbang (contoh: 17:12)
- Tap tombol besar → modal:
  - Input "Berat Batangan (kg)": angka desimal, keyboard numeric.
  - Preview kalkulasi live: `(input / 7.90) × 100 = xxx.xx %`.
  - Indicator warna:
    - Hijau (110-114%) — dalam range.
    - Merah — di luar range; muncul dropdown `RejectReason`.
- Tap "Timbang" → PATCH `/boxes/:id` → server hitung final yield.
- Modal sukses: "Boks #1 selesai. Yield 110.86% (NORMAL)". Tap OK → kembali ke halaman shift.
- Boks aktif berubah: card kosong, tombol "BUKA BOKS BARU" enabled.

#### Step 5: Buka Boks Baru (17:15)
- Tap "BUKA BOKS BARU" → modal menampilkan **list boks AVAILABLE FIFO dari inventory**:
  - Boks tertua di atas (highlight kuning) — sistem sarankan pilih ini.
  - Info per boks: kode, berat, umur (hari), lokasi rak.
  - Tombol "Pilih" per baris.
- Kalau pilih boks non-tertua → modal konfirmasi minta alasan (audit log). Cuma role yang punya `tsg.inventory.allocate.override` yang boleh (mis. Ketua Kecer).
- Tap "Pilih" → POST `/shifts/:id/boxes` dengan `inventoryBoxId`.
- Sistem:
  - Cek inventory status AVAILABLE (kalau tidak → 400 dengan pesan).
  - Auto-fill `boxCode` + `tsgWeightKg` dari inventory.
  - Update `tsg_inventory.status = 'USED'`.
- Boks baru muncul di card "BOKS AKTIF".
- **Fase 3**: modal ini di-replace dengan tombol "SCAN QR BOKS" → operator arahkan kamera ke label boks → `POST /qr/resolve` → `POST /shifts/:id/boxes` seamless.

#### Step 6: Tambah Pemakaian (18:00 — ganti bobin)
- Tap "+ Tambah Pemakaian" → modal:
  - Dropdown "Item": Bobin Hummer / Filter Hummer / Tipping / dst.
  - Input "Quantity".
  - Textarea "Catatan" (opsional).
- Tap "Simpan" → POST `/boxes/:id/consumption`.
- Muncul badge di boks aktif: "1 event".

#### Step 7: Log Downtime (18:08 — ganti bobin butuh 8 menit)
- Tap "+ Log Downtime" → modal:
  - Dropdown "Kategori": GANTI_MATERIAL / KENDALA_MESIN / TUNGGU_BAHAN / ISTIRAHAT_IZIN / MAINTENANCE.
  - Input "Durasi (menit)".
  - Textarea "Deskripsi".
- Tap "Simpan" → POST `/shifts/:id/downtime`.

#### Step 8: Ulangi Boks Berikutnya (18:15 - 05:00)
26 boks sepanjang shift. Rata-rata 30 menit per boks. Log event opsional.

#### Step 9: Akhiri Shift (05:00)
- Tap "AKHIRI SHIFT".
- Kalau masih ada boks aktif → modal handoff wajib (Step 10). Kalau tidak → modal end shift langsung.

#### Step 10: Handoff (kalau boks aktif belum habis)
Modal:
```
BOKS AKTIF #27 BELUM HABIS
Perlu timbang sisa untuk shift berikutnya.

Sisa TSG di feeder (kg):        [ 15.95 ]
Batangan sementara (kg):        [ 14.20 ]
Catatan:                        [ Boks 27 sisa sekitar 50%    ]

[Timbang & Lanjut]
```
- Tap "Timbang & Lanjut" → POST `/shifts/:id/handoff`.
- Modal end shift muncul.

#### Step 11: Input Waste + Izin Tim (05:15)
Modal Akhiri Shift:
```
AKHIRI SHIFT

Waste 4 Kategori (kg):
┌────────────────────────────────────────────┐
│ MENIR      [  0.85 ]  [○ PENDING  ● LUNAS] │
│ RIJEKAN    [ 10.30 ]  [○ PENDING  ● LUNAS] │
│ DEBU KASAR [ 10.80 ]  [● PENDING  ○ LUNAS] │
│ DEBU HALUS [ 36.55 ]  [● PENDING  ○ LUNAS] │
└────────────────────────────────────────────┘

Izin Tim (opsional):
┌────────────────────────────────────────────┐
│ Ahmadi   [ 60 mnt ] "Izin pengajian ..."   │
└────────────────────────────────────────────┘

Catatan Shift:
[ Debu halus naik 12% dari rerata harian ]

[Akhiri Shift]
```
- Tap "Akhiri Shift" → POST `/shifts/:id/end`.
- Response 200 → halaman utama, status shift "COMPLETED — menunggu approval".

#### Step 12: Pergi (05:30)
- Operator logout atau biarkan session aktif (auto-expire 15 menit access token).

### 1.2. Journey Supervisor Pabrik

#### Step 1: Login (07:00 hari berikutnya)
- Buka dashboard di laptop.
- Halaman utama: card "3 shift menunggu approval".

#### Step 2: Review Shift
- Tap card shift MALAM MKR-01.
- Detail lengkap ditampilkan (tabel boks, downtime, waste, tim).
- Section "Handoff": `sisaTsgKg: 15.95 · batanganSementaraKg: 14.20`.
- Yield shift: 111.24% (dalam range).

#### Step 3: Approve
- Textarea "Review notes": "OK, debu halus perlu ditindaklanjuti".
- Tap "Approve" → POST `/shifts/:id/approve`.
- Status → APPROVED (LOCKED). Data ter-refresh ke dashboard area.

#### Step 4 (Alternatif): Reopen
- Kalau ada koreksi kecil → tap "Reopen" → shift kembali RUNNING → operator koreksi → end shift lagi → supervisor approve ulang.

---

## 2. State Machine — ShiftReport

```
                             ┌──────────────┐
                    ┌────────│   RUNNING    │──── shift.end ─────┐
                    │        └──────────────┘                    │
                    │              ▲                             │
                    │              │ reopen                      │
                    │              │ (supervisor)                │
                    │              │                             ▼
                    │        ┌──────────────┐                ┌──────────────┐
                    │        │  COMPLETED   │── shift.approve │  APPROVED    │
                    │        └──────────────┘   (supervisor)  │  (LOCKED)    │
                    │                                          └──────────────┘
                    │                                                │
                    │                                                │ shift.correct
                    │                                                │ (HQ_AUDITOR)
                    │                                                ▼
                    │                                          ┌──────────────┐
                    │                                          │  CORRECTION  │
                    │                                          │   (baru,     │
                    │                                          │   audited)   │
                    │                                          └──────────────┘
                    │
                (soft delete jarang; hanya kalau salah start
                 dengan alasan tertulis)
```

**Aturan transisi**:
- `RUNNING → COMPLETED`: butuh `shift.end`. Server enforce: 4 kategori waste ada, tidak ada boks aktif tanpa handoff.
- `COMPLETED → RUNNING`: butuh `shift.reopen`. Supervisor atau HQ_ADMIN.
- `COMPLETED → APPROVED`: butuh `shift.approve`. Actor **tidak boleh** = `createdBy`.
- `APPROVED → *`: **tidak ada transisi**. Perubahan via `shift.correct` yang buat record baru (`shift_correction`), shift asli tetap intact.

---

## 3. Business Rules yang Di-Enforce

### 3.1. Start Shift
| Rule | Enforcement |
|---|---|
| Mesin harus di plant yang user punya scope-nya | RLS + service layer |
| Produk harus di `plant_product` untuk plant tersebut | Service layer 400 |
| Minimal 1 anggota tim dengan role yang `canEndShift=true` | Service layer 400 |
| Tidak boleh ada shift `RUNNING` lain untuk mesin sama | Partial unique index + service 409 |
| Kalau ada `shift_handoff` unclaimed untuk mesin → auto-claim | Service layer transaction |

### 3.2. Boks TSG
| Rule | Enforcement |
|---|---|
| `boxNumber` auto-increment per shift (unique) | DB unique + service |
| Hanya 1 boks aktif per shift (belum `completedAt`) | Partial index + service 409 |
| `outputWeightKg` wajib > 0 | zod validation |
| `yieldPct` dihitung server, ambil dari `machine_template` current | Service layer |
| Kalau yield di luar range → wajib `RejectReason` | Service layer 400 |
| Boks pertama shift dengan handoff → `isPartial=true` + link `handoffId` | Auto di POST /boxes |
| **`inventoryBoxId` wajib** kecuali boks partial dari handoff | Service 400 `TSG_BOX_NOT_AVAILABLE` |
| **Boks dari inventory harus AVAILABLE** | Service 400 (check `tsg_inventory.status`) |
| **FIFO enforcement soft**: UI usulkan tertua, override butuh permission | Service check permission + audit |

### 3.3. Event Log
| Rule | Enforcement |
|---|---|
| `linkedBoxId` opsional, tapi kalau ada wajib punya `completedAt IS NULL` (aktif) | Service layer 400 |
| `loggedAt` server-generated (bukan client) | Ignore client value |
| Downtime `durationMinutes` > 0 dan < 12h | zod |

### 3.4. Handoff
| Rule | Enforcement |
|---|---|
| Handoff hanya bisa dibuat oleh shift status `RUNNING` (proses akhiri) | Service layer 409 |
| Hanya 1 handoff unclaimed per mesin | Partial unique index |
| `sisaTsgKg` + `batanganSementaraKg` > 0 | zod |
| Kalau tidak ada boks aktif → tolak handoff (400) | Service layer |

### 3.5. End Shift
| Rule | Enforcement |
|---|---|
| Waste 4 kategori lengkap | Service 400 |
| Tidak ada boks aktif tanpa handoff | Service 409 (`SHIFT_HAS_ACTIVE_BOX`) |
| `actualEnd` server-generated = now() | Ignore client value |
| Kalau shift punya `linkedHandoffId` (di-claim), batanganSementara masuk perhitungan yield shift **lama** — bukan shift ini | Kalkulasi report time |

### 3.6. Approve
| Rule | Enforcement |
|---|---|
| Actor ≠ `createdBy` | Service 409 |
| Shift status = `COMPLETED` | Service 409 |
| Setelah approve, `mv_area_daily_kpi` refresh (async job) | Trigger DB atau job queue |

### 3.7. Reopen
| Rule | Enforcement |
|---|---|
| Shift status = `COMPLETED` (bukan APPROVED) | Service 409 |
| Reason wajib di body | zod |

### 3.8. Correction
| Rule | Enforcement |
|---|---|
| Shift status = `APPROVED` | Service 409 |
| Actor role = `HQ_AUDITOR` di scope | RLS + permission |
| Reason wajib per field koreksi | zod |
| Correction TIDAK UPDATE shift asli | Insert ke `shift_correction` |

---

## 4. Kalkulasi

### 4.1. Yield Boks
```
yieldPct = (outputWeightKg / tsgWeightKg) × 100
```
Dibulatkan 2 desimal. Indicator:
- `NORMAL` — dalam `[yieldMinPct, yieldMaxPct]` dari MachineTemplate.
- `WARNING` — di luar range. Operator wajib pilih RejectReason.

### 4.2. Yield Shift (dengan handoff)
Sederhana (dominan case, no handoff atau shift baru):
```
yieldShift = (sum(box.outputWeightKg for boks completed) / sum(box.tsgWeightKg)) × 100
```

Dengan handoff, shift **lama**:
```
tsgTotalShiftLama       = sum(tsgWeightKg for boks di shift lama) + carry_out_handoff (tsg yg belum di-log)
batanganTotalShiftLama  = sum(outputWeightKg for boks completed di shift lama) + handoff.batanganSementaraKg
```
Note: TSG yang dituang ke feeder saat shift lama tapi tidak muncul di boks catatan lama, tercatat sebagai `handoff.sisaTsgKg` — dari perspektif shift lama, ini "TSG yang dikeluarkan tapi belum jadi batangan yang ditimbang". Shift lama tidak menghitung sisaTsgKg sebagai input yang diproses; hanya batanganSementaraKg yang dihitung sebagai output.

Shift **baru** (yang claim handoff):
- Boks 1 = partial. TSG kolom = `tsgWeightKg` (TSG BARU yang masuk feeder di shift baru).
- Server tahu boks 1 punya opening TSG dari `handoff.sisaTsgKg`. Yield boks 1 dihitung saat boks selesai:
  ```
  totalTsgInBoks1  = handoff.sisaTsgKg + boks1.tsgWeightKg
  yieldBoks1       = (boks1.outputWeightKg / totalTsgInBoks1) × 100
  ```
  (Batangan yang ditimbang di boks 1 = hasil dari sisa TSG lama + TSG baru, hanya sejak claim.)

### 4.3. Berat per Batang (HLP)
```
totalBatang     = packsLolos × isiPerPack + rejectBatangan
beratPerBatang  = (batanganKgBatch × 1000) / totalBatang
```
Per Maker (kalau HLP menerima batch dari 2 Maker):
- Batch bawa `machineId` (Maker asal).
- HLP pack bawa `batchId`.
- Agregat per Maker = sum(pack) group by `batch.machineId`.

### 4.4. Waste Total per Shift
```
wasteTotalKg = sum(shift_waste.kg)  // 4 kategori digabung
```
Persentase waste terhadap TSG:
```
wasteRatio = (wasteTotalKg / tsgTotalShift) × 100
```

---

## 5. UI/UX Guidelines Tablet

### 5.1. Ukuran & Interaksi
- Tablet target: 10" landscape, resolusi minimal 1200×800.
- Tombol utama ("Boks Selesai", "Akhiri Shift"): min tinggi 88px, font-size 24px.
- Input angka: keyboard numeric (`inputMode="decimal"`).
- Modal: full-screen di tablet, tidak floating (mudah tap dengan tangan kotor).

### 5.2. Warna Indicator
- Hijau `#2E7D32` — dalam range / OK.
- Kuning `#F57C00` — perhatian (mis. shift approaching escalation).
- Merah `#C62828` — di luar range / error.
- Netral abu `#616161` — status pending.

### 5.3. Feedback
- Setiap tap tombol utama → optimistic UI + spinner + haptic feedback (kalau device support).
- Sukses → toast 3 detik dengan ikon check.
- Error → modal dengan pesan Bahasa Indonesia + tombol "Tutup" / "Coba Lagi".

### 5.4. Auto-Save Draft
Form input (mis. waste 4 kategori) auto-save ke `localStorage` setiap perubahan → refresh page tidak kehilangan data.

---

## 6. Testing Checklist Fase 1

### 6.1. Unit Test
- [ ] Kalkulasi yield boks (input berbagai range).
- [ ] Kalkulasi berat per batang (input pack + reject).
- [ ] Waste 4 kategori enum & settlementStatus enum.
- [ ] Handoff formula: attribusi batangan ke shift lama/baru.
- [ ] Coverage service layer ≥ 80%.

### 6.2. Integration Test (API)
- [ ] Flow lengkap: start → box open → weigh → end → approve.
- [ ] Handoff flow: shift lama end dengan boks aktif → handoff created → shift baru start → auto-claim → boks 1 isPartial.
- [ ] Approve rejected kalau actor = createdBy.
- [ ] Approved shift tidak bisa di-UPDATE (RLS test).
- [ ] Multi-scope user switch scope → session baru dengan scope berbeda.
- [ ] RLS: user plant A tidak lihat data plant B.

### 6.3. E2E Test (Browser Automation)
- [ ] Journey Operator Kecer end-to-end di tablet emulator (Playwright).
- [ ] Journey Supervisor approve.
- [ ] Journey handoff antar 2 shift berurutan.

### 6.4. Load Test
- [ ] 5 pabrik simulasi × 3 shift paralel × 30 boks per shift → 450 event/menit. Latency p95 < 800ms.
- [ ] MV refresh 100 shift APPROVED per hari → durasi < 5 detik.

### 6.5. Manual Acceptance (di pilot pabrik)
- [ ] Operator berhasil jalankan shift 8 jam tanpa training tambahan.
- [ ] Data 5 shift pertama match manual paper record.
- [ ] Supervisor bisa approve tanpa call ke dev.

---

## 7. Definition of Done — Fase 1

Fase 1 **DONE** ketika:
1. Semua acceptance criteria di [`08-roadmap.md`](./08-roadmap.md) §Fase 1 checked.
2. Test suite hijau di CI.
3. Pilot pabrik operasional 5 hari tanpa data loss / crash.
4. Operator training material siap (video 10 menit + checklist 1 halaman).
5. Runbook operasional untuk supervisor (dokumen 2 halaman).

---

## 8. Referensi
- [`04-data-model.md`](./04-data-model.md) — skema yang dipakai.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) — permission per endpoint.
- [`06-api-spec.md`](./06-api-spec.md) — kontrak API.
- [`08-roadmap.md`](./08-roadmap.md) §Fase 1 — acceptance criteria umum.
- [`catatan-diskusi.md`](./catatan-diskusi.md) §9-10 — rasionale spec.
