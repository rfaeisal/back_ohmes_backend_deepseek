# 10 · Analytics Events & Notifikasi — Mobile v2

> **Sumber**: disalin dari `../mobile-team/07-analytics-events.md` (pack v1.3.0), dikoreksi terhadap kode backend branch `main` (snapshot 2026-08-22).
>
> **Koreksi utama v2**:
> - Endpoint register push token aktual: **`POST /mobile/push-register`** (bukan `/auth/me/register-push-token`).
> - Backend **tidak mengirim push FCM/APNs** — token hanya disimpan di `user_session.push_token`. Notifikasi disampaikan via **polling `GET /notifications`** (isi saat ini: shift COMPLETED > 2 jam belum di-approve).
> - Event produksi operator (`shift_*`, `box_*`, `handoff_*`) **dihapus** dari katalog — flow operator = **tablet web**, bukan scope mobile v2. Referensi historis: `../mobile-team/07-analytics-events.md` §3.2–3.4.
> - Package name diseragamkan: **`com.hummergroup.mes`** (per `08-deployment-store.md` pack lama).

Panduan tracking event untuk mobile app (Flutter) + strategi notifikasi (polling saat ini, push FCM sebagai rencana). Tim mobile implement events yang mendukung analytics + observability tanpa mengumpulkan data pribadi berlebihan (PDP compliance).

---

## 1. Prinsip Tracking

1. **Server-side truth first** — untuk business metrics (produksi, waste), data di-track di backend (bukan client). Analytics mobile fokus: **user behavior + performance app**.
2. **Anonymize by default** — event kirim `userId` opsional (untuk correlation), tapi tidak nama/phone.
3. **Batch, don't spam** — kumpul events lokal, flush setiap 30 detik atau saat critical action.
4. **Respect privacy** — user bisa opt-out analytics dari setting (Fase future). Untuk sekarang: opt-in default (justified karena kontrak kerja).
5. **No PII in event props** — jangan kirim email, phone, alamat.

---

## 2. Analytics Provider

**Pilihan**: Firebase Analytics (bundled dengan FCM). Alternatif: PostHog self-hosted.

**Rekomendasi**: Firebase Analytics (paling standard, gratis sampai 500 event/user/day).

---

## 3. Event Catalog

Convention naming: `<domain>_<action>` snake_case. Max 40 karakter (Firebase limit).

> ⚠️ **Scope mobile v2**: hanya flow SJ, receiving, dan monitoring/dashboard. Event produksi operator (`shift_started`, `box_opened`, `box_weighed`, `handoff_created`, dst.) **bukan scope mobile v2** — operator memakai aplikasi tablet web area produksi, dan tracking-nya di aplikasi tersebut.

### 3.1. Auth & Session

| Event | Kapan trigger | Props |
|---|---|---|
| `app_open` | App launched (foreground) | `app_version`, `os_version`, `device_model` |
| `login_attempt` | User tap login button | `has_otp: boolean` |
| `login_success` | Login 200 response | `user_role`, `active_scope_type`, `session_id` (hash) |
| `login_failed` | Login 401/other error | `error_code` (mis. `AUTH_INVALID_CREDENTIALS`) |
| `session_conflict_shown` | 409 SESSION_EXISTS ditampilkan | (no PII) |
| `otp_requested` | OTP sent | (no PII) |
| `otp_verified` | OTP correct | (no PII) |
| `otp_failed` | OTP wrong | `attempt_count` |
| `logout` | User tap logout | `session_duration_seconds` |
| `scope_switched` | User switch active scope | `from_scope_type`, `to_scope_type` |
| `push_token_registered` | 200 POST /mobile/push-register (action=register) | `device_platform` |
| `push_token_unregistered` | 200 POST /mobile/push-register (action=unregister) | (no additional props) |

### 3.2. Flow Surat Jalan (AREA_SJ_OFFICER)

