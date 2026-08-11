# 09 · Testing & Device Matrix

Spec testing untuk aplikasi mobile Flutter — cover automated test, manual QA di physical device, dan accessibility testing.

**Prinsip**: tablet fisik pabrik kondisi bervariasi (baterai lemah, cahaya matahari, sarung tangan). Test hanya di simulator = pasti gagal di lapangan.

---

## 1. Testing Pyramid Mobile

```
              ┌─────────────────┐
              │      E2E        │  ← Patrol / Flutter integration test
              │   (App-wide)    │
              ├─────────────────┤
              │   Widget Test   │  ← flutter_test standard
              │  (Component)    │
              ├─────────────────┤
              │      Unit       │  ← Vitest/Dart unit test
              │  (Logic pure)   │
              └─────────────────┘
```

Rasio target: 60% unit / 30% widget / 10% E2E.

---

## 2. Unit Test

### 2.1. Scope
- Business logic: local queue manager, retry backoff, HMAC verifier.
- Data model: JSON parsing, validation.
- Utility: date formatter, currency, weight formatter.

### 2.2. Tools
- `flutter_test` — built-in.
- `mockito` — mock dependency.
- `patrol` (opsional) — advanced testing.

### 2.3. Contoh
```dart
// test/lib/queue/local_queue_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mes_hummer/queue/local_queue.dart';

void main() {
  test('should retry with exponential backoff', () async {
    final queue = LocalQueue();
    final delays = [];
    await queue.retry(fn: () => Future.error('fail'), onDelay: (d) => delays.add(d));
    expect(delays, orderedEquals([1, 5, 30, 300]));  // seconds
  });

  test('should dedupe by idempotency key', () async {
    final queue = LocalQueue();
    await queue.enqueue(key: 'k1', request: request1);
    await queue.enqueue(key: 'k1', request: request2);
    expect(queue.pendingCount, 1);  // second dedup
  });
}
```

### 2.4. Coverage Target
- Business logic: ≥ 80%.
- Widget: ≥ 60%.

---

## 3. Widget Test

### 3.1. Scope
- Component rendering (button, form, modal).
- State transitions.
- User interactions (tap, swipe, input).

### 3.2. Contoh
```dart
testWidgets('login button disabled when fields empty', (tester) async {
  await tester.pumpWidget(MyApp(child: LoginScreen()));
  final button = find.byKey(const ValueKey('login_button'));
  expect(tester.widget<ElevatedButton>(button).onPressed, isNull);

  await tester.enterText(find.byKey(const ValueKey('username')), 'user');
  await tester.enterText(find.byKey(const ValueKey('password')), 'pass');
  await tester.pump();

  expect(tester.widget<ElevatedButton>(button).onPressed, isNotNull);
});
```

### 3.3. Snapshot Testing
Untuk visual regression:
- `alchemist` package — golden test.
- Baseline snapshot di `test/golden/`.

---

## 4. E2E Test (Integration Test)

### 4.1. Tools
- `integration_test` — built-in.
- `patrol` — advanced (native modal, permission, deep link).

### 4.2. Scenarios Prioritas Fase 3

1. **Login → Start Shift → Open Boks → Weigh → End Shift**.
2. **Login mobile device kedua → 409 SESSION_EXISTS**.
3. **Scan QR mesin → auto-fill start shift form**.
4. **Scan QR TSG boks → open boks tanpa manual input**.
5. **Offline: put device airplane mode → do action → back online → sync**.
6. **SUPERADMIN revoke session → app force logout**.

### 4.3. Contoh
```dart
testWidgets('E2E: login + start shift', (tester) async {
  await tester.pumpWidget(MyApp());

  // Login
  await tester.enterText(find.byKey(const ValueKey('username')), 'alfi');
  await tester.enterText(find.byKey(const ValueKey('password')), 'test123');
  await tester.tap(find.text('Login'));
  await tester.pumpAndSettle();

  // Home screen
  expect(find.text('Selamat datang'), findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('start_shift_button')));
  await tester.pumpAndSettle();

  // Fill start shift form
  await tester.tap(find.text('Shift Malam'));
  await tester.tap(find.text('Hummer STD'));
  // ... add members
  await tester.tap(find.text('Mulai Shift'));
  await tester.pumpAndSettle();

  expect(find.text('Shift Aktif'), findsOneWidget);
});
```

