# 20 · API Error Code Catalog

Registry terpusat untuk semua error code yang di-return API. **Setiap error code baru wajib registered di sini** — mencegah inkonsistensi antar developer.

**Format response error** (dari [`06-api-spec.md`](./06-api-spec.md) §1.5):
```json
{
  "error": {
    "code": "SHIFT_HAS_ACTIVE_BOX",
    "message": "Tidak bisa mengakhiri shift — masih ada 1 boks aktif.",
    "details": { "activeBoxIds": ["box_x9f"] }
  },
  "requestId": "req_2a7f9b"
}
```

Konvensi:
- `code`: SNAKE_UPPER, stable (aman untuk error handling di klien).
- `message`: Bahasa Indonesia untuk display ke user.
- `details`: object opsional dengan context tambahan.

---

## 1. Auth Errors (`AUTH_*`, `SESSION_*`, `OTP_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Username atau password salah. | Login dengan credential salah | User cek credential; setelah 5x → lock 15 menit |
| `AUTH_TOKEN_EXPIRED` | 401 | Token telah expired. Silakan login ulang. | Access token expired | Client trigger refresh atau redirect ke login |
| `AUTH_TOKEN_INVALID` | 401 | Token tidak valid. | JWT signature salah / tampered | Force logout + investigate |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token tidak valid atau sudah expired. | Refresh token expired/revoked | User login ulang |
| `AUTH_USER_INACTIVE` | 403 | User account tidak aktif. | User `isActive=false` | Kontak SUPERADMIN untuk reactivate |
| `OTP_REQUIRED` | 401 | OTP diperlukan untuk login. | SUPERADMIN login tanpa OTP | User input OTP dari WA/TOTP |
| `OTP_INVALID` | 401 | OTP salah atau expired. | OTP mismatch atau > 5 menit | User request OTP baru |
| `OTP_LOCKED` | 429 | Terlalu banyak percobaan OTP. Coba lagi dalam 15 menit. | 5x fail berturut | Wait 15 menit |
| `SESSION_EXISTS` | 409 | Akun Anda sedang aktif di device lain. Hubungi Super Admin. | Login mobile dengan deviceId beda | SUPERADMIN revoke sesi lama |
| `SESSION_REVOKED` | 401 | Sesi Anda telah direvoke oleh admin. | Session di-revoke SUPERADMIN | User login ulang |
| `SESSION_EXPIRED` | 401 | Sesi telah expired. | Refresh token expired | User login ulang |
| `UPGRADE_REQUIRED` | 426 | Versi app terlalu lama. Update sekarang. | `X-Client-Version` < min supported | User update app |

---

## 2. Permission Errors (`PERMISSION_*`, `SCOPE_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `PERMISSION_DENIED` | 403 | Anda tidak memiliki izin untuk aksi ini. | User tidak punya permission | Kontak admin untuk assign role |
| `SCOPE_DENIED` | 403 | Resource ini di luar scope Anda. | User akses data di plant/region lain | Kontak admin untuk assign scope |
| `SCOPE_SWITCH_INVALID` | 403 | Anda tidak punya assignment ke scope ini. | Switch scope ke yang tidak dimiliki | Kontak admin |
| `SUPERADMIN_LIMIT_REACHED` | 400 | Sudah ada 3 SUPERADMIN aktif — batas maksimum. | Assign SUPERADMIN ke-4 | Revoke SUPERADMIN existing dulu |
| `SUPERADMIN_SELF_REVOKE` | 400 | SUPERADMIN tidak bisa revoke dirinya sendiri. | Self-revoke last SUPERADMIN | Assign SUPERADMIN lain dulu |

---

## 3. Validation Errors (`VALIDATION_*`)

| Code | HTTP | Message | Kapan trigger |
|---|:---:|---|---|
| `VALIDATION_REQUIRED_FIELD` | 400 | Field wajib tidak diisi: `{field}`. | Field required kosong |
| `VALIDATION_INVALID_FORMAT` | 400 | Format tidak sesuai: `{field}`. | Format invalid (email, date, dsb) |
| `VALIDATION_OUT_OF_RANGE` | 400 | Nilai di luar range: `{field}` harus antara `{min}` dan `{max}`. | Angka di luar bound |
| `VALIDATION_UNIQUE_VIOLATION` | 409 | `{field}` sudah dipakai: `{value}`. | Unique constraint violation |

