# 05 · RBAC untuk Mobile — Role & Permission

Panduan RBAC yang **relevan untuk endpoint mobile**. Role & permission web-only (supervisor approve, dashboard, dispatch, dsb) tidak disertakan di sini — tanya PM/backend kalau butuh.

---

## 1. Konsep

### 1.1. Tiga Elemen
- **Role** — kumpulan Permission. Contoh: `OPERATOR_KECER`, `GUDANG_INBOUND`.
- **Permission** — izin granular untuk aksi tertentu. Format: `<resource>.<action>`. Contoh: `shift.start`, `tsg.inventory.allocate`.
- **Scope** — cakupan visibilitas: `GLOBAL` / `COMPANY` / `REGION` / `PLANT`. User dapat scope via **UserAssignment** yang memberikan `(role, scope)`.

### 1.2. Aturan Evaluasi
Untuk cek apakah user boleh melakukan aksi X pada resource Y:
1. Ambil semua `UserAssignment` aktif user (yang `revoked_at IS NULL`).
2. Untuk setiap assignment: role → daftar permission.
3. Cek: apakah permission yang dibutuhkan ada di role dan scope-nya cover resource Y.
4. Kalau **ada satu** assignment yang cukup → allow. Kalau tidak → 403.

### 1.3. Multi-Scope User
Login response berisi list `assignments`. Kalau user punya banyak assignment (mis. 1 operator di plant A + auditor di company B):
- App wajib tampilkan modal "Pilih scope aktif untuk sesi ini".
- Pilihan disimpan sebagai `activeScope` di token.
- Bisa switch tanpa logout via `POST /auth/switch-scope`.

---

## 2. Role yang Bisa Login Mobile

Bukan semua role login mobile — sebagian besar cuma web. Yang **relevan mobile**:

| Role Code | Nama | Scope Level | Deskripsi |
|---|---|---|---|
| `SUPERADMIN` | Super Admin | GLOBAL | Akses tak terbatas + 2FA + session pendek. Jarang login mobile, tapi bisa. |
| `PLANT_MANAGER` | Plant Manager | PLANT | Kelola operasional pabrik — bisa login mobile untuk quick check. |
| `OPERATOR_KECER` | Operator Kecer | PLANT | Ketua tim shift, input produksi & handoff. **User utama mobile.** |
| `OPERATOR_MEMBER` | Anggota Tim | PLANT | Anggota tim shift (read-only ke shift aktif). |
| `GUDANG_INBOUND` | Gudang Inbound | PLANT | Receiving TSG dari supplier, kelola inventory FIFO. |

> **Ketua Kecer vs Operator Kecer**: keduanya pakai role `OPERATOR_KECER` di system. Perbedaan `Ketua` vs `Anggota Biasa` diatur lewat `shift_role.can_end_shift` (flag di master data per plant) — bukan role terpisah. Cek response `POST /shifts/start` untuk lihat `shiftRoleId` per member.

**Role yang TIDAK login mobile** (mereka pakai web):
- `SHIFT_SUPERVISOR` (approve shift)
- `AREA_COORDINATOR`, `AREA_QA`
- `HQ_ADMIN`, `HQ_ANALYST`, `HQ_AUDITOR`
- `GUDANG_OUTBOUND` (Fase 5)
- `EKSPEDISI` (Fase 6)

---

## 3. SUPERADMIN — Peraturan Khusus di Mobile

Kalau user login mobile dengan role SUPERADMIN:
- Login wajib `otp` (2FA). Field `otp` di body login diperlukan.
- Access token expiry **5 menit** (bukan default 15).
- Refresh token **7 hari** (bukan default 30).
- App harus handle refresh yang lebih agresif.
- Semua aksi tercatat di `audit_log.is_privileged=true`.

**Endpoint SUPERADMIN yang bisa dipanggil dari mobile**:
- `GET /auth/me/sessions` — lihat sesi sendiri (sama seperti user biasa).
- Endpoint `/super/*` privileged **tidak** biasanya dipakai dari mobile — ada web dashboard khusus. Tapi kalau tim mobile mau implement view untuk quick-action, discuss dengan PM.

---

## 4. Permission untuk Endpoint Mobile

### 4.1. Auth
Semua authenticated user boleh:
- `GET /auth/me`
- `GET /auth/me/sessions`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/switch-scope`

### 4.2. Master Data Read
Semua authenticated user (untuk populate picker):
- `GET /machines`, `/products`, `/shift-templates`, `/shift-roles`, `/consumable-items`, `/spareparts`, `/downtime-categories`

`GET /users` butuh permission `shift.member.assign` (untuk picker anggota tim).

### 4.3. Shift & Produksi
| Permission | Endpoint | Role yang punya |
|---|---|---|
| `shift.start` | `POST /shifts/start` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.member.assign` | `PATCH /shifts/:id/members` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.box.open` | `POST /shifts/:id/boxes` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.box.weigh` | `PATCH /boxes/:id` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.consumption.log` | `POST /boxes/:id/consumption` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.downtime.log` | `POST /shifts/:id/downtime` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.maintenance.log` | `POST /shifts/:id/maintenance` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.waste.input` | (di dalam `POST /shifts/:id/end`) | OPERATOR_KECER, PLANT_MANAGER |
| `shift.end` | `POST /shifts/:id/end` | OPERATOR_KECER (dengan `shift_role.can_end_shift=true`), PLANT_MANAGER |
| `shift.handoff.create` | `POST /shifts/:id/handoff` | OPERATOR_KECER, PLANT_MANAGER |
| `shift.view` | `GET /shifts/:id`, `GET /shifts` | Semua role plant + Area/HQ |
| `hlp.pack` | `POST /hlp/pack` | OPERATOR_KECER, PLANT_MANAGER |

