# 13 · Spesifikasi Teknis Aplikasi Mobile (Flutter, Fase 3)

Dokumen operasional untuk **implementasi aplikasi mobile Flutter** di Fase 3. Berisi auth flow spesifik mobile, aturan single-session, local queue, deep link, push notification, dan testing checklist.

**Ditujukan**: mobile developer Flutter + backend developer yang integrasi.
**Related**: [`06-api-spec.md`](./06-api-spec.md), [`07-qr-strategy.md`](./07-qr-strategy.md), [`05-rbac-matrix.md`](./05-rbac-matrix.md), [`08-roadmap.md`](./08-roadmap.md) Fase 3.

---

## 1. Konteks & Target Device

**Users target**: Operator Kecer, Ketua Kecer, Anggota Tim (Fase 1), Gudang Inbound (Fase 3 setelah aktif), Gudang Outbound (Fase 5).
**Device target**:
- Android 8+ (min API 26) — mayoritas operator lantai
- iOS 13+ — supervisor/manager yang lebih senior
- Layar 5.5" - 7" — bukan tablet (tablet pakai web)

**Kondisi lapangan**:
- Sinyal 4G kadang drop di lantai produksi (blok beton, mesin).
- Kamera untuk QR scan.
- Baterai bisa jadi masalah — app harus efisien.
- Tangan operator kadang kotor / sarung tangan → target tap besar.

---

## 2. Aturan Single-Session Mobile

> **Aturan kunci**: satu user **hanya bisa punya 1 sesi aktif di mobile pada satu waktu**. Kalau user coba login di device kedua, sistem tolak. Untuk pindah device, **SUPERADMIN wajib revoke sesi lama dulu** — user tidak bisa self-service.

### 2.1. Alasan
- **Compliance**: aksi produksi harus tertaut ke fisik operator di lantai. Kalau user bisa login di banyak device sekaligus, susah audit siapa yang benar-benar operate.
- **Anti-share credential**: mengurangi risiko user meminjamkan credential ke rekan lain (satu login pindah device tidak trivial).
- **Insiden compromise**: kalau ada indikasi akun kompromise, SUPERADMIN bisa revoke tanpa perlu ganti password dulu.

### 2.2. Aturan Login

| Kondisi | Perilaku |
|---|---|
| User login pertama kali (belum ada session mobile) | ✅ Sukses. Session tercatat dengan `deviceType='MOBILE'`, `deviceId`, `deviceName`. |
| User coba login di device sama (mis. app restart) | ✅ Sukses. Session lama revoked, session baru dibuat. Dideteksi via `deviceId` yang sama. |
| User coba login di device berbeda, sementara sesi lama masih aktif | ❌ **409 SESSION_EXISTS**. Response menunjukkan device aktif (nama, terakhir aktif, IP masked). User diarahkan kontak SUPERADMIN. |
| SUPERADMIN revoke sesi lama | Sesi lama status `REVOKED`, refresh token invalid. User bisa login lagi di device baru. |
| Web session concurrent | ✅ Diperbolehkan (tablet supervisor + PC office). Aturan single-session hanya untuk `deviceType='MOBILE'`. |

### 2.3. Response 409 SESSION_EXISTS (contoh)

```json
{
  "error": {
    "code": "SESSION_EXISTS",
    "message": "Akun Anda sedang aktif di device lain. Hubungi Super Admin untuk memutus sesi.",
    "details": {
      "activeSession": {
        "deviceName": "Samsung SM-A125 · Alfi's phone",
        "deviceId": "9f3a2b… (masked)",
        "lastActiveAt": "2026-08-10T14:32:11+07:00",
        "ipAddressMasked": "203.194.***.***",
        "loginAt": "2026-08-10T06:00:12+07:00"
      },
      "contactSuperadmin": "Hubungi IT / Super Admin dengan info di atas untuk request revoke sesi."
    }
  }
}
```

### 2.4. Deteksi `deviceId`

- **Android**: `androidId` (dari `android_id` provider) + salt = SHA256 stable.
- **iOS**: `identifierForVendor` (per-app-vendor UUID).
- **Fallback**: kalau OS tolak, generate UUID lokal + simpan di secure storage (keychain/keystore).
- **Jangan pakai IMEI** — restricted di Android 10+.

App kirim `deviceId` + `deviceName` (mis. "Samsung Galaxy A12 - Alfi's phone") di setiap login request.

### 2.5. Logout Flow Mobile

- **User logout normal** (tombol logout): POST `/auth/logout` → refresh token revoked, session status `REVOKED`. User bisa langsung login lagi.
- **App di-uninstall** (tanpa logout): session tetap AKTIF di server. Setelah 30 hari (refresh expired) auto-cleanup. Kalau user install ulang → 409 SESSION_EXISTS. Solusi: SUPERADMIN force-revoke.
- **Password reset**: semua session user (mobile + web) auto-revoke.

