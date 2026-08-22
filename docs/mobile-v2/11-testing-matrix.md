# 11 · Testing & Device Matrix (Mobile v2)

Spec testing untuk aplikasi mobile Flutter (rebuild v2) — cover automated test, manual QA di physical device, dan accessibility testing.

> **Sumber kebenaran**: kode aktual backend `back_ohmes_backend_deepseek` (diverifikasi 2026-08-22). Pack ini menggantikan `../mobile-team/09-testing-device-matrix.md` (v1.3.0) yang memodelkan alur operator boks-tunggal — **alur produksi shift (start/end shift, buka boks, timbang, HLP, waste) sudah bukan scope mobile** (tablet web `/tablet`). Skenario QA di dokumen ini untuk scope mobile v2: **SJ supplier, receiving, monitoring, offline sync, auth/session**.

**Prinsip**: perangkat petugas lapangan kondisi bervariasi (baterai lemah, cahaya matahari, tangan kotor, sinyal 4G drop). Test hanya di simulator = pasti gagal di lapangan.

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
              │      Unit       │  ← Dart unit test
              │  (Logic pure)   │
              └─────────────────┘
```

Rasio target: 60% unit / 30% widget / 10% E2E.

---

## 2. Unit Test

### 2.1. Scope
- Business logic: local queue manager (`pending_ops`), retry backoff, idempotency key generator (`<prefix resmi>-<uuid>`), session/scope store.
- Refresh token single-flight queue — cegah 2 request refresh paralel (salah satu pasti `REFRESH_TOKEN_INVALID`).
- Data model: JSON parsing, validation (response login/refresh, resolve QR, sync batch).
- Utility: date formatter, currency, weight formatter.

> Catatan v2: **HMAC verifier tidak ada** — client tidak boleh mem-parse/verifikasi HMAC QR (lihat `04-qr-strategy.md`). Yang di-unit-test adalah *pass-through* URI utuh ke `POST /qr/resolve`.

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
    expect(delays, orderedEquals([5, 15, 60, 300]));  // seconds, cap 15m
  });

  test('should dedupe by idempotency key', () async {
    final queue = LocalQueue();
    await queue.enqueue(key: 'sj-create-550e8400-...', request: request1);
    await queue.enqueue(key: 'sj-create-550e8400-...', request: request2);
    expect(queue.pendingCount, 1);  // key sama = satu item
  });

  test('refresh single-flight: 2 refresh paralel = 1 request', () async {
    final rf = RefreshSingleFlight();
    final r1 = rf.run(); final r2 = rf.run();
    await Future.wait([r1, r2]);
    expect(rf.requestCount, 1);
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

  await tester.enterText(find.byKey(const ValueKey('username')), 'petugassj');
  await tester.enterText(find.byKey(const ValueKey('password')), '12345678');
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

### 4.2. Scenarios Prioritas (Mobile v2)

1. **SJ: login `petugassj` → buat SJ (DRAFT) → scan label pool → assign jenis + berat → tandai SHIPPED → verifikasi status di list**.
2. **Receiving: login `gudangin` → scan label boks datang → validasi jumlah vs SJ → `POST /tsg-receiving/from-sj` → login `plantmanager` → approve receiving → boks masuk stok AVAILABLE**.
3. **Monitoring: login `plantmanager` → dashboard plant KPI → stok TSG → approve shift COMPLETED. Cek `area.koordinator` lihat dashboard area**.
4. **Offline: airplane mode → buat SJ (masuk local queue) → online → flush via `POST /mobile/sync` → verifikasi tidak ada duplikat (idempotency replay)**.
5. **Single-session: login device kedua dengan akun sama → `409 SESSION_EXISTS` → modal info device lama muncul**.
6. **Refresh token rotasi: refresh normal → panggil refresh lagi pakai token LAMA → `401 REFRESH_TOKEN_INVALID` → app ke login**.
7. **Scope switch: user multi-assignment → pilih scope saat login → `POST /auth/switch-scope` → data SJ/stok/dashboard berubah sesuai scope baru tanpa logout**.
8. **SUPERADMIN revoke session → app force logout + banner**.
9. **QR resolve: scan label `tsg_box` → kirim URI utuh → `canAccess:false` untuk plant lain tetap 200 — app tampilkan pesan, jangan lanjut**.

### 4.3. Contoh
```dart
testWidgets('E2E: login petugas area + buat SJ', (tester) async {
  await tester.pumpWidget(MyApp());

  // Login
  await tester.enterText(find.byKey(const ValueKey('username')), 'petugassj');
  await tester.enterText(find.byKey(const ValueKey('password')), '12345678');
  await tester.tap(find.text('Login'));
  await tester.pumpAndSettle();

  // Home screen
  expect(find.text('Surat Jalan'), findsOneWidget);
  await tester.tap(find.byKey(const ValueKey('create_sj_button')));
  await tester.pumpAndSettle();

  // Isi form SJ (supplier + jumlah label pool)
  await tester.enterText(find.byKey(const ValueKey('sj_supplier')), 'UD Makmur');
  await tester.tap(find.text('Buat SJ'));
  await tester.pumpAndSettle();

  // Status awal DRAFT
  expect(find.text('DRAFT'), findsOneWidget);
});
```

---

## 5. Device Matrix

### 5.1. Physical Device untuk Manual QA

| Device | Priority | Scenario Fokus |
|---|---|---|
| **Samsung Galaxy A12** (2GB RAM, Android 12, 6.5") | HIGH | Petugas lapangan budget device — mayoritas |
| **Xiaomi Redmi 10** (4GB, Android 13, 6.5") | HIGH | Alt budget |
| **Samsung Galaxy A54** (6GB, Android 14, 6.4") | MEDIUM | Petugas mid-tier |
| **Samsung Galaxy Tab A8** (10", Android 12) | LOW | Cadangan — tablet bukan target utama v2 |
| **iPhone 8** (2GB, iOS 16.7, 4.7") | LOW | Manager/koordinator older device |
| **iPhone 13** (4GB, iOS 17, 6.1") | MEDIUM | Manager/koordinator standard |
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

## 7. Manual QA Test Cases (Mobile v2 Release)

### 7.1. Auth & Session
- [ ] Login sukses dengan credential valid (`petugassj` / `12345678`).
- [ ] Login gagal dengan password salah → 401 clear message.
- [ ] Login SUPERADMIN dengan OTP (`000000` — bypass; password dari env `SUPERADMIN_DEFAULT_PASSWORD`).
- [ ] Login mobile device kedua → 409 modal + info device lama + contact IT button works.
- [ ] Refresh token auto-renewal (~1 menit sebelum expire; access token JWT 15 menit, SUPERADMIN 5 menit).
- [ ] **Refresh token rotasi**: refresh sukses → coba refresh lagi dengan token LAMA → 401 `REFRESH_TOKEN_INVALID` → app redirect ke login.
- [ ] **2 request refresh bersamaan** → single-flight: satu sukses, satu dapat `REFRESH_TOKEN_INVALID` (harus di-serialkan sisi app).
- [ ] Session revoke oleh SUPERADMIN → app logout + banner.
- [ ] Multi-scope: pilih active scope saat login pertama (picker muncul bila >1 assignment).
- [ ] **Switch scope** tanpa logout → token baru + data scope-dependent (SJ, stok TSG, dashboard) ke-refresh.
- [ ] Logout → push token di-`unregister` (`POST /mobile/push-register` action `unregister`), `deviceId` tetap tersimpan.

### 7.2. Flow Surat Jalan (AREA_SJ_OFFICER — petugassj)
- [ ] Buat SJ baru → status DRAFT, nomor SJ tersedia.
- [ ] Scan label pool → muncul info label (boxCode, labelStatus AVAILABLE) → assign ke SJ.
- [ ] Assign jenis (`tsgType`: REGULER/MILD/PUTIHAN) + input berat (`supplierWeightKg`) — satu langkah `POST /supplier-sj/:id/boxes/weigh`.
- [ ] Scan label yang **sudah terikat SJ lain** → error `LABEL_ALREADY_ASSIGNED` dengan pesan jelas.
- [ ] Scan label yang sudah di-void → error `LABEL_VOIDED` ("label hilang/rusak").
- [ ] Void label (`POST /supplier-sj/labels/:boxCode/void`) → label tidak bisa dipakai lagi.
- [ ] Timbang saat SJ sudah SHIPPED → error `SJ_NOT_DRAFT`.
- [ ] Tandai SHIPPED sebelum semua boks tertimbang → ditolak (semua boks wajib sudah tertimbang).
- [ ] Tandai SHIPPED saat semua lengkap → status SHIPPED + `shippedAt` terisi.
- [ ] Filter/cari SJ di list (semua status).

### 7.3. Receiving (GUDANG_INBOUND — gudangin)
- [ ] Scan label boks datang → resolve `tsg_box` → info boks + SJ asal.
- [ ] Validasi jumlah boks vs SJ (verifiedBoxCodes opsional).
- [ ] `POST /tsg-receiving/from-sj` → receiving dibuat (berat dari timbangan supplier, tanpa timbang ulang) → status RECEIVED.
- [ ] Receiving belum di-approve → stok belum masuk AVAILABLE.
- [ ] Login `plantmanager` → approve receiving (`POST /tsg-receiving/:id/approve`) → boks masuk stok TSG AVAILABLE.
- [ ] User tanpa permission approve (mis. `gudangin`) → 403 + pesan jelas.
- [ ] List receiving + status (PENDING/APPROVED).

### 7.4. Monitoring (PLANT_MANAGER / AREA_COORDINATOR / AREA_QA)
- [ ] Dashboard plant KPI (`GET /dashboards/plant/:plantId/kpi`) — `plantmanager`, `area.koordinator`, `areaqa`.
- [ ] Dashboard area KPI (`GET /dashboards/area/:regionId/kpi`) — `area.koordinator`, `areaqa`.
- [ ] Stok TSG available (`GET /tsg-inventory/available`) — filter/urut FIFO.
- [ ] Approve shift COMPLETED (`POST /shifts/:id/approve`) — `plantmanager`; cek notifikasi polling `GET /notifications` menampilkan shift menunggu approval >2 jam.
- [ ] Aksi ringan PLANT_MANAGER: writeoff (`PATCH /tsg-inventory/:id/writeoff`), transfer (`POST /tsg-transfers`), FIFO override (wajib alasan + tercatat audit).
- [ ] Read-only `areaqa`: tombol aksi tidak muncul (permission-based UI).

### 7.5. Offline & Sync
- [ ] Airplane mode → buat SJ → masuk local queue (`pending_ops`) + badge pending count.
- [ ] Back online → auto-flush via `POST /mobile/sync` (batch 1–50) → item terhapus dari queue, tidak ada duplikat (idempotencyKey sama → server replay).
- [ ] Queue > 10 items → UI menunjukkan pending count.
- [ ] Kill app dengan pending queue → resume + flush setelah reopen.
- [ ] Force close network mid-request → retry backoff (5s → 15s → 60s → 5m → 15m cap).
- [ ] Item queue > 7 hari (max age) → ditandai DROPPED + operator diberi tahu input ulang.
- [ ] Sync response 401 → queue dikosongkan + force logout dengan konfirmasi "N pekerjaan belum tersinkron".
- [ ] Item dengan format idempotencyKey invalid → tidak di-dedup server (risiko duplikat) — pastikan generator selalu output `<prefix>-<uuid>` valid.

### 7.6. UI/UX
- [ ] Tap target ≥ 48dp (test dengan sarung tangan).
- [ ] Text readable di layar 5.5" di kondisi cahaya matahari langsung.
- [ ] Contrast AA ratio (test dengan Flutter Inspector).
- [ ] Loading state visible untuk async action.
- [ ] Error message actionable (bukan generic "Error occurred").
- [ ] Empty state design ada untuk semua list.
- [ ] Modal full-screen di device kecil (modal `409 SESSION_EXISTS` khususnya).
- [ ] Scan feedback: beep/getar saat QR tidak dikenali.

### 7.7. Push Notification (status saat ini: polling)
- [ ] Foreground: in-app banner dari polling `GET /notifications` (mis. "shift belum di-approve").
- [ ] Tap banner → deep link ke screen yang benar.
- [ ] `push-register` dipanggil `register` setelah login + dapat FCM token; `unregister` saat logout.
- [ ] (FCM server-side belum ada — jangan test kiriman push; verifikasi token tersimpan via backend).

### 7.8. Battery & Performance
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
- [ ] Indikator status (SJ: DRAFT/SHIPPED/RECEIVED · label: AVAILABLE/ASSIGNED/VOID): warna + icon + text label (bukan warna saja).
- [ ] Error state: warna + icon.
- [ ] Untuk petugas dengan Colorblindness (Deuteranopia paling common di ID).

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
- [ ] Secure storage: verifikasi access + refresh token di flutter_secure_storage, bukan SharedPreferences plain.
- [ ] Screenshot/screen record blocked di halaman sensitive (login, SUPERADMIN action).
- [ ] Token tidak pernah muncul di log (log sanitization).

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
| QR scan → resolve (`POST /qr/resolve`) | < 1.5s |
| Buat SJ (with API) | < 2s |
| Scan label → assign jenis + berat (with API) | < 1.5s |
| Dashboard plant/area load (with API) | < 2s |
| Local queue flush 10 items (`mobile/sync`) | < 5s |

Tools:
- Flutter DevTools performance profiler.
- Firebase Performance Monitoring — trace real user metrics.

---

## 11. Release Gate

Sebelum promote ke Production track, wajib:

- [ ] Unit + widget test pass, coverage ≥ 60%.
- [ ] E2E scenarios §4.2 (minimal 6 golden path) pass.
- [ ] Manual QA checklist §7 semua checked.
- [ ] Accessibility test §8 pass.
- [ ] Security scan §9 clean.
- [ ] Performance benchmark §10 tercapai.
- [ ] No P1/P2 bug open.

---

## 12. Test Data / Fixtures

### 12.1. Test Credentials (production seed — live di `https://ohmes.fzdev.my.id`)

