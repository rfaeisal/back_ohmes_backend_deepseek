# 07 · Analytics Events & Push Notification

Panduan tracking event untuk mobile app + spec push notification (FCM Android + APNs iOS). Tim mobile implement events yang mendukung analytics + observability tanpa mengumpulkan data pribadi berlebihan (PDP compliance).

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

**Rekomendasi**: Firebase Analytics untuk Fase 3 (paling standard, gratis sampai 500 event/user/day).

---

## 3. Event Catalog

Convention naming: `<domain>_<action>` snake_case. Max 40 karakter (Firebase limit).

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

### 3.2. Shift Lifecycle

| Event | Trigger | Props |
|---|---|---|
| `shift_start_attempted` | User submit start shift form | `machine_type`, `product_code`, `member_count` |
| `shift_started` | 201 response | `shift_id_hash`, `has_handoff: boolean` |
| `shift_start_failed` | 4xx error | `error_code` |
| `shift_end_attempted` | User submit end shift form | `shift_duration_minutes`, `box_count` |
| `shift_ended` | Status → COMPLETED | `has_handoff: boolean`, `waste_lunas_count`, `waste_pending_count` |
| `shift_end_blocked_active_box` | 409 SHIFT_HAS_ACTIVE_BOX | `active_box_count` |

### 3.3. Boks & Produksi

| Event | Trigger | Props |
|---|---|---|
| `box_qr_scanned` | Scan QR TSG box | `success: boolean`, `scan_source` (`scanner`/`manual`) |
| `box_opened` | 201 POST /shifts/:id/boxes | `box_number`, `is_partial`, `used_fifo_default: boolean` |
| `box_fifo_override` | User pilih non-FIFO boks | (no additional props) |
| `box_open_failed` | 400 error | `error_code` (mis. `TSG_BOX_NOT_AVAILABLE`) |
| `box_weighed` | 200 PATCH /boxes/:id | `yield_indicator` (`NORMAL`/`WARNING`), `duration_since_open_minutes` |
| `box_weigh_out_of_range` | Yield WARNING | `yield_pct_bucket` (`<90`/`90-110`/`115-125`/`>125`) |
| `consumption_logged` | POST /boxes/:id/consumption | `item_code`, `quantity` |
| `downtime_logged` | POST /shifts/:id/downtime | `category`, `duration_minutes` |
| `maintenance_logged` | POST /shifts/:id/maintenance | `sparepart_code`, `quantity` |

### 3.4. Handoff

| Event | Trigger | Props |
|---|---|---|
| `handoff_prompt_shown` | End shift dengan boks aktif | (no props) |
| `handoff_created` | 201 POST /shifts/:id/handoff | `sisa_tsg_kg_bucket`, `batangan_sementara_kg_bucket` |
| `handoff_auto_claimed` | Start shift dengan handoff | (no props) |

### 3.5. WMS Inbound (Gudang)

| Event | Trigger | Props |
|---|---|---|
| `receiving_created` | POST /tsg-receiving success | `box_count`, `supplier_code` |
| `receiving_failed` | 4xx error | `error_code` |
| `inventory_writeoff` | PATCH writeoff | `reason_category` |

### 3.6. UX / Performance

| Event | Trigger | Props |
|---|---|---|
| `screen_view` | Navigation | `screen_name` |
| `api_slow` | Request > 2 detik | `endpoint`, `duration_ms` |
| `api_error` | 5xx / network fail | `endpoint`, `error_code`, `retry_count` |
| `offline_queued` | Request masuk local queue | `endpoint`, `queue_size` |
| `offline_synced` | Queue di-flush online | `synced_count`, `queue_duration_seconds` |
| `app_crash` | Auto (via Sentry/Firebase Crashlytics) | (stack trace) |

