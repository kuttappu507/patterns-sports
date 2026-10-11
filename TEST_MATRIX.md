# PS-AMS — Test Matrix (Phase 4 plan + baseline evidence)

Status keys: ✅ **executed** (with result) · 📋 **planned** (Phase 4, after the corresponding fix lands) · 🪟 **requires Windows runtime**. All tests use disposable databases and deterministic synthetic fixtures — never real academy data.

## 0. Baseline (executed in Phase 0 — all green)

| Check | Result |
|---|---|
| ESLint | ✅ 0 errors (10 pre-existing warnings: 9× no-img-element, 1× exhaustive-deps) |
| tsc --noEmit | ✅ clean |
| vitest `tests/domain.test.ts` | ✅ 59/59 — covers: registration-month rule, arrears accumulation, defaulter >1-month rule, multi-month merge, lastPayment, hasPaidCurrentMonth, parsePaidMonths tolerance, admission/receipt numbering (start, cross-year, deletion-safe MAX+1), computeAge + invalid/future DOB, isSafeMediaPath traversal set, sanitizeFileName, monthKey/monthsBetween endpoints, sports-science helpers, WhatsApp intl normalization, classifyFeeCycle boundaries, assertValidPayment (amount/duplicates/month-format/zero-fee), assertValidStudentInput, assertValidAttendanceRecords, assertValidUpload (10 MB + allowlist), letterhead constants |
| check:parity | ✅ 6 models ↔ 6 tables, 29↔30 delegations (blind spots → PS-044) |
| client-audit.mjs | ✅ PASS (not yet in CI → PS-044) |
| prisma validate / next build | ✅ / ✅ 16 pages |
| Windows build (CI tag v1.6.4) | ✅ SUCCESS, 3 release artifacts |
| Cargo check (local) | ❌ not run — toolchain absent (limitation, not failure) |

## 0b. Phase 3A balance fixes (executed 2026-10-11 — all green)

Supplements the baseline after the Phase 3A balance/financial work (FIX_PLAN 3A-4…3A-9):

| Check | Result |
|---|---|
| ESLint | ✅ unchanged from baseline: 0 errors, same 10 pre-existing warnings |
| tsc --noEmit | ✅ clean |
| vitest `tests/domain.test.ts` | ✅ 81/81 — +22 new: zero-fee waiver (PS-004), roundMoney + float tolerance (PS-009), billing-window bounds incl. calendar-real dates / future reject / mode allowlist (PS-008), ledger planner incl. legacy duplicate first-wins + idempotent re-run (PS-001) |
| vitest `tests/payments-ledger.integration.test.ts` | ✅ 6/6 — LIVE web backend on a disposable SQLite file: boot + demo seed reconciles ledger (`COUNT(PaymentMonth) == SUM(json_array_length(months))`), **two concurrent collects → exactly one 201 + one 409 + one ledger row + JSON agreement** (T-F8), sequential double-collect → 409 pre-write, future month/date/bad-mode → 400 via the real route (T-F4/T-F12), delete guard: with receipts → 409 + intact (T-S5), without → 200 |
| check:parity | ✅ 7 models ↔ 7 tables (70 columns) + new FK-action assertions (FeePayment RESTRICT, PaymentMonth CASCADE, in both DDL copies + Prisma) |
| client-audit.mjs | ✅ PASS |
| next build | ✅ 17 routes |
| Desktop collect/delete (Tauri) | 📋 design-verified only — plugin pool cannot host BEGIN…COMMIT (verified against tauri-plugin-sql 2.2.0 source: `Pool::connect` default pool, per-call `pool.execute`); UNIQUE(studentId,month) backstop + compensating cleanup + boot-time ledger sync implemented; runtime proof awaits the next Windows build |

## 1. Financial integrity (Phase 4)