---

## 4. Shift Errors (`SHIFT_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `SHIFT_ALREADY_RUNNING` | 409 | Mesin sudah punya shift RUNNING. | Start shift 2x untuk mesin sama | End shift dulu |
| `SHIFT_NOT_RUNNING` | 409 | Shift tidak dalam status RUNNING. | Mutasi ke shift yang bukan RUNNING | Cek status shift |
| `SHIFT_HAS_ACTIVE_BOX` | 409 | Tidak bisa mengakhiri shift — masih ada 1 atau lebih boks aktif. | End shift dengan boks tanpa handoff | Timbang boks atau buat handoff |
| `SHIFT_MISSING_WASTE_CATEGORY` | 400 | Waste 4 kategori (Menir, Rijekan, Debu Kasar, Debu Halus) wajib lengkap. | End shift tanpa 4 waste | Isi semua kategori |
| `SHIFT_MISSING_TEAM_LEADER` | 400 | Minimal 1 anggota tim dengan role can_end_shift=true. | Start shift tanpa ketua | Tambah anggota dengan role Ketua |
| `SHIFT_PRODUCT_NOT_ASSIGNED_TO_PLANT` | 400 | Produk `{productCode}` tidak diassign ke pabrik ini. | Start shift dengan produk yang tidak di plant_product | HQ_ADMIN assign produk ke plant |
| `SHIFT_APPROVE_SELF` | 409 | Tidak bisa approve shift yang Anda buat sendiri. | Actor = createdBy | Supervisor lain yang approve |
| `SHIFT_NOT_COMPLETED` | 409 | Shift harus status COMPLETED untuk di-approve/reopen. | Approve/reopen shift RUNNING atau APPROVED | Cek status |
| `SHIFT_ALREADY_APPROVED` | 409 | Shift sudah APPROVED — perubahan lewat CORRECTION. | Update APPROVED shift | HQ_AUDITOR buat correction |
| `SHIFT_TEMPLATE_NOT_ACTIVE` | 400 | ShiftTemplate `{code}` tidak aktif. | Start shift dengan template inactive | HQ_ADMIN aktifkan atau pilih template lain |
| `SHIFT_REOPEN_DENIED_APPROVED` | 409 | Shift APPROVED tidak bisa di-reopen — pakai CORRECTION. | Reopen shift APPROVED | Buat CORRECTION |

---

## 5. Box / TSG Errors (`TSG_BOX_*`, `BOX_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `TSG_BOX_NOT_AVAILABLE` | 400 | Boks tidak tersedia di inventory. Cek FIFO list. | Open boks dengan inventoryBoxId ≠ AVAILABLE | Pilih boks lain dari FIFO |
| `TSG_BOX_NOT_FOUND` | 404 | Boks TSG tidak ditemukan. | inventoryBoxId invalid | Verify boks ada |
| `TSG_BOX_CROSS_PLANT` | 403 | Boks TSG dari pabrik lain — tidak boleh dipakai. | Boks dari plant B untuk shift plant A | Pilih boks plant sendiri |
| `BOX_ALREADY_ACTIVE` | 409 | Sudah ada boks aktif di shift ini. | Buka boks kedua tanpa tutup pertama | Timbang boks aktif dulu |
| `BOX_NOT_ACTIVE` | 409 | Boks sudah ditutup — tidak bisa modifikasi. | Timbang atau log event ke boks completed | Buka boks baru |
| `BOX_YIELD_OUT_OF_RANGE` | 400 | Yield di luar range normal — wajib pilih RejectReason. | outputWeightKg menghasilkan yield abnormal | Pilih alasan reject |
| `BOX_WEIGHT_INVALID` | 400 | Berat harus > 0. | outputWeightKg ≤ 0 | Input berat valid |