| User | Password | OTP | Role |
|---|---|---|---|
| `petugassj` | `12345678` | `000000` | AREA_SJ_OFFICER |
| `gudangin` | `12345678` | `000000` | GUDANG_INBOUND |
| `plantmanager` | `12345678` | `000000` | PLANT_MANAGER |
| `area.koordinator` | `12345678` | `000000` | AREA_COORDINATOR |
| `areaqa` | `12345678` | `000000` | AREA_QA |
| `admin` | env `SUPERADMIN_DEFAULT_PASSWORD` (tanya backend untuk nilai aktual) | `000000` | SUPERADMIN |

- Test credentials di `test/fixtures/users.dart`.
- Sample API responses di `test/fixtures/responses/`.
- Mock backend: `mockoon` atau `msw` (kalau backend lokal belum jalan); backend lokal = `pnpm dev` + `pnpm db:seed` di repo backend.

### 12.2. Aturan pemakaian environment

- **Test otomatis** wajib ke mock/local backend — jangan pernah ke `https://ohmes.fzdev.my.id`.
- **Manual QA** bisa pakai production dengan **test credentials seed di atas saja** — jangan pakai akun user bisnis nyata, dan jangan buat mutasi yang merusak data produksi (mis. jangan SHIPPED-kan SJ yang asli, jangan void label yang dipakai produksi).
- **Staging belum tersedia** (per snapshot 2026-08-22) — kalau sudah ada, prioritaskan staging untuk QA.

---

## 13. Referensi

- [`00-brief.md`](./00-brief.md) — siapa pengguna mobile v2.
- [`01-rbac-mobile.md`](./01-rbac-mobile.md) — role & permission per endpoint.
- [`02-auth-session.md`](./02-auth-session.md) — single-session, refresh rotation, scope switch.
- [`04-qr-strategy.md`](./04-qr-strategy.md) — QR resolve, `canAccess`, HMAC (jangan parse client).
- [`05-offline-sync.md`](./05-offline-sync.md) — offline queue + kontrak `mobile/sync`.
- [`12-deployment-store.md`](./12-deployment-store.md) — release process.
- [Flutter Testing docs](https://docs.flutter.dev/testing).
- [Patrol](https://patrol.leancode.co/) — advanced integration testing.