| ID | Case | Source finding | Status |
|---|---|---|---|
| T-F1 | Valid payment (single + multi-month) → 201, one row, receipt RC-… | baseline guard | 📋 |
| T-F2 | Amount mismatch / zero / negative / NaN → 400 | PS-009 | 📋 |
| T-F3 | Malformed month (`2026-13`, `2026-1`, `abc`) → 400 | baseline | 📋 re-run |
| T-F4 | Month before registration / registration month itself / future month → 400 | PS-008 | ✅ unit tests (bounds); future month also via real route |
| T-F5 | Duplicate month in one request → 400 | baseline | 📋 re-run |
| T-F6 | Zero-fee student: status settled, collect rejected, never defaulter | PS-004 | ✅ unit tests; 📋 route-level re-run |
| T-F7 | Fee change mid-tenure → pinned policy (Q1) | PS-007 | 📋 |
| T-F8 | **Two concurrent collects, same month** → exactly one 201, one 409; paidMonths single-count | PS-001 | ✅ web (integration test, live backend); 📋 desktop runtime proof |
| T-F9 | **Concurrent receipt numbering** → no duplicate receiptNo; loser re-validates | PS-001 | 📋 |
| T-F10 | Failed insert leaves no partial payment/allocation (forced failure) | PS-001 | 📋 |
| T-F11 | Fractional fees (`x.99`) through validator + dueAmount sums | PS-009 | ✅ unit tests (roundMoney, 499.99 tolerance, rounded dueAmount) |
| T-F12 | paymentDate future/invalid → 400; mode outside allowlist → 400 | PS-008 | ✅ web (integration test via real route) + unit tests |
| T-F13 | Existing receipts byte-identical after MN-1 migration; totals reconcile (counts + sums per table) | MN-1 | ✅ reconciliation check runs on every boot (integration test asserts `COUNT(PaymentMonth) == SUM(json_array_length(months))` on the seeded demo DB); 📋 legacy-fixture battery |
| T-F14 | Fees-screen month stats == dashboard monthRevenue at 150 receipts | PS-010 | 📋 |

## 2. Students & attendance

| ID | Case | Source | Status |
|---|---|---|---|
| T-S1 | Create: missing/blank/whitespace fields, future DOB, bad mobile, negative fee → 400 (web+desktop) | baseline | 📋 re-run |
| T-S2 | **Update: `{mobile:"hello"}`, `{monthlyFee:-5}`, `{dateOfBirth:"2030-01-01"}`, `{fullName:""}` → 400 (web+desktop)** | PS-017 | 📋 |
| T-S3 | registrationDate future / < DOB → 400 | PS-025 | 📋 |
| T-S4 | Duplicate admissionNo (client-supplied) → 409; auto-generation retry keeps uniqueness | PS-050 | 📋 |
| T-S5 | Delete with payments → 409 + receipts intact; delete without payments → 200 + media unlinked | PS-005 | ✅ web (integration test); 📋 desktop runtime proof |
| T-S6 | Edit preserves unrelated fields (patch semantics, both backends) | baseline | 📋 re-run |
| T-S7 | Attendance: `2025-02-31` → 400; future date → 400; duplicate (studentId,date) within batch → 400/upsert per policy | PS-026 | 📋 |
| T-S8 | Attendance stats exclude Inactive students | PS-026 | 📋 |
| T-S9 | Search/filter correctness at 1k / 5k / 10k synthetic students (p95 budget) | PS-030 | 📋 |
| T-S10 | phoneDigits edge set (`0919…`, `+91 …`, `0091…`) | PS-033 | 📋 |

## 3. Backup & restore (disposable DBs; 🪟 where noted)

| ID | Case | Source | Status |
|---|---|---|---|
| T-B1 | Backup under write load → restored file passes `quick_check`, row counts match | PS-002 | 📋 🪟 |
| T-B2 | Target full/locked → command reports failure, UI shows failure (never success) | PS-002 | 📋 |
| T-B3 | Interrupted (killed) backup → no file that passes validation as a backup (`.partial`) | PS-002 | 📋 🪟 |
| T-B4 | Media copy failure → counted and reported | PS-002/006 | 📋 |
| T-B5 | Restore of foreign SQLite file → rejected before staging | PS-006 | 📋 |
| T-B6 | Restore of truncated/corrupt file → rejected | PS-003/006 | 📋 |
| T-B7 | **Forced copy failure during apply → live DB intact (rollback), error surfaced** | PS-003 | 📋 🪟 |
| T-B8 | Successful restore → schema check passes; optional media restore reconciles | PS-006 | 📋 |
| T-B9 | Stale WAL/SHM never applied to the new DB | PS-003 | 📋 🪟 |
| T-B10 | Restart after interrupted restore → known-good state (pre-restore copy or rolled-back live DB) | PS-003 | 📋 🪟 |