---

## 6. WMS Inbound Errors (`TSG_RECEIVING_*`, `TSG_INVENTORY_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `TSG_RECEIVING_TOTAL_MISMATCH` | 400 | Total berat tidak match dengan sum per boks (selisih > 1%). | Header total ≠ sum boxes | Verify berat |
| `TSG_RECEIVING_BACKDATED_LIMIT` | 400 | Backdate max 24 jam. | receivedAt > 24 jam yang lalu | Update tanggal atau kontak SUPERADMIN |
| `TSG_RECEIVING_SUPPLIER_INACTIVE` | 400 | Supplier tidak aktif. | supplierId non-active | Pilih supplier lain atau HQ_ADMIN aktifkan |
| `TSG_INVENTORY_ALREADY_WRITTEN_OFF` | 409 | Boks sudah WRITTEN_OFF — tidak bisa di-writeoff lagi. | Writeoff boks non-AVAILABLE | Skip / cek status |
| `TSG_INVENTORY_FIFO_OVERRIDE_DENIED` | 403 | Butuh permission tsg.inventory.allocate.override untuk pilih boks non-tertua. | Non-FIFO tanpa permission | Kontak Ketua Kecer atau Plant Manager |

---

## 7. WMS Outbound Errors (Fase 5) (`FG_*`, `CARTON_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `FG_RECEIVING_ALREADY_CONFIRMED` | 409 | Receiving sudah confirmed — tidak bisa diubah. | Confirm ulang | Kalau salah, dispute → CORRECTION |
| `FG_RECEIVING_SHIFT_NOT_APPROVED` | 409 | Shift belum APPROVED — belum bisa receive. | Confirm sebelum shift APPROVED | Supervisor approve shift dulu |
| `CARTON_NOT_OPEN` | 409 | Karton bukan status OPEN — tidak bisa tambah pack. | Add pack ke karton READY/DISPATCHED | Buka karton baru |
| `CARTON_PRODUCT_MISMATCH` | 400 | Pack produk berbeda dari karton. | Add pack produk X ke karton produk Y | Karton per produk |
| `CARTON_PACK_ALREADY_IN_OTHER` | 409 | Pack sudah masuk karton lain. | Add pack duplicate | Cek karton existing |
| `CARTON_EMPTY_CANNOT_CLOSE` | 400 | Karton kosong — minimal 1 pack sebelum ditutup. | Close karton dengan 0 pack | Add pack dulu |

---

## 8. Dispatch Errors (Fase 6) (`DISPATCH_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `DISPATCH_CARTON_NOT_READY` | 400 | Karton belum status READY. | Add karton OPEN/DISPATCHED ke order | Tutup karton dulu |
| `DISPATCH_CARTON_ALREADY_IN_ORDER` | 409 | Karton sudah masuk dispatch order lain. | Duplicate assign | Cek order existing |
| `DISPATCH_ORDER_EMPTY` | 400 | Order harus ada minimal 1 karton. | Create order tanpa item | Add karton |
| `DISPATCH_ALREADY_DISPATCHED` | 409 | Order sudah DISPATCHED — tidak bisa diubah. | Modify DISPATCHED order | Kalau salah, correction manual + audit |

---

## 9. QR Errors (`QR_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `QR_INVALID` | 400 | QR tidak valid atau HMAC salah. | HMAC verify fail | Cek QR sticker; kalau valid, kontak IT |
| `QR_NOT_FOUND` | 404 | Entity dari QR tidak ditemukan di sistem. | entityId tidak ada | Verify master data |
| `QR_EXPIRED` | 400 | QR sudah expired. | Dynamic QR di luar valid window | Generate QR baru |
| `QR_INACTIVE` | 409 | QR sudah di-deactivate (reprint). | Scan QR lama setelah reprint | Pakai QR baru |
| `QR_SCOPE_DENIED` | 403 | QR ini untuk pabrik lain. | Scan QR plant lain | Verify plant scope |

---

