# 12 · Deployment ke Play Store & App Store (Mobile v2)

Panduan submit + release aplikasi mobile Flutter (rebuild v2, live production) ke Google Play Store (Android) dan Apple App Store (iOS).

> **Sumber kebenaran**: kode aktual backend `back_ohmes_backend_deepseek` (diverifikasi 2026-08-22). Dokumen ini menggantikan `../mobile-team/08-deployment-store.md` (v1.3.0). Koreksi utama: **backend TIDAK mengimplementasikan force-update via `X-Client-Version` → 426** — semua klaim itu dihapus.

**Distribusi**: **internal / private**, bukan public listing (karena app internal Hummer Group).

**Base URL produksi**: `https://ohmes.fzdev.my.id` · Staging: *(belum tersedia)*

---

## 1. Distribusi Model

Sistem MES + WMS Hummer = internal enterprise. **Bukan** app konsumer publik. 2 opsi distribusi:

### 1.1. Rekomendasi: **Managed Internal Distribution** (via MDM)

**Rekomendasi utama** untuk petugas lapangan (gudang supplier, receiving, manager):
- Provisioned device (dari IT perusahaan) — bukan personal device petugas.
- MDM (Mobile Device Management): **Google Workspace**, **Microsoft Intune**, **Jamf** (iOS), atau **Hexnode**.
- Install via MDM → tidak lewat Play Store / App Store public.
- Update dikendalikan IT — tidak reliant user tap "Update".

**Kelebihan**:
- Kontrol penuh version.
- Bisa force install/uninstall.
- Wipe device kalau hilang.
- Tidak butuh Play/App Store review process.

**Kekurangan**:
- Setup MDM = overhead awal.
- Cost MDM per device.

### 1.2. Alternatif: **Play Store / App Store Internal Track**

Kalau MDM belum siap:
- **Play Store**: Internal Testing Track (max 100 tester) atau Managed Google Play Private App.
- **App Store**: TestFlight Internal (max 100 internal tester).

**Kelebihan**: simpler, familiar untuk user.
**Kekurangan**: limit tester, tetap perlu store account, review process untuk major update.

---

## 2. Versioning Strategy

Semantic versioning: `MAJOR.MINOR.PATCH`.

| Change | Bump |
|---|---|
| Breaking API contract | MAJOR (1.x.x → 2.0.0) |
| New feature backwards-compatible | MINOR (1.2.x → 1.3.0) |
| Bugfix / small improvement | PATCH (1.2.3 → 1.2.4) |
| Emergency hotfix (production) | PATCH + tag `hotfix` |

Version di:
- `pubspec.yaml` — `version: 1.2.3+45` (semver + build number).
- Header `X-Client-Version: 1.2.3` — **opsional, untuk analytics/tracing saja** (backend tidak membaca header ini; tidak ada enforcement).
- Analytics: user property `app_version`.

### 2.1. Versi Minimum — Panduan Internal Saja

> **Fakta aktual (2026-08-22): backend TIDAK mengimplementasikan force-update.** Tidak ada pengecekan `X-Client-Version` dan tidak ada response `426 UPGRADE_REQUIRED`. Client versi lama tetap bisa akses API.

Konsekuensi untuk tim:
- **Versi minimum hanya panduan internal** — dicatat di release notes / `CHANGELOG.md` paket, tidak di-enforce mesin.
- Untuk major update: backend harus **backward-compatible** selama masa transisi (jangan langsung hapus field endpoint yang dipakai client lama), atau komunikasikan jadwal penghentian lewat notifikasi in-app / broadcast MDM.
- Update dikendalikan via **MDM / store track** — bukan via blokir API.
- Minimum update lag: 4 minggu after release baru (kasih waktu user update) tetap berlaku sebagai **kebijakan internal**, bukan enforcement backend.

---

## 3. Play Store Setup