| Event | Kapan trigger | Props |
|---|---|---|
| `sj_created` | 201 POST /supplier-sj success | `supplier_code`, `plant_code` |
| `label_scanned` | Resolve scan QR / input manual (`GET /supplier-sj/labels/:boxCode`) | `success: boolean`, `label_status` (`AVAILABLE`/`ASSIGNED`/`VOID`), `has_tsg_type: boolean`, `scan_source` (`camera`/`manual`) |
| `sj_shipped` | Status SJ → `SHIPPED` (semua boks tertimbang) | `box_count`, `total_kg_bucket` (`<500`/`500-1000`/`>1000`) |
| `receiving_from_sj` | 201 POST /tsg-receiving/from-sj success (pabrik verifikasi SJ) | `box_count`, `weight_kg_bucket`, `verified_scan_count` |
| `monitoring_dashboard_viewed` | Buka dashboard monitoring (pabrik/area) | `section` (`stock`/`activity`), `plant_count` |

### 3.3. WMS Inbound (Gudang)

| Event | Trigger | Props |
|---|---|---|
| `receiving_created` | POST /tsg-receiving success | `box_count`, `supplier_code` |
| `receiving_failed` | 4xx error | `error_code` |
| `inventory_writeoff` | PATCH writeoff | `reason_category` |

### 3.4. UX / Performance

| Event | Trigger | Props |
|---|---|---|
| `screen_view` | Navigation | `screen_name` |
| `api_slow` | Request > 2 detik | `endpoint`, `duration_ms` |
| `api_error` | 5xx / network fail | `endpoint`, `error_code`, `retry_count` |
| `offline_queued` | Request masuk local queue | `endpoint`, `queue_size` |
| `offline_synced` | Queue di-flush online | `synced_count`, `queue_duration_seconds` |
| `app_crash` | Auto (via Sentry/Firebase Crashlytics) | (stack trace) |

### 3.5. Business Metrics (untuk PM insights)

| Event | Trigger | Props |
|---|---|---|
| `feature_used_first_time` | User first time pakai fitur | `feature_name` |
| `permission_denied` | User klik action yang tidak punya permission | `permission`, `user_role` |
| `session_timeout` | Session expired mid-use | `screen_at_expiry` |

---

## 4. Setup Firebase Analytics

### 4.1. Package
```yaml
# pubspec.yaml
dependencies:
  firebase_core: ^3.6.0
  firebase_analytics: ^11.3.3
  firebase_messaging: ^15.1.3
  firebase_crashlytics: ^4.1.3
```

### 4.2. Initialize
```dart
// main.dart
await Firebase.initializeApp();
await FirebaseAnalytics.instance.logAppOpen();
FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
```

### 4.3. Wrapper Helper
```dart
class Analytics {
  static Future<void> track(String event, [Map<String, Object?>? props]) async {
    if (kDebugMode) print('[analytics] $event $props');
    await FirebaseAnalytics.instance.logEvent(
      name: event,
      parameters: props?.cast<String, Object>(),
    );
  }

  static Future<void> setUser(String? userIdHash) async {
    await FirebaseAnalytics.instance.setUserId(id: userIdHash);
  }

  static Future<void> setProperty(String name, String value) async {
    await FirebaseAnalytics.instance.setUserProperty(name: name, value: value);
  }
}

// Usage
Analytics.track('sj_created', {'supplier_code': 'SUP-A1', 'plant_code': 'PLT-MLG-01'});
```

### 4.4. Privacy
- Set user ID = **SHA-256 hash** dari userId, **bukan** raw userId. Correlation aman, PII terlindungi.
- Jangan set user property untuk data sensitive (nama, phone).

---

## 5. Push Token & Notifikasi

> **Fakta backend (verifikasi 2026-08-22)**: backend hanya **menyimpan** push token di `user_session.push_token`. Backend **belum mengirim** push FCM/APNs ke device. Semua notifikasi saat ini disampaikan via **polling `GET /notifications`** dari app. Akuisisi token FCM tetap dilakukan (disimpan backend) sebagai persiapan push di Fase future — lihat §5.4.

