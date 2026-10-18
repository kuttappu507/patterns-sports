# PS-AMS Android (`in.patternsports.ams`) — Pattern Sports Academy Management System

Native Kotlin + Jetpack Compose (**Foundation-Only, Zero Material Design**) Android application with **100% functional, schema, domain, and print/PDF parity** with the PS-AMS Desktop/Web application.

---

## 1. Zero-Material Executive Sports Architecture

Per strict engineering requirements, `android/app/build.gradle.kts` imports **only** `androidx.compose.foundation`, `androidx.compose.ui`, `androidx.compose.animation`, and `androidx.compose.runtime` — **zero** `androidx.compose.material` or `androidx.compose.material3` packages exist anywhere in the dependency graph or source code.

| Layer | Implementation |
|---|---|
| **Design System (`SorbetTheme.kt`)** | Custom `CompositionLocal` theme engine matching the PC app's Club Room dark header/dock (`#07222E` with `#EF476F → #FFD166` 3dp accent bar), crisp 1px structural borders (`#E2E8F0` / `#133C4D`), and Light & Dark Court surface tokens. |
| **Precision Vector Iconography (`CourtIcons.kt`)** | 30 custom-drawn 24×24 viewport `Canvas` icons (`1.9dp` stroke, round caps/joins) modeled on canonical Lucide vector paths — zero Material Icons dependencies. |
| **Brand Crest & Micro-Interactions (`StopMotionEngine.kt`, `FluidAnimations.kt`)** | Executive `.brand-tile` volleyball crest with `#FFD166` status dot, upright status pills, subtle spring press physics (`0.985f` scale), and smooth animated progress bars. |
| **SQLite Engine (`PsamsDatabase.kt`)** | Native `SQLiteOpenHelper` executing the exact 8-table `schema.sql` (`Student`, `Achievement`, `FeePayment`, `PaymentMonth`, `CommitteeMember`, `Attendance`, `Setting`, `Measurement`) with `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, and automatic startup `PaymentMonth` ledger reconciliation. |
| **Domain & WHO 2007 BMI (`DomainEngine.kt`, `BmiEngine.kt`, `Who2007BmiData.kt`)** | Exact port of `domain.ts`, `bmi.ts`, and `who2007-bmi-data.ts` (months 60–229 LMS tables for boys/girls, z-scores, percentiles, coaching guidance, age categories, complimentary admission month, `RC-YYYYMM-NNNNN` & `PSA-YYYY-NNNN` sequences, and Indian Rupees `inWords()` converter). |
| **PC-Parity PDF, Print & POS Engine (`DocumentExporter.kt`, `PrintPreviewModal.kt`)** | Native `android.graphics.pdf.PdfDocument` + `PrintManager` + Apache POI `.xlsx` generator matching `src/lib/psams/export.ts` and `src/components/psams/prints/print-root.tsx` 1:1. |

---

## 2. PC-Parity Professional PDF & Receipt Layouts

All PDF exports and on-screen print previews match the PC app's `export.ts` and `print-root.tsx`:

1. **Formal Fee Payment Receipt (Portrait A5 `148 × 210 mm` / `420 × 595 pt` & A6 `105 × 148 mm` / `298 × 420 pt`)**:
   - Centered Academy Letterhead (`#073B4C` bold academy title, italic tagline, address/phone/email line, `#EF476F` `FEE PAYMENT RECEIPT` pill badge, and `#EF476F` rule).
   - Monospace `Receipt No` (left) and formatted `Date` (right).
   - Full-grid bordered table (`#CBD5E1` borders, `#F8FAFC` label cells) for `RECEIVED FROM`, `TOWARDS`, `PAYMENT MODE`, and optional `REMARKS`.
   - Highlighted **`TOTAL AMOUNT PAID`** banner (`#F5F7FA` fill, `#1E293B` border) displaying `DomainEngine.inWords(payment.amount)` on the left and bold `Rs. X,XXX` (`#073B4C`) on the right.
   - Non-refundable fee disclaimer, right-aligned **Authorized Signatory** rule block, and centered Google Maps footer.
2. **80mm Thermal POS Slip (`226 pt` roll width)**:
   - Monospace thermal formatting with dashed `--------------------------------` dividers, `PERIODS PAID:` bullet list, `TOTAL`, `inWords(amount)`, signatory, and `Powered by PS-AMS` footer.
3. **A4 Player Profile Card (`595 × 842 pt`)**:
   - Centered Academy Letterhead + `PLAYER PROFILE CARD` badge.
   - Left `88 × 106 pt` photo frame (renders student photo bitmap or monogram + status pill + admission number badge) alongside a 9-row bordered identity table.
   - **Physical & Biometric Profile** 6-column bordered grid (`Height`, `Weight`, `BMI + WHO 2007 Category`, `Standing Reach`, `Spike Reach`, `Jump Reach`) + WHO 2007 BMI-for-Age screening callout box.
   - **Sports & Playing Profile** chips (`Primary Sport: Volleyball`, `Primary Position`, `Secondary Role`, `Batch`).
   - **Sports Achievements & Career Milestones** table with `#EF476F` header bar, alternating `#F8FAFC` rows, and General Secretary + Parent/Guardian signature blocks.
4. **Multi-Page A4 Reports**:
   - **Fee Defaulters Register**, **Filtered Player Roster Report**, **Fee Collection Ledger**, and **31-Day Blank Attendance Register** with automatic page breaks, `#EF476F` table headers, summary callout boxes, and `Page i of N` footers.

---

## 3. Exporting to a Standalone GitHub Repository

To copy the entire Android project into its own standalone Git repository (complete with root Gradle wrapper config and a dedicated `.github/workflows/build-apk.yml` CI pipeline):

```bash
# 1. Create a standalone Git repository locally at /tmp/patterns-sports-android
npm run export:android-repo

# 2. Or export and push directly to a new GitHub repository URL:
node scripts/export-android-repo.mjs /tmp/patterns-sports-android https://github.com/kuttappu507/patterns-sports-android.git
```