---

## 3. Auth Flow Mobile

### 3.1. Login Flow Diagram

```
┌──────────┐  1. POST /auth/login                              ┌─────────┐
│  Flutter │─ { username, password, otp?, deviceId,           ─▶│   API   │
│   app    │      deviceName, deviceType: 'MOBILE' }            │         │
│          │                                                    │ 2. cek user
│          │                                                    │ 3. cek OTP
│          │                                                    │    (kalau SUPERADMIN)
│          │                                                    │ 4. cek session
│          │                                                    │    mobile lain
│          │                                                    │      │
│          │        ┌───────────────────────────────────────────┤      │
│          │◀─── 409 SESSION_EXISTS + info device lama          │  YES │
│          │        (user → kontak SUPERADMIN)                  │      │
│          │        └──────────────────────────────────────────┐│      │
│          │                                                    │  NO  ▼
│          │                                                    │ 5. create session
│          │                                                    │    deviceType=MOBILE
│          │                                                    │ 6. return token
│          │◀─── 200 { accessToken, refreshToken, user, ... }  ─│         │
└──────────┘                                                    └─────────┘
```

### 3.2. Refresh Token

- Access token 15 menit (untuk operator biasa), 5 menit untuk SUPERADMIN.
- Refresh token 30 hari (operator), 7 hari (SUPERADMIN).
- Setiap refresh → refresh token di-**rotate** (yang lama invalidated). Mencegah token theft berkelanjutan.
- App perlu handle refresh secara automatic — sebelum access token expired, background job refresh.

### 3.3. 2FA (kalau user punya role SUPERADMIN)

Untuk SUPERADMIN mobile:
- Step 1: input username + password → server return `otp_required: true`, kirim OTP via WhatsApp (Twilio API) atau TOTP.
- Step 2: input OTP → POST `/auth/login` lengkap dengan `otp`.
- OTP TTL: 5 menit.

### 3.4. Secure Storage

- Access token & refresh token disimpan di **secure storage**:
  - Android: `EncryptedSharedPreferences` atau `flutter_secure_storage`.
  - iOS: Keychain via `flutter_secure_storage`.
- Jangan simpan di SharedPreferences plain — attacker dengan root/jailbreak bisa baca.
- Biometric lock opsional (fingerprint/faceID) untuk membuka app kalau session masih aktif.

---

## 4. Session Management (SUPERADMIN)

### 4.1. Lihat Semua Session User

```
GET /super/users/:userId/sessions
```
Response:
```json
{
  "data": [
    {
      "sessionId": "sess_1a",
      "deviceType": "MOBILE",
      "deviceName": "Samsung SM-A125 · Alfi's phone",
      "deviceId": "9f3a2b… (masked)",
      "ipAddress": "203.194.12.55",
      "userAgent": "MesHummer/1.2.0 (Android 12; SM-A125)",
      "loginAt": "2026-08-10T06:00:12+07:00",
      "lastActiveAt": "2026-08-10T14:32:11+07:00",
      "expiresAt": "2026-09-09T06:00:12+07:00",
      "status": "ACTIVE"
    },
    {
      "sessionId": "sess_1b",
      "deviceType": "WEB",
      "deviceName": "Chrome · Windows 11",
      "loginAt": "…",
      "status": "ACTIVE"
    }
  ]
}
```

### 4.2. Revoke Sesi Spesifik

```
POST /super/sessions/:sessionId/revoke
Body: { "reason": "User request pindah HP baru" }
```
Response: 204. Session status → `REVOKED`. Refresh token invalid. Access token yang belum expired tetap valid sampai 5-15 menit (design tradeoff — bisa di-fix dengan JWT blocklist kalau perlu strict).

### 4.3. Revoke Semua Sesi Mobile User

Convenience endpoint:
```
POST /super/users/:userId/sessions/mobile/revoke
```
Sama seperti di atas tapi loop semua session `deviceType='MOBILE'`.

### 4.4. Notification ke SUPERADMIN Lain

Setiap `super.session.revoke` action → in-app notification broadcast ke SUPERADMIN lain aktif (self-policing).

---

## 5. Local Queue (Offline Tolerance)

Sudah dibahas di [`07-qr-strategy.md`](./07-qr-strategy.md) §6.3. Ringkasnya:

- Package: `drift` (SQLite ORM).
- Setiap POST/PATCH yang gagal karena network → masuk queue lokal.
- Worker isolate retry setiap 15 detik saat online.
- Backoff: 1s, 5s, 30s, 5m, ... max 24 jam.
- Dedup via `Idempotency-Key` yang di-set saat queue.

**Interaksi dengan single-session**: kalau app sedang offline, session tetap valid (JWT/refresh belum expired). Kalau session di-revoke SUPERADMIN saat app offline → next sync gagal 401. App harus:
1. Notif user "Sesi telah direvoke — silakan login ulang".
2. Clear secure storage.
3. Redirect ke login screen.