### 5.1. Akuisisi Token FCM

```dart
final token = await FirebaseMessaging.instance.getToken();
// Kirim ke server setelah login (lihat 5.2)
```

### 5.2. Register / Unregister Token

**Endpoint**: `POST /mobile/push-register` (base URL: `https://ohmes.fzdev.my.id/api/v1`).

Body:

```json
{
  "pushToken": "<fcm-token>",
  "action": "register",
  "sessionId": "<uuid-opsional>"
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `pushToken` | string (min 1) | Token FCM dari `FirebaseMessaging.getToken()` |
| `action` | `register` \| `unregister` | `register` = simpan token di sesi mobile user; `unregister` = hapus token (wajib saat logout) |
| `sessionId` | uuid, opsional | Diterima backend, **saat ini tidak dipakai** — update berdasar `userId` + `deviceType=MOBILE` |

Response: `{ "success": true, "action": "register" }`. Error: `VALIDATION_ERROR` (400), `PUSH_REGISTER_FAILED` (500).

```dart
Future<void> registerPushToken(String token) async {
  await api.post('/mobile/push-register', {
    'pushToken': token,
    'action': 'register',
  });
  Analytics.track('push_token_registered', {'device_platform': platform});
}

Future<void> unregisterPushToken() async {
  final token = await FirebaseMessaging.instance.getToken();
  if (token == null) return;
  await api.post('/mobile/push-register', {
    'pushToken': token,
    'action': 'unregister',
  });
  Analytics.track('push_token_unregistered');
}
```

Panggil `unregisterPushToken()` saat logout — token di sesi lama harus dihapus.

### 5.3. Polling Notifikasi (implementasi saat ini)

**Endpoint**: `GET /notifications` (JWT). Response:

```json
{
  "data": [
    {
      "shiftId": "…",
      "plantId": "…",
      "machineId": "MKR-01",
      "reportDate": "2026-08-22",
      "endedAt": "2026-08-22T08:00:00Z",
      "pendingHours": 3
    }
  ],
  "total": 1
}
```

Isi saat ini (dari `src/app/api/v1/notifications/route.ts`): shift berstatus `COMPLETED` yang **berakhir > 2 jam lalu dan belum di-approve** (masih `COMPLETED`), dalam plant scope user — untuk supervisor.

**Aturan polling**:
- Interval **60 detik** saat app di foreground + refresh saat app di-resume.
- **Jangan polling di background** (boros baterai) — cukup refresh saat resume.
- Mapping item → kartu notifikasi: "Shift {machineId} menunggu approval {pendingHours} jam".
- Tap → deep link: `ohmes://shifts/{shiftId}` (kalau layar detail shift tersedia di mobile; kalau tidak, buka daftar shift).
- Empty state: "Tidak ada notifikasi" (design system §6.7).
- Saat offline: tampilkan cache polling terakhir + indikator stale.

### 5.4. Fase future: Push FCM (backend belum implement)

Ketika backend mengimplementasikan pengiriman push (token sudah siap tersimpan di `user_session.push_token`), handler berikut aktif:

```dart
// Foreground
FirebaseMessaging.onMessage.listen((message) {
  showInAppBanner(message.notification?.title, message.notification?.body);
});

// Background
@pragma('vm:entry-point')
Future<void> _backgroundHandler(RemoteMessage message) async {
  // Firebase auto-handles notification display
}

FirebaseMessaging.onBackgroundMessage(_backgroundHandler);

// Tap notification saat app closed/background
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  final data = message.data;
  if (data['type'] == 'shift_approval_pending') {
    Navigator.pushNamed(context, '/shifts/${data['shift_id']}');
  }
});
```

**Jangan aktifkan handler di atas sebelum backend benar-benar mengirim push** — saat ini hanya menghasilkan noise.

---

## 6. Tipe Notifikasi

### 6.1. Implementasi saat ini (polling `GET /notifications`)