### 4.4. WMS Inbound
| Permission | Endpoint | Role yang punya |
|---|---|---|
| `tsg.receiving.create` | `POST /tsg-receiving` | GUDANG_INBOUND, PLANT_MANAGER |
| `tsg.receiving.view` | `GET /tsg-receiving` | GUDANG_INBOUND, PLANT_MANAGER |
| `tsg.inventory.view` | `GET /tsg-inventory/available` | GUDANG_INBOUND, PLANT_MANAGER, OPERATOR_KECER (untuk pick boks) |
| `tsg.inventory.allocate` | (di dalam `POST /shifts/:id/boxes`) | GUDANG_INBOUND, OPERATOR_KECER, PLANT_MANAGER |
| `tsg.inventory.allocate.override` | Override FIFO saat pick boks | PLANT_MANAGER only |
| `tsg.inventory.writeoff` | `PATCH /tsg-inventory/:id/writeoff` | GUDANG_INBOUND, PLANT_MANAGER |

### 4.5. QR
Semua authenticated user:
- `POST /qr/resolve` (server verify scope per QR)
- `POST /qr/scan-log`

---

## 5. Contoh Kombinasi User

### 5.1. Operator sederhana
**Andi** — kecer di Pabrik Malang-1.
```
user_assignment:
  { userId: usr_andi, scopeType: PLANT, scopeId: PLT-MLG-01, roleCode: OPERATOR_KECER }
```
Effective scope: `[PLT-MLG-01]`. Bisa start/end shift di MKR-01/02 dan HLP-01 pabrik ini saja.

### 5.2. Ketua Kecer (dengan `can_end_shift=true`)
**Alfi** — ketua kecer di Pabrik Malang-1.
```
user_assignment:
  { userId: usr_alfi, scopeType: PLANT, scopeId: PLT-MLG-01, roleCode: OPERATOR_KECER }
```
Sama role `OPERATOR_KECER` seperti Andi, tapi saat masuk shift, `shift_role_id` yang di-assign ke Alfi punya `can_end_shift=true`. Server cek keduanya (permission + shift_role flag) saat `POST /shifts/:id/end`.

### 5.3. Multi-scope (Gudang + Ketua di plant berbeda)
**Budi** — Ketua Kecer di plant A + Gudang Inbound di plant B.
```
user_assignment:
  { userId: usr_budi, scopeType: PLANT, scopeId: PLT-MLG-01, roleCode: OPERATOR_KECER }
  { userId: usr_budi, scopeType: PLANT, scopeId: PLT-MLG-02, roleCode: GUDANG_INBOUND }
```
Login → response berisi 2 assignments. App tampilkan picker. User pilih scope aktif; tergantung pilihan, fitur yang muncul di home berbeda.

Bisa switch scope via `POST /auth/switch-scope` tanpa logout.

---

## 6. Aturan Enforcement (App-Side)

Beberapa aturan client harus enforce (walau server juga cek):

1. **Sembunyikan tombol yang user tidak punya permission**. Contoh: kalau `shift.end` tidak ada di permission user (bukan Ketua), tombol "AKHIRI SHIFT" jangan tampil.
2. **Handle 403 dengan pesan jelas**. Contoh: "Anda tidak berwenang mengakhiri shift. Minta Ketua Kecer."
3. **Handle 409 SESSION_EXISTS** di login — modal dengan info device lama + tombol "Hubungi IT".
4. **Handle 401 saat token expired** — auto-refresh sebelum kirim ulang request. Kalau refresh juga 401 → logout + redirect ke login.
5. **Handle scope switch** — kalau user switch scope, refresh cached data yang scope-dependent (mis. list mesin, produk).

---

## 7. Testing Strategy RBAC (App-Side)

Untuk setiap fitur:
- **Positive**: role yang punya permission → tombol muncul, action sukses.
- **Negative**: role yang tidak punya permission → tombol hidden atau show tapi disabled dengan tooltip "Anda tidak berwenang".
- **Cross-scope**: user dengan scope plant A → tidak lihat data plant B (walau app coba fetch — server return 404/403).

---

## 8. Referensi (dalam paket ini)

- [`02-api-contract.md`](./02-api-contract.md) — endpoint yang butuh permission ini.
- [`01-app-spec.md`](./01-app-spec.md) §5 — session management & SUPERADMIN details.
- [`04-glossary.md`](./04-glossary.md) — istilah role.