### 3.1. Google Play Console Account
- Register: [play.google.com/console](https://play.google.com/console).
- One-time fee: $25 USD.
- Buat akun **Organization** (bukan Personal) atas nama Hummer Group.
- Verifikasi organisasi (dokumen bisnis).

### 3.2. Create App
- App name: **MES Hummer** (atau nama internal yang disepakati).
- Default language: `Indonesian (id-ID)`.
- App category: Business.
- Package name: **`com.hummergroup.mes`** (unique, tidak bisa diganti — seragam dengan iOS bundle ID).

### 3.3. App Bundle Setup

Sesuai Google requirement (2021+):
- Build format: **Android App Bundle (.aab)**, bukan APK.
- Build: `flutter build appbundle --release`.
- Signing: **Play App Signing** (Google kelola signing key).

### 3.4. Store Listing

Isi minimal walau internal:
- **Short description** (80 char): "Sistem produksi + inventory pabrik rokok Hummer."
- **Full description**: 1-2 paragraf, mention scope.
- **Screenshots**: minimal 2 (Fase awal boleh mockup, ganti dengan real screen).
- **Feature graphic**: 1024x500px.
- **App icon**: 512x512px.
- **Privacy policy URL**: link ke privacy notice hosted (bisa GitHub file public).

### 3.5. Content Rating
- Fill questionnaire: Business app, no violence/etc.
- Result: **PEGI 3 / Everyone** — safe untuk semua umur.

### 3.6. Target Audience & Data Safety Section
- Age: 18+ (karyawan).
- Data Safety: declare data yang dikumpulkan:
  - Personal info: name, email, phone.
  - App activity: user interactions.
  - Device info: device ID, IP.
- Sharing: no third party.

### 3.7. Release Track

Sekuensial:
1. **Internal Testing** (100 tester max) — untuk QA + PM.
2. **Closed Testing** (opsional) — pilot pabrik users.
3. **Open Testing** (opsional) — kalau mau public beta.
4. **Production** — full rollout.

Alternatif: **Managed Google Play Private App** — hanya visible untuk Google Workspace domain Hummer.

---

## 4. App Store Setup

### 4.1. Apple Developer Account
- Register: [developer.apple.com](https://developer.apple.com/programs/enroll/).
- Fee: $99 USD/tahun (Individual) atau $299 USD/tahun (Organization) — **wajib Organization** untuk enterprise.
- Verifikasi D-U-N-S Number (bisnis identifier).

### 4.2. App Store Connect
- Buat app record: [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
- Bundle ID: **`com.hummergroup.mes`** (harus match Android package name).
- SKU: internal reference (mis. `MES-HMR-001`).

### 4.3. Distribution Certificates & Provisioning Profiles

- Distribution Certificate: 1 per organization, generate di Apple Developer.
- App ID: `com.hummergroup.mes` — enable Push Notification capability.
- Provisioning Profile: iOS App Store (untuk production build).

Automated: **Fastlane match** (recommended) — CI-friendly signing.

### 4.4. Build & Upload
```bash
# Flutter
flutter build ipa --release --export-options-plist=ios/ExportOptions.plist

# Upload via Xcode Organizer atau
xcrun altool --upload-app -f build/ios/ipa/MES.ipa -u <apple-id> -p <app-specific-password>
```

Setelah upload, App Store Connect processing 15-30 menit.

### 4.5. Distribution Method

**Rekomendasi**: **Apple Business Manager** (untuk enterprise distribusi private, tidak lewat App Store public).
- Register: [business.apple.com](https://business.apple.com).
- Verifikasi organisasi.
- Distribute app secara private ke device tertentu (via MDM).

Alternatif Fase awal: **TestFlight Internal** — max 100 tester.

### 4.6. App Store Listing (kalau public track)

- **App name**: MES Hummer.
- **Subtitle**: Sistem produksi pabrik Hummer.
- **Category**: Business.
- **Screenshots**: 6.5", 5.5" (min 1 tiap size).
- **Preview video**: opsional 30 detik.
- **Privacy policy URL**: wajib.
- **Support URL**: link ke IT internal.

---

## 5. Release Checklist

### 5.1. Pre-Release (H-3 sebelum submit)
- [ ] Semua test pass (unit, integration, e2e) — lihat [`11-testing-matrix.md`](./11-testing-matrix.md).
- [ ] Manual QA di device physical (Android + iOS min 2 device).
- [ ] Version bumped di `pubspec.yaml`.
- [ ] `CHANGELOG.md` di paket ini update.
- [ ] Versi minimum dicatat di release notes (panduan internal — **backend tidak enforce**; pastikan API masih backward-compatible dengan client lama).
- [ ] Regression test dari version sebelumnya (upgrade path).

### 5.2. Build (H-2)
- [ ] `flutter build appbundle --release` (Android).
- [ ] `flutter build ipa --release` (iOS).
- [ ] Verify signing.
- [ ] Test upgrade in-place (bukan clean install) — critical: session tidak boleh hilang (token di secure storage; `deviceId` persisten).

### 5.3. Upload (H-1)
- [ ] Upload ke Play Console → Internal Testing.
- [ ] Upload ke App Store Connect → TestFlight.
- [ ] Notify tester internal.

### 5.4. Rollout
- [ ] Testing 3-7 hari di Internal Testing.
- [ ] Fix issues kalau ada.
- [ ] Promote ke Production (Play) atau Approve Distribution (Apple Business Manager).
- [ ] Notify user: "Update v1.2.0 tersedia — install dari MDM / update via app store".

### 5.5. Post-Release
- [ ] Monitor crash rate 24 jam pertama (Firebase Crashlytics).
- [ ] Monitor API error rate (Sentry).
- [ ] Kalau crash rate > 1% → **rollback** ke version sebelumnya.
- [ ] Update `CHANGELOG.md` with release notes.

---

## 6. Rollback Prosedur

### 6.1. Play Store
- Halt Rollout di release management.
- User yang belum update tidak dapat versi buggy.
- User yang sudah update: susah rollback (Android tidak auto-downgrade). Wajib fix forward.

### 6.2. App Store
- Sama — halt rollout.
- Kalau critical: **App Store Review Emergency Contact** untuk expedited review new version.

### 6.3. Backend Mitigasi (tanpa force-update)

> **Fakta aktual: backend tidak punya mekanisme force-update** (tidak ada bump `X-Client-Version` → 426). Mitigasi bug mobile parah harus lewat cara lain:

- **Feature flag / kill-switch** di backend untuk endpoint fitur bermasalah (kalau fitur punya flag — koordinasi dengan backend team).
- **Komunikasi manual** ke user: broadcast via MDM, WhatsApp group internal, atau notifikasi in-app (polling `GET /notifications`).
- **Fix forward**: rilis versi perbaikan secepatnya lewat track yang sama (MDM bisa force install update).
- Endpoint yang harus dimatikan total untuk sementara → backend team bisa menonaktifkan/handle khusus dengan audit.

---

## 7. CI/CD untuk Mobile

Rekomendasi:
- **Codemagic** — Flutter-native, gratis untuk small team.
- **Bitrise** — established alternative.
- **GitHub Actions** — manual setup, free tier limited untuk iOS.

### 7.1. Workflow Umum
```yaml
# codemagic.yaml (contoh)
workflows:
  android-internal:
    name: Android Internal
    environment:
      flutter: 3.24.0
    scripts:
      - flutter pub get
      - flutter test
      - flutter build appbundle --release
    artifacts:
      - build/app/outputs/bundle/release/*.aab
    publishing:
      google_play:
        credentials: $GOOGLE_PLAY_CREDS
        track: internal

  ios-testflight:
    name: iOS TestFlight
    environment:
      flutter: 3.24.0
      xcode: latest
    scripts:
      - flutter pub get
      - flutter test
      - flutter build ipa --release
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

### 7.2. Environment / Base URL di Build

- Production: `https://ohmes.fzdev.my.id` (default, semua build release).
- Staging: *(belum tersedia)* — jangan hardcode URL lain di build release.
- Pastikan `--dart-define` dipakai untuk environment kalau staging kelak tersedia (mis. `--dart-define=API_BASE_URL=...`), dan build production TIDAK pernah mengarah ke staging.

---

## 8. Support & Bug Report Flow

### 8.1. In-App Bug Report
Setting → "Laporkan Bug":
- Auto-attach: app version, OS, device model, last error log (dari Sentry).
- User isi: "Apa yang terjadi?" — free text.
- Submit → open email dengan template pre-filled ke bug@hummer.example.

### 8.2. Crash Auto-Report
Firebase Crashlytics + Sentry auto-collect. Tim dev alert real-time.

### 8.3. Feedback Channel
- WhatsApp group internal untuk petugas lapangan (pilot).
- In-app "Kirim Feedback" (Fase future).

---

## 9. Referensi

- [`README.md`](./README.md) — aturan kritikal kontrak (termasuk: tidak ada force-update `X-Client-Version`).
- [`11-testing-matrix.md`](./11-testing-matrix.md) — testing & release gate.
- [`CHANGELOG.md`](./CHANGELOG.md) — release history paket.
- [Flutter deploying Android](https://docs.flutter.dev/deployment/android).
- [Flutter deploying iOS](https://docs.flutter.dev/deployment/ios).
- [Managed Google Play](https://support.google.com/googleplay/work/answer/6145139) untuk private app.
- [Apple Business Manager](https://support.apple.com/business).