---

## 5. Device Matrix

### 5.1. Physical Device untuk Manual QA

| Device | Priority | Scenario Fokus |
|---|---|---|
| **Samsung Galaxy A12** (2GB RAM, Android 12, 6.5") | HIGH | Operator budget device — mayoritas |
| **Xiaomi Redmi 10** (4GB, Android 13, 6.5") | HIGH | Alt budget |
| **Samsung Galaxy A54** (6GB, Android 14, 6.4") | MEDIUM | Operator mid-tier |
| **Samsung Galaxy Tab A8** (10", Android 12) | LOW | Backup untuk tablet mode |
| **iPhone 8** (2GB, iOS 16.7, 4.7") | LOW | Supervisor older device |
| **iPhone 13** (4GB, iOS 17, 6.1") | MEDIUM | Supervisor standard |
| **iPhone 15** (6GB, iOS 17, 6.1") | LOW | Executives |

Minimal test: 2 Android budget + 1 Android mid + 1 iPhone per release.

### 5.2. OS Version Support

- **Android**: min API 26 (Android 8.0 Oreo), target latest.
- **iOS**: min iOS 13, target latest.

Test di:
- OS min (Android 8, iOS 13).
- OS current (latest release).
- OS current-1.

### 5.3. Screen Sizes

Support:
- **Small** (< 5.5"): iPhone SE, Android compact.
- **Medium** (5.5-6.5"): mainstream.
- **Large** (> 6.5"): flagship + tablet 7-10".

Layout responsive via `LayoutBuilder`. Test both portrait & landscape.

---

## 6. Test Environment Setup

### 6.1. Local Test
```bash
# All tests
flutter test

# Coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html

# Integration test (device connected)
flutter test integration_test/
```

### 6.2. CI Test (Codemagic / GitHub Actions)
Automated per PR:
- `flutter test` (unit + widget).
- Build validation.
- Golden test comparison.

E2E di CI:
- Firebase Test Lab (Android) — real device farm.
- BrowserStack App Live — cross-platform.

### 6.3. Firebase Test Lab
```bash
gcloud firebase test android run \
  --type instrumentation \
  --app app-release.apk \
  --test app-test.apk \
  --device model=SamsungA12,version=30,locale=id,orientation=portrait
```

Cost: ~$5/device/hour. Recommended untuk pre-release smoke test.

---

## 7. Manual QA Test Cases (Fase 3 Release)

### 7.1. Auth & Session
- [ ] Login sukses dengan credential valid.
- [ ] Login gagal dengan password salah → 401 clear message.
- [ ] Login SUPERADMIN dengan OTP.
- [ ] Login mobile device kedua → 409 modal + contact IT button works.
- [ ] Refresh token auto-renewal.
- [ ] Session revoke oleh SUPERADMIN → app logout + banner.
- [ ] Multi-scope: pilih active scope saat login pertama.
- [ ] Switch scope tanpa logout.

### 7.2. Shift Lifecycle
- [ ] Start shift dengan pilih produk + tim.
- [ ] Handoff detected → banner muncul.
- [ ] Add member during shift.
- [ ] Remove member + reason.
- [ ] End shift dengan waste 4 kategori.
- [ ] End shift dengan boks aktif → prompt handoff.
- [ ] Handoff dengan timbang sisa TSG + batangan.

### 7.3. Boks & Produksi
- [ ] Scan QR machine → prefill start shift.
- [ ] Scan QR boks TSG → auto-fill data receiving.
- [ ] Manual pick boks dari FIFO list (kalau QR gagal).
- [ ] FIFO override butuh permission (test dengan operator biasa vs Ketua).
- [ ] Timbang boks → yield calculated + indicator warna.
- [ ] Yield out of range → prompt reason.
- [ ] Log consumables event.
- [ ] Log downtime event.
- [ ] Log maintenance event.

### 7.4. Offline & Sync
- [ ] Airplane mode → input boks → local queue.
- [ ] Back online → auto-sync + no duplication.
- [ ] Queue > 10 items → UI menunjukkan pending count.
- [ ] Kill app dengan pending queue → resume + sync setelah reopen.
- [ ] Force close network mid-request → retry backoff correct.

### 7.5. UI/UX
- [ ] Tap target ≥ 48dp (test dengan sarung tangan latex).
- [ ] Text readable di layar 5.5" di kondisi cahaya matahari langsung.
- [ ] Contrast AA ratio (test dengan Flutter Inspector).
- [ ] Loading state visible untuk async action.
- [ ] Error message actionable (bukan generic "Error occurred").
- [ ] Empty state design ada untuk semua list.
- [ ] Modal full-screen di device kecil.

### 7.6. Push Notification
- [ ] Foreground: in-app banner.
- [ ] Background: system tray notification.
- [ ] Killed app: notif still received.
- [ ] Tap notif → deep link ke correct screen.
- [ ] Multiple notif → notification group.

### 7.7. Battery & Performance
- [ ] Battery drain acceptable — < 5% per jam saat aktif.
- [ ] App size < 60 MB (Android AAB) / 100 MB (iOS IPA).
- [ ] Cold start < 3 detik.
- [ ] Screen transition < 300ms.
- [ ] No memory leak (test dengan Flutter DevTools memory profiler).

---

## 8. Accessibility Testing

### 8.1. Screen Reader
Test dengan **TalkBack** (Android) & **VoiceOver** (iOS):
- [ ] Semua interactive element punya label semantic.
- [ ] Focus order logical.
- [ ] Form input punya hint.
- [ ] Toast diumumkan.
- [ ] Modal announce saat open.

### 8.2. Font Scaling
- [ ] UI usable di 200% font scale (Android system setting).
- [ ] iOS Dynamic Type support.
- [ ] Tidak ada text terpotong / overlap.

### 8.3. Color-Only Information
- [ ] Yield indicator: warna + icon + text label (bukan warna saja).
- [ ] Error state: warna + icon.
- [ ] Untuk operator dengan Colorblindness (Deuteranopia paling common di ID).

### 8.4. Motion Sensitivity
- [ ] Support `disableAnimations` system flag.
- [ ] Reduce parallax kalau OS setting off.

---

## 9. Security Testing

### 9.1. Static Analysis
- `flutter analyze` — Dart linter.
- `pnpm audit` (via node scripts) — dependency vulnerability.

### 9.2. Runtime Security
- [ ] Certificate pinning (untuk cegah MITM di WiFi tidak aman).
- [ ] Root/jailbreak detection (warn user, tapi tidak block).
- [ ] Secure storage: verifikasi token di keychain, bukan SharedPreferences plain.
- [ ] Screenshot/screen record blocked di halaman sensitive (login, SUPERADMIN action).

### 9.3. Penetration Test
Sebelum production launch, engage 3rd party pentest firm untuk mobile app security assessment.

---

## 10. Performance Benchmark

Metric target di device budget (Samsung A12):

| Metric | Target |
|---|---|
| App cold start | < 3s |
| App warm start | < 1s |
| Login → home | < 2s |
| QR scan → resolve | < 1.5s |
| Open boks (with API) | < 800ms |
| Timbang boks (with API) | < 800ms |
| Local queue flush 10 items | < 5s |

Tools:
- Flutter DevTools performance profiler.
- Firebase Performance Monitoring — trace real user metrics.

---

## 11. Release Gate

Sebelum promote ke Production track, wajib:

- [ ] Unit + widget test pass, coverage ≥ 60%.
- [ ] E2E scenarios ≥ 6 golden path pass.
- [ ] Manual QA checklist §7 semua checked.
- [ ] Accessibility test §8 pass.
- [ ] Security scan §9 clean.
- [ ] Performance benchmark §10 tercapai.
- [ ] No P1/P2 bug open.

---

## 12. Test Data / Fixtures

- Test user credentials di `test/fixtures/users.dart`.
- Sample API responses di `test/fixtures/responses/`.
- Mock backend: `mockoon` atau `msw` (kalau backend belum ready).

Prod backend URL **tidak boleh** dipakai untuk test. Selalu staging (`staging.mes.hummer.example`).

---

## 13. Referensi

- [`01-app-spec.md`](./01-app-spec.md) §11 — testing checklist bisnis.
- [`06-design-system.md`](./06-design-system.md) — sizing untuk accessibility.
- [`08-deployment-store.md`](./08-deployment-store.md) — release process.
- [Flutter Testing docs](https://docs.flutter.dev/testing).
- [Patrol](https://patrol.leancode.co/) — advanced integration testing.