---

## 6. Deep Link (untuk QR Scanning)

Sudah dibahas di [`07-qr-strategy.md`](./07-qr-strategy.md) §6.2. Ringkasnya:

- Custom scheme `ohmes://` untuk deep link internal.
- Android intent filter `<data android:scheme="ohmes" />`.
- iOS: Universal Link (Fase 3 setup).
- App handle: parse URI → panggil `POST /qr/resolve` → tampilkan halaman sesuai `nextAction`.

---

## 7. Push Notification (Fase 3+)

**Use case Fase 3**:
- Kecer diberi tahu shift menunggu approval.
- Gudang Inbound diberi tahu TSG receiving baru.
- SUPERADMIN broadcast privileged action.

**Backend**: Firebase Cloud Messaging (FCM) untuk Android + APNs untuk iOS.
- Token FCM disimpan per session (`user_session.pushToken`).
- Backend kirim ke FCM sesuai target user + device.

**Fase 3 minimal**: notification untuk approval pending & session revoked. Yang lain menyusul.

---

## 8. App Update Strategy

- Versioning: semver (`1.2.0`).
- Force update: kalau versi < min supported → app tampilkan blocking screen "Update sekarang".
- Backend cek versi via header `X-Client-Version: 1.2.0`. Kalau di bawah min → 426 UPGRADE_REQUIRED.
- Distribusi: Google Play Store (Android) + TestFlight/App Store (iOS). Untuk pilot, MDM (Mobile Device Management) internal.

---

## 9. Performance & Battery

- Background sync minimum: cukup poll queue tiap 15 detik, tidak perlu WebSocket persistent (drain baterai).
- Cache master data (Machine, Product, ShiftTemplate, dsb) TTL 24 jam — refresh saat online.
- QR scanner: aktifkan kamera hanya di halaman scanner, matikan begitu keluar.
- Prefer server-side calculation — jangan hitung yield di klien.

---

## 10. Business Rules Recap

| Rule | Enforcement |
|---|---|
| 1 session mobile per user | Service login layer 409 SESSION_EXISTS |
| Session mobile hanya bisa direvoke oleh SUPERADMIN | Permission `super.session.revoke` di endpoint `/super/sessions/:id/revoke` |
| User logout normal → session revoked, boleh login lagi | Endpoint `/auth/logout` |
| SUPERADMIN login mobile juga single-session + 2FA | Permission + policy check |
| Device switch tidak self-service | 409 dengan info kontak SUPERADMIN |
| Force update kalau versi < min | Middleware cek `X-Client-Version` |

---

## 11. Testing Checklist

### 11.1. Unit Test
- [ ] Login single-session — 2 device same user → 409.
- [ ] Login same device (deviceId sama) → sesi lama revoke, sukses.
- [ ] Refresh token rotation.
- [ ] OTP validation untuk SUPERADMIN mobile.

### 11.2. Integration Test
- [ ] End-to-end: login → offline → queue → sync → sukses.
- [ ] SUPERADMIN revoke session → user 401 di next request.
- [ ] Web + mobile concurrent → OK.
- [ ] Password reset → semua session revoked.

### 11.3. E2E Test (device automation)
- [ ] Physical Android + iOS test single-session enforcement.
- [ ] QR scan + local queue + retry.
- [ ] Deep link handler.

### 11.4. Manual Acceptance
- [ ] Operator kecer bisa jalankan shift lengkap dari mobile.
- [ ] Ganti HP: user contact SUPERADMIN, revoke, login sukses di HP baru.
- [ ] Offline 15 menit di lantai produksi → semua input tersync saat sinyal balik.
- [ ] SUPERADMIN dapat notif saat SUPERADMIN lain revoke session.

---

## 12. UI/UX Guidelines Mobile

- Halaman login: prominent field username/password + tombol "Login" H1.
- Error 409 SESSION_EXISTS: modal jelas dengan device info + tombol "Hubungi IT" (open WhatsApp deeplink kalau ada IT support number).
- Halaman "Sesi Anda" (settings): user bisa lihat sesi sendiri (mobile + web), tapi hanya bisa logout dari device saat ini. Revoke device lain tetap butuh SUPERADMIN.
- Session-revoked banner: kalau SUPERADMIN revoke, app tampil pesan "Sesi Anda direvoke oleh admin. Silakan login ulang."

---

## 13. Referensi

- [`04-data-model.md`](./04-data-model.md) §4 — `user_session` schema.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) §3.6.a — permission `super.session.revoke`.
- [`06-api-spec.md`](./06-api-spec.md) §2 — auth endpoints, §7A — SUPERADMIN endpoints.
- [`07-qr-strategy.md`](./07-qr-strategy.md) — QR & local queue detail.
- [`08-roadmap.md`](./08-roadmap.md) Fase 3 — mobile roadmap.