| Tipe | Sumber | Target audience | Priority |
|---|---|---|---|
| `shift_approval_pending` | Shift COMPLETED > 2 jam belum APPROVED (polling) | Supervisor pabrik | HIGH |

### 6.2. Rencana push FCM (belum diimplementasikan backend)

| Type | Trigger dari backend | Target audience | Priority |
|---|---|---|---|
| `session_revoked` | SUPERADMIN revoke sesi | Affected user | CRITICAL |
| `handoff_claimed` | Shift baru claim handoff | Ex-ketua kecer | LOW |
| `dispute_created` | Discrepancy count pack | Supervisor pabrik | MEDIUM |
| `receiving_tsg_new` | Gudang inbound receive baru | Operator kecer aktif | LOW |
| `system_maintenance` | Scheduled maintenance | Semua user | INFO |

### 6.3. Payload Standard (untuk Fase future saat push diimplementasikan backend)

```json
{
  "notification": {
    "title": "Shift menunggu approval",
    "body": "Shift MKR-01 sudah 2 jam menunggu approval Anda."
  },
  "data": {
    "type": "shift_approval_pending",
    "shift_id": "shf_2b9f1a",
    "plant_code": "PLT-MLG-01",
    "deep_link": "ohmes://shifts/shf_2b9f1a"
  },
  "android": {
    "priority": "high"
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": "default",
        "badge": 1
      }
    }
  }
}
```

### 6.4. Deep Link
Tap notification → open specific screen. Format sama dengan QR: `ohmes://<screen>/<id>`.

---

## 7. Notification Preferences (Fase future)

User bisa disable notification per type dari setting:
- Toggle per type.
- Quiet hours (mis. 22:00-05:00 tidak notify low-priority).
- Sound / vibration preferences.

Untuk sekarang: minimal setting (on/off polling notifikasi).

---

## 8. Testing Analytics

### 8.1. Debug Mode
```bash
# Android
adb shell setprop debug.firebase.analytics.app com.hummergroup.mes
```

Buka Firebase console → DebugView → verify events masuk realtime.

### 8.2. Event Validation Checklist
- [ ] Event fired sesuai spec.
- [ ] Props tidak include PII.
- [ ] Value dibulatkan / bucketed kalau numeric (bukan raw untuk anonymity).
- [ ] User property set setelah login.
- [ ] Session end saat logout.

---

## 9. Compliance

- Semua tracking taat [`/docs/22-compliance-pdp.md`](../22-compliance-pdp.md).
- User dinotifikasi tentang tracking di privacy notice onboarding.
- User bisa request data export (termasuk analytics event) via DPO.
- Analytics retention di Firebase: 14 bulan default (max 26 bulan).

---

## 10. Dashboard Analytics (untuk PM)

Firebase console dashboard untuk track:
- **Adoption**: DAU / WAU / MAU.
- **Retention**: cohort retention per bulan.
- **Feature usage**: top event, funnel per feature.
- **Performance**: crash-free users, ANR rate.
- **Business proxies**: `sj_created` dan `receiving_from_sj` per hari (backend juga track).

Additional Firebase capabilities:
- Remote Config: untuk feature flag dinamis tanpa deploy.
- A/B Testing: variant test (Fase 4+).

---

## 11. Referensi

- [`02-auth-session.md`](./02-auth-session.md) — alur login/session (sessionId, SESSION_EXISTS).
- [`03-api-contract.md`](./03-api-contract.md) — endpoint yang trigger event (mobile/push-register, notifications, supplier-sj, tsg-receiving/from-sj).
- [`09-design-system.md`](./09-design-system.md) — komponen UI (badge status SJ, pool counter, kartu stok).
- [`/docs/22-compliance-pdp.md`](../22-compliance-pdp.md) — privacy compliance.
- [Firebase Analytics Flutter](https://firebase.google.com/docs/analytics/get-started?platform=flutter).
- [FCM Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/client).