## 10. Rate Limit & System Errors (`RATE_*`, `SYSTEM_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `RATE_LIMIT_EXCEEDED` | 429 | Terlalu banyak request. Coba lagi dalam beberapa saat. | Rate limit hit | Wait + retry dengan backoff |
| `IDEMPOTENCY_KEY_MISSING` | 400 | Header Idempotency-Key wajib. | POST/PATCH tanpa header | Klien tambah header |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Request dengan key ini sudah ada dengan payload berbeda. | Idempotency key reused untuk request beda | Generate key baru |
| `SYSTEM_MAINTENANCE` | 503 | Sistem sedang maintenance. | Maintenance mode aktif | Wait sesuai ETA |
| `SYSTEM_UNAVAILABLE` | 503 | Layanan tidak tersedia sementara. | DB/external service down | Retry dengan backoff |
| `INTERNAL_ERROR` | 500 | Terjadi kesalahan sistem. Tim kami sudah diberitahu. | Unhandled exception | Auto-alert dev; user retry |

---

## 11. Data Integrity Errors (`INTEGRITY_*`)

| Code | HTTP | Message | Kapan trigger | Fix |
|---|:---:|---|---|---|
| `INTEGRITY_FOREIGN_KEY_MISSING` | 400 | Referensi ke record yang tidak ada: `{field}`. | FK invalid | Verify ID |
| `INTEGRITY_CASCADE_BLOCKED` | 409 | Tidak bisa delete — masih ada record turunan. | Delete parent dengan children | Delete children dulu atau soft-delete |
| `INTEGRITY_RLS_VIOLATION` | 500 | Data integrity violation (RLS). | RLS policy trigger (should never happen for legit request) | Auto-alert SUPERADMIN; investigate |

---

## 12. Cara Tambah Error Code Baru

Kalau butuh error code baru:

1. **Cek registry ini** — kalau sudah ada yang mirip, pakai yang existing.
2. Kalau memang baru:
   - Format: `<CATEGORY>_<DESCRIPTIVE>_<REASON?>` (SNAKE_UPPER).
   - Tambah entry di section yang sesuai (atau buat section baru).
   - Include: HTTP status, message ID (untuk mobile), kapan trigger, fix.
3. Update `src/lib/errors/codes.ts` (enum + definition):
   ```ts
   export const ErrorCode = {
     SHIFT_HAS_ACTIVE_BOX: {
       httpStatus: 409,
       message: (details) => `Tidak bisa mengakhiri shift — masih ada ${details.count} boks aktif.`,
     },
     // ...
   };
   ```
4. Update paket mobile-team: `docs/mobile-team/02-api-contract.md` kalau relevant.
5. Tambah entry di CHANGELOG.

---

## 13. Client-Side Error Handling Pattern (Rekomendasi)

### Web (Next.js)
```ts
const handleApiError = (err: ApiError) => {
  switch (err.code) {
    case 'SESSION_EXPIRED':
    case 'AUTH_TOKEN_EXPIRED':
      redirect('/login');
      break;
    case 'PERMISSION_DENIED':
      toast.error('Anda tidak berwenang untuk aksi ini.');
      break;
    case 'RATE_LIMIT_EXCEEDED':
      toast.warn('Terlalu cepat. Coba lagi sebentar.');
      break;
    default:
      toast.error(err.message);
  }
};
```

### Mobile (Flutter)
```dart
switch (err.code) {
  case 'SESSION_EXISTS':
    showDialog(context, SessionConflictModal(activeSession: err.details.activeSession));
    break;
  case 'TSG_BOX_NOT_AVAILABLE':
    showSnackBar('Boks tidak tersedia. Refresh dan pilih dari FIFO list.');
    refreshInventoryList();
    break;
  // ...
}
```

---

## 14. Referensi

- [`06-api-spec.md`](./06-api-spec.md) §1.5-1.6 — konvensi error response.
- [`SECURITY.md`](../SECURITY.md) §4 — security log yang tercatat dari error tertentu.
- [`17-operations-runbook.md`](./17-operations-runbook.md) §4 — playbook untuk error common.