### 3.7. Business Metrics (untuk PM insights)

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
Analytics.track('shift_started', {'has_handoff': true, 'shift_id_hash': hash});
```

### 4.4. Privacy
- Set user ID = **SHA-256 hash** dari userId, **bukan** raw userId. Correlation aman, PII terlindungi.
- Jangan set user property untuk data sensitive (nama, phone).

---

## 5. Push Notification (FCM + APNs)

### 5.1. Setup

**Android (FCM)**:
- Firebase project sudah aktif (Analytics).
- Firebase Cloud Messaging enabled.
- `google-services.json` di `android/app/`.

**iOS (APNs)**:
- Apple Developer account.
- APNs authentication key upload ke Firebase.
- `GoogleService-Info.plist` di iOS project.
- Enable "Push Notifications" capability di Xcode.
- Enable "Background Modes → Remote notifications".

### 5.2. Get Device Token

```dart
final token = await FirebaseMessaging.instance.getToken();
// Kirim ke server saat login: POST /auth/me/register-push-token
// Server simpan di user_session.push_token
```

### 5.3. Handle Foreground Message
```dart
FirebaseMessaging.onMessage.listen((message) {
  // Show in-app banner atau local notification
  showInAppBanner(message.notification?.title, message.notification?.body);
});
```

### 5.4. Handle Background Message
```dart
@pragma('vm:entry-point')
Future<void> _backgroundHandler(RemoteMessage message) async {
  // Firebase auto-handles notification display
  // Kalau butuh custom action (mis. update local state), handle di sini
}

FirebaseMessaging.onBackgroundMessage(_backgroundHandler);
```

### 5.5. Handle Notification Tap
```dart
FirebaseMessaging.onMessageOpenedApp.listen((message) {
  // User tap notification saat app closed/background
  final data = message.data;
  if (data['type'] == 'shift_approval_pending') {
    Navigator.pushNamed(context, '/shifts/${data['shift_id']}');
  }
});
```

---

## 6. Notification Types

| Type | Trigger dari backend | Target audience | Priority | Sample payload |
|---|---|---|---|---|
| `shift_approval_pending` | Shift COMPLETED > 2 jam belum APPROVED | Supervisor pabrik | HIGH | `{ shift_id, plant_code, waiting_since }` |
| `session_revoked` | SUPERADMIN revoke sesi | Affected user | CRITICAL | `{ reason, revoked_by }` |
| `handoff_claimed` | Shift baru claim handoff | Ex-ketua kecer | LOW | `{ shift_new_id }` |
| `dispute_created` | Discrepancy count pack | Supervisor pabrik | MEDIUM | `{ shift_id, expected, actual }` |
| `receiving_tsg_new` | Gudang inbound receive baru | Operator kecer aktif | LOW | `{ count, total_kg }` |
| `system_maintenance` | Scheduled maintenance | Semua user | INFO | `{ start_at, duration_minutes }` |

### 6.1. Payload Standard
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

### 6.2. Deep Link
Tap notification → open specific screen. Format sama dengan QR: `ohmes://<screen>/<id>`.

---

## 7. Notification Preferences (Fase future)

User bisa disable notification per type dari setting:
- Toggle per type.
- Quiet hours (mis. 22:00-05:00 tidak notify low-priority).
- Sound / vibration preferences.

Fase 3 awal: minimal setting (on/off all).

---

## 8. Testing Analytics

### 8.1. Debug Mode
```bash
# Android
adb shell setprop debug.firebase.analytics.app com.hummer.mes
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
- **Business proxies**: shift_started per hari (backend juga track).

Additional Firebase capabilities:
- Remote Config: untuk feature flag dinamis tanpa deploy.
- A/B Testing: variant test (Fase 4+).

---

## 11. Referensi

- [`01-app-spec.md`](./01-app-spec.md) §7 — push notification implementation.
- [`02-api-contract.md`](./02-api-contract.md) — endpoint yang trigger event.
- [`/docs/22-compliance-pdp.md`](../22-compliance-pdp.md) — privacy compliance.
- [Firebase Analytics Flutter](https://firebase.google.com/docs/analytics/get-started?platform=flutter).
- [FCM Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/client).
