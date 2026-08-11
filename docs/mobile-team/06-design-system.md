# 06 · Design System — Mobile App

Design system referensi untuk implementasi Flutter. Tujuan: konsistensi visual + accessibility di lantai produksi (kondisi cahaya bervariasi, tangan operator kadang kotor / sarung tangan).

**Prinsip**: **large tap targets, high contrast, no fluff**. UI harus bisa dipakai satu tangan dengan cepat, di device 5.5"-7" (bukan tablet).

---

## 1. Ukuran Layar Target

| Device | Screen | DPR | Test priority |
|---|---|---|---|
| Android budget (Samsung A-series, Redmi) | 5.5-6.5" HD/FHD | 2x-3x | HIGH — mayoritas operator |
| Android mid (Samsung M-series) | 6.5-6.7" FHD+ | 2.5x | MEDIUM |
| iPhone SE/8+ | 4.7-5.5" HD | 2x | LOW — mayoritas supervisor |
| iPhone standard | 6.1-6.7" FHD+ | 2.5-3x | LOW |

**Optimize untuk**: 6" FHD (screen ~360x740 dp).

---

## 2. Color Palette

**Semua warna dari brand-neutral palette + semantic**. Ganti dengan brand Hummer kalau sudah dapat asset.

### 2.1. Brand Colors (placeholder — ganti dengan warna Hummer real)
```dart
class HummerColors {
  static const primary = Color(0xFFB34A1F);       // Industrial vermilion
  static const primaryDark = Color(0xFF8A3814);   // Darker for pressed
  static const primaryLight = Color(0xFFE47854);  // Lighter for highlight

  static const secondary = Color(0xFF1F2937);     // Deep slate
  static const secondaryLight = Color(0xFF374151);
}
```

### 2.2. Semantic Colors (WAJIB — jangan diganti sembarangan)
```dart
class SemanticColors {
  static const success = Color(0xFF10B981);     // Green — yield normal
  static const warning = Color(0xFFF59E0B);     // Amber — yield out of range
  static const error = Color(0xFFEF4444);       // Red — reject, error
  static const info = Color(0xFF3B82F6);        // Blue — info banner

  // Status semantic
  static const running = Color(0xFF10B981);     // Green
  static const completed = Color(0xFF3B82F6);   // Blue
  static const approved = Color(0xFF6366F1);    // Indigo (LOCKED)
  static const partial = Color(0xFFF59E0B);     // Amber (boks parsial handoff)
}
```

### 2.3. Neutrals
```dart
class Neutrals {
  // Light theme
  static const bg = Color(0xFFF8F7F5);          // Off-white
  static const surface = Color(0xFFFFFFFF);
  static const surfaceElevated = Color(0xFFFCFBF8);
  static const ink = Color(0xFF1A1815);
  static const inkSoft = Color(0xFF4A4741);
  static const muted = Color(0xFF7A756B);
  static const border = Color(0xFFE0DCD2);
  static const disabled = Color(0xFFD1CBBF);

  // Dark theme (opsional Fase 3.5+ — lantai produksi jarang butuh)
  static const bgDark = Color(0xFF17150F);
  static const surfaceDark = Color(0xFF1F1D19);
  static const inkDark = Color(0xFFEFEAD8);
}
```

### 2.4. Contrast Ratio (WCAG AA)
- Text primary vs bg: **≥ 7:1** (AAA).
- Text secondary vs bg: **≥ 4.5:1** (AA).
- Interactive elements: **≥ 3:1** vs bg.

**Test**: pakai [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) atau Flutter DevTools accessibility inspector.

---

## 3. Typography

### 3.1. Font Family
- **Body**: `Inter` (variable font, terbuka, khas sistem).
- **Display / Number**: `Inter` (weight 700+) atau `Roboto Mono` untuk data (tabular nums).
- **System fallback**: `-apple-system, BlinkMacSystemFont, sans-serif`.