## 4. API security

| ID | Case | Source | Status |
|---|---|---|---|
| T-A1 | No token: non-loopback GET `/api/backup` and `/api/media` denied | PS-012 | 📋 |
| T-A2 | No token: cross-origin `no-cors` POST to `/api/payments` rejected (Origin check) | PS-012 | 📋 |
| T-A3 | Token mode: valid header accepted; `?token=` no longer accepted; timing-safe compare | PS-012 | 📋 |
| T-A4 | data-info never contains credentials (libsql URL case) | PS-013 | 📋 |
| T-A5 | Server binding: standalone listens on 127.0.0.1 by default | PS-012 | 📋 |
| T-A6 | Upload: oversized / wrong ext / wrong MIME / hostile filename → 4xx; path stays in media/ | baseline (route verified) | 📋 re-run |
| T-A7 | Media: traversal set (`..`, `%2e%2e`, backslash, absolute) → 400 | baseline | 📋 re-run |
| T-A8 | Updater: non-release URL → Err; truncated download → Err + file removed (🪟 e2e) | PS-015 | 📋 🪟 |

## 5. Reports, exports, UI

| ID | Case | Source | Status |
|---|---|---|---|
| T-R1 | UI counts == PDF/Excel/print rows for defaulters, reports, attendance (same filtered set) | PS-035/043 | 📋 |
| T-R2 | Receipt history beyond 200 records: totals labelled/windowed correctly | PS-010 | 📋 |
| T-R3 | CSV: leading `= + - @ \t \r` neutralized when exportCSV is wired | PS-038 | 📋 |
| T-R4 | PDF: no U+20B9 mojibake; Malayalam name renders (embedded font); foot once | PS-036 | 📋 |
| T-R5 | Save-dialog cancel: no second download, neutral toast (desktop stub + browser) | PS-037 | 📋 🪟 |
| T-R6 | Print layouts on real A4/A5/80 mm (🪟 printer) or documented simulation | baseline CSS | 📋 🪟 |
| T-R7 | Web print paper shows only the document (no dialogs/toasts) | PS-041 | 📋 |
| T-R8 | Stale-request: student-detail + students search out-of-order resolution | PS-018/031 | 📋 |
| T-R9 | Guard set: achievement delete confirm, attendance bulk overwrite confirm, unlink confirm, remind busy/offline | PS-042 | 📋 |
| T-R10 | WhatsApp: failed text vs failed attachment distinctly surfaced (existing behavior, regression-locked) | baseline | 📋 |
| T-R11 | Demo: concurrent load → one batch; forced mid-load failure → nothing persisted, removable | PS-021 | 📋 |

## 6. Migration & parity (Phases 4–5)

| ID | Case | Source | Status |
|---|---|---|---|
| T-M1 | Legacy-shaped DBs (pre-gender, pre-ledger) upgrade on boot — web + desktop; data preserved | PS-019/020/MN-2 | 📋 |
| T-M2 | Parity mutation test: remove UNIQUE/FK/index from a schema copy → parity exits 1 | PS-044 | 📋 |
| T-M3 | Endpoint-existence: every `api.ts` path has a route file (would have caught PS-016) | PS-016 | 📋 |
| T-M4 | Full web/desktop parity matrix walkthrough (Phase 5) | — | 📋 |
| T-M5 | Perf battery 100/1k/5k/10k students: dashboard, fees statuses, month filter, reports | PS-030 | 📋 |