Ambil dari [Google Fonts](https://fonts.google.com/specimen/Inter). Bundle di app (jangan ambil runtime dari CDN — offline requirement).

### 3.2. Type Scale
```dart
class TypeScale {
  // Display — hero/screen title
  static const displayLarge = TextStyle(fontSize: 32, fontWeight: FontWeight.w700, height: 1.15);
  static const displayMedium = TextStyle(fontSize: 28, fontWeight: FontWeight.w700, height: 1.2);

  // Headings — section title
  static const headingLarge = TextStyle(fontSize: 24, fontWeight: FontWeight.w600, height: 1.25);
  static const headingMedium = TextStyle(fontSize: 20, fontWeight: FontWeight.w600, height: 1.3);
  static const headingSmall = TextStyle(fontSize: 18, fontWeight: FontWeight.w600, height: 1.35);

  // Body — konten reguler
  static const bodyLarge = TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5);
  static const bodyMedium = TextStyle(fontSize: 14, fontWeight: FontWeight.w400, height: 1.5);
  static const bodySmall = TextStyle(fontSize: 12, fontWeight: FontWeight.w400, height: 1.4);

  // Labels — button, form label
  static const labelLarge = TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.2, letterSpacing: 0.5);
  static const labelMedium = TextStyle(fontSize: 14, fontWeight: FontWeight.w600, height: 1.2, letterSpacing: 0.5);

  // Numeric — data display (yield, weight, etc)
  static const numericLarge = TextStyle(fontSize: 32, fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()]);
  static const numericMedium = TextStyle(fontSize: 24, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()]);
}
```

### 3.3. Numeric Display
Untuk display angka (yield %, berat kg, boks number) **wajib** pakai `tabular-nums` — supaya kolom angka aligned kalau list.

### 3.4. Line Length
- Body text: max **60-75 karakter** per line di layar 6".
- Judul: max **30-40 karakter**.

---

## 4. Spacing System

```dart
class Spacing {
  static const xxs = 4.0;
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;      // Default padding
  static const lg = 24.0;
  static const xl = 32.0;
  static const xxl = 48.0;
  static const xxxl = 64.0;
}
```

**Grid**: 4dp base. Multi of 4 (4, 8, 12, 16, 24, 32, 48).

### 4.1. Screen Padding
- Horizontal: **16dp**.
- Vertical (top): **16dp** dari status bar.
- Vertical (bottom): **16dp** + safe area (untuk notch/gesture bar).

### 4.2. Component Spacing
- Between paragraphs: **12dp**.
- Between form fields: **16dp**.
- Between sections: **24dp**.
- Card padding internal: **16dp**.

---

## 5. Tap Target Sizes

**Standard**: minimum **48x48dp** (WCAG AAA & Material Design guideline).

**Untuk operator dengan sarung tangan**: rekomendasi **56x56dp** untuk primary action.

| Component | Size |
|---|---|
| Primary button (Boks Selesai · Timbang) | **min 88dp height** — full width, centered |
| Secondary button | 48dp height |
| Icon button | 48x48dp |
| List item | min 56dp height |
| Form input | 48dp height |
| Toggle / switch | 48dp min |
| Modal dismiss button | 48x48dp |

### 5.1. Contoh Primary Button
```dart
Widget primaryAction({required String label, required VoidCallback onPressed}) {
  return SizedBox(
    width: double.infinity,
    height: 88,                                    // Extra tall for gloved hands
    child: ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: HummerColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: TypeScale.labelLarge.copyWith(fontSize: 20),
      ),
      child: Text(label.toUpperCase()),
    ),
  );
}
```

---

## 6. Component Library

### 6.1. Buttons
- **Primary** — action utama halaman. Warna: `primary`. Max 1 per screen.
- **Secondary** — action pendukung. Warna: `secondary` atau outline `primary`.
- **Tertiary / Text** — action minor (Cancel, Skip). No background, text-only.
- **Destructive** — delete, cancel. Warna: `error`.

### 6.2. Form Fields
- Label di atas (bukan floating).
- Numeric field: `TextInputType.numberWithOptions(decimal: true)` untuk berat.
- Error message di bawah, warna `error`, muncul saat blur atau submit.
- Placeholder: hint aja, tidak ganti label.

### 6.3. Modals
- Full-screen di device 5.5" (bukan center). Tap area besar.
- Header: judul + close button (48x48).
- Content: scrollable.
- Footer: primary + secondary action sticky di bawah (di atas safe area).

### 6.4. Cards
- Radius: **8dp**.
- Shadow: subtle (elevation 2).
- Padding: 16dp.
- Divider between sections: `border` color.

### 6.5. Lists
- Divider antar item: `border` color, 1px.
- Item padding: 12dp vertical, 16dp horizontal.
- Leading icon (kalau ada): 24x24.
- Trailing action / arrow: 24x24.

### 6.6. Toast / Snackbar
- Success: top position, `success` bg, auto-dismiss 3s.
- Error: top position, `error` bg, manual dismiss.
- Info: bottom position, `info` bg, auto-dismiss 4s.

### 6.7. Empty States
Wajib design untuk:
- Belum ada shift RUNNING.
- Belum ada boks di inventory.
- Belum ada notification.
- Search no results.

Format: ikon besar + judul + subtitle + action button.

### 6.8. Loading States
- Skeleton (lebih baik untuk perceived speed).
- Full-screen spinner: hanya untuk critical action (login, submit).
- Inline spinner untuk button loading.

---

## 7. Iconography

### 7.1. Icon Library
- **Material Icons** (built-in Flutter) atau **Phosphor Icons**.
- Size: 24x24 default, 20x20 untuk small, 32x32 untuk display.
- Stroke: consistent 2px.

### 7.2. Custom Icons
Kalau butuh custom (mis. logo Hummer, ikon mesin Maker/HLP):
- SVG format, di-embed via `flutter_svg`.
- Simpan di `assets/icons/`.
- Naming: `ic_<kategori>_<nama>.svg` (mis. `ic_machine_maker.svg`).

---

## 8. Animation

**Prinsip**: subtle, quick, purposeful. Bukan flashy.

### 8.1. Duration Guidelines
- Micro-interaction (tap feedback): 100-150ms.
- Transition antar screen: 250-300ms.
- Modal open: 200ms.
- Skeleton pulse: 1200ms loop.

### 8.2. Reduced Motion
Support `MediaQuery.of(context).disableAnimations`. Kalau true, disable animation non-essential.

---

## 9. Accessibility (WCAG AA)

### 9.1. Semantic Widgets
- `Semantics` widget untuk element yang bukan built-in Flutter.
- `label` untuk button icon (screen reader).
- `hint` untuk form field.

### 9.2. Focus Order
Tab order: logical (left-to-right, top-to-bottom).

### 9.3. Contrast
- Text vs bg: ≥ 4.5:1 (AA).
- UI element vs bg: ≥ 3:1.

### 9.4. Font Scaling
Support Dynamic Type / Font Scale sampai 200%.
`TextStyle` pakai `fontSize` — automatic scale kalau user set text size di system.

### 9.5. Voice Over / TalkBack
Test dengan screen reader untuk minimal:
- Login flow.
- Start shift.
- Boks Selesai · Timbang.

---

## 10. Empty & Error Illustration

Kalau butuh illustration (opsional, nice-to-have):
- Style: line-art, monochromatic dengan single accent color.
- Ukuran: 200x200 max di layar 6".
- Format: SVG.

**Tanpa illustration**: pakai icon 64x64 dengan message text — tetap professional.

---

## 11. Micro-Interactions

### 11.1. Tap Feedback
Setiap interactive element: haptic feedback + visual (ripple / opacity change).

```dart
onTap: () {
  HapticFeedback.lightImpact();
  // action...
}
```

### 11.2. Loading Button
Saat submit:
- Button jadi `disabled`.
- Show spinner inline (small, 16x16 white).
- Label: "Menyimpan..." (Bahasa Indonesia).

### 11.3. Success Confirmation
Toast + haptic medium impact + optional check animation.

### 11.4. Error Feedback
Toast + haptic heavy impact + shake animation (subtle).

---

## 12. Bahasa & Copy

- **Bahasa Indonesia** untuk semua UI text.
- Formal tapi ringkas — operator lantai bukan reader novel.
- Kata benda + kata kerja imperative untuk button:
  - ✅ "Simpan"
  - ✅ "Timbang Boks"
  - ✅ "Akhiri Shift"
  - ❌ "OK" / "Klik disini"

### 12.1. Error Message
Format: **apa yang salah + apa yang harus dilakukan**.
- ❌ "Error."
- ❌ "Boks tidak valid."
- ✅ "Boks tidak tersedia di inventory. Pilih dari daftar FIFO."

### 12.2. Confirmation
Format: singkat, apa akibat.
- ✅ "Akhiri shift sekarang? Data akan menunggu approval supervisor."

---

## 13. Design Tokens (Ringkas)

Konsolidasi di `lib/theme/tokens.dart`:

```dart
export 'colors.dart';       // HummerColors, SemanticColors, Neutrals
export 'typography.dart';   // TypeScale
export 'spacing.dart';      // Spacing
export 'radii.dart';        // BorderRadius
export 'shadows.dart';      // BoxShadow
export 'motion.dart';       // Duration, Curve
```

Konsumsi via `Theme.of(context)`:
```dart
Text('Hello', style: Theme.of(context).textTheme.headlineMedium);
Container(color: Theme.of(context).colorScheme.primary);
```

---

## 14. Design Handoff

Untuk fase design → dev:
- **Figma file** (kalau ada design lead) — di-share sebagai bagian paket ini.
- Nama frame konsisten: `<Screen> · <State>` (mis. `Start Shift · Default`, `Start Shift · Handoff Detected`).
- Export asset ke `assets/images/` dengan naming clear.

**Kalau tidak ada Figma**: build UI dari spec text di sini + `01-app-spec.md` layout ASCII. Iterate dengan user feedback.

---

## 15. Referensi

- [`01-app-spec.md`](./01-app-spec.md) §12 — UI/UX guidelines dari perspective business.
- [`00-mobile-brief.md`](./00-mobile-brief.md) — konteks user.
- [Material Design 3](https://m3.material.io/) — sistem referensi.
- [Flutter Accessibility](https://docs.flutter.dev/ui/accessibility-and-internationalization/accessibility) — official docs.
