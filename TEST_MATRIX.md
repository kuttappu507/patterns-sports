# PS-AMS — Test Matrix (Phase 4 plan + baseline evidence)

Status keys: ✅ **executed** (with result) · 📋 **planned** (Phase 4, after the corresponding fix lands) · 🪟 **requires Windows runtime**. All tests use disposable databases and deterministic synthetic fixtures — never real academy data.

## 0h. v1.9.0 WhatsApp-engine + receipt-ordering battery (executed 2026-10-12 — all green)

New: `tests/receipt-ordering.test.ts` (route-level, disposable DB) wired into `npm run verify` — suite total now **232/232 across 15 files**. New Rust harness `scripts/wa-engine-check` `#[path]`-includes the REAL `src-tauri/src/wa_json_store.rs` + `wa_engine.rs` and runs 4 behavioural tests (`cargo test`; also run by the new `verify.yml` `rust` job on every push, together with a full `cargo check` of src-tauri).

| ID | Check | Result |
|---|---|---|
| T-WA-S1 | JSON session store round-trip: device row + every sub-store (identities, sessions, prekeys+uploaded flags, signed prekeys, sender keys, sync keys, versions+mutation MACs, LID-PN, base keys, device registry, tc tokens, sent messages, pending inbound, msg secrets) survives a flush→reload cycle | ✅ |
| T-WA-S2 | Reference semantics preserved: mark_prekeys_uploaded is UPDATE-only (never resurrects consumed ids); mutation-MAC upsert; latest sync key = lexicographic max key_id | ✅ |
| T-WA-S3 | Expiry rules match the reference: tc tokens dropped only when BOTH buckets are expired-or-absent; sent messages and pending-inbound swept by cutoff; msg-secret `expires_at=0` never expires | ✅ |
| T-WA-S4 | Msg-secret merge on key conflict: newest secret bytes win, `expires_at` never shortens (0 = never), later non-zero `message_ts` wins | ✅ |
| T-WA-M1 | LEGACY MIGRATION: a wa-store.db built with the sidecar's exact Diesel schema (paired device row incl. 64-byte keypair blobs + account NULL + protobuf app-state key/version blobs) is imported on first boot — pairing preserved, all stores readable, wa-store.db renamed `.migrated` so the import runs exactly once | ✅ |
| T-WA-M2 | Legacy DBs missing newer tables (no such table) are tolerated — those stores import empty instead of failing the whole migration | ✅ |
| T-WA-R1 | Corrupt `wa-session.json` is retired (`.corrupt`) and the engine starts fresh instead of failing the boot | ✅ |
| T-WA-C1 | Engine module compiles clean (`cargo check`) with the app's exact feature set (no sqlite-storage; wacore without simd) — no diesel/libsqlite3-sys in the graph | ✅ |
| T-WA-D1 | Audit gate: no `externalBin` in tauri.conf.json; engine never spawns a process; `wa://event` UI contract + restart/unlink/auto-respawn flows preserved (client-audit PS-055 section) | ✅ |
| T-PS056-1 | A just-issued BACKDATED receipt (collected today, paymentDate 10 days ago) tops the UNFILTERED receipt ledger on BOTH backends (web route + desktop SQL) | ✅ |
| T-PS056-2 | Month-filtered and per-student listings keep paymentDate DESC (period semantics) — verified web + desktop | ✅ |
| T-PS056-3 | Issuance order is receiptNo DESC (the RC number printed on the receipt), createdAt tiebreak, paymentDate last — identical ORDER BY in route.ts and tauri-api.ts | ✅ |

🪟 Windows-runtime additions for v1.9.0 (acceptance checklist §0 in RELEASE_REPORT): legacy-pairing auto-import on a real v1.8.0 install; no `whatsapp-bot.exe` in the install folder / portable zip; live QR pairing + receipt send with the in-process engine.

## 0g. v1.8.0 BMI & updater battery (executed 2026-10-12 — all green)

New suites: `tests/bmi-domain.test.ts` (35 tests) · `tests/bmi-integration.test.ts` (11 tests) — wired into `npm run verify`; suite total now **230/230 across 14 files**. Regression fixtures for the migration battery updated to the REAL v1.5 schema shape (v1.5 shipped heightCm/weightKg/updatedAt — verified against `git show v1.5.0:prisma/schema.prisma`).

| ID | Check | Result |
|---|---|---|
| T-BMI-F1 | Formula: known value + cm→m conversion; full precision kept, display rounds separately | ✅ |
| T-BMI-F2 | Rejects 0/negative/NaN/Infinity/missing (typed issues); implausible bounds refuse 1.5 kg & 30 cm while legit juniors pass | ✅ |
| T-BMI-A1 | Adult cut-offs at/below/above 18.5, 25, 30 (half-open) | ✅ |
| T-BMI-A2 | Unrounded classification vs rounded display (24.96→"25.0" stays healthy) | ✅ |
| T-BMI-W1 | WHO anthroplus R-package fixtures reproduced exactly (BAZ −0.58 / +0.42) | ✅ |
| T-BMI-W2 | 27 cases vs WHO's PUBLISHED SD columns (both sexes, months 61–228, z −3…+3) within rounding | ✅ |
| T-BMI-W3 | WHO percentile table consistency (P25 ↔ −0.6745, P01=0.1st ↔ −3.0902) | ✅ |
| T-BMI-W4 | z↔BMI round-trip exact at full precision, both sexes, 10 months × 7 z-levels | ✅ |
| T-BMI-W5 | Restricted z beyond ±3 SD (z=4 exactly one SD23 span past SD3) | ✅ |
| T-BMI-C1 | Precedence: severe thinness ⊂ thinness; obesity ⊂ overweight; AT-boundary values classify per WHO definitions | ✅ |
| T-BMI-C2 | z/percentile/reference metadata attached; implausible \|z\|>5 flagged | ✅ |
| T-BMI-E1 | Age boundaries: <60 mo unsupported (no category, explicit reason); 60.0 mo supported; 228.98 mo WHO; 229.01 mo adult | ✅ |
| T-BMI-E2 | Exact age math: leap-day day counts, birthdays, ISO/Date inputs, DOB-after-measurement rejected | ✅ |
| T-BMI-E3 | Historical measurement assessed at ITS date (8 y ≠ 15 y for the same athlete) | ✅ |
| T-BMI-S1 | Sex handling: ""/"Other"/unknown → BMI value, NO classification, never adult fallback; full 5–19 age sweep stays on the WHO method | ✅ |
| T-BMI-P1 | Percentile: standard-normal mapping, monotonic, clamped | ✅ |
| T-BMI-WB | Weight band: adult 18.5–24.9 scale; junior −2…+1 SD band verified by BAZ round-trip; null for unsupported | ✅ |
| T-BMI-M1 | Legacy v1.7 DB migration: Measurement created, dated backfill rows (source 'backfill'), data intact, re-run idempotent | ✅ |
| T-BMI-I1 | API capture: create → 'create' row; weight change → same-day upsert (no duplicates); unrelated edit → NO row; invalid measurement 400 | ✅ |
| T-BMI-I2 | GET /api/students/:id returns history; report cell ≡ presentation ≡ assessment (junior/adult/unclassified) | ✅ |
| T-BMI-I3 | Desktop write path mirrors the web capture rule (source contract — tauri-api.ts not executable in sandbox) | ✅ source-level |
| T-BMI-O1 | Offline source contract: bmi.ts + who2007-bmi-data.ts contain no network APIs; data module import-free; provenance header present | ✅ |
| T-BMI-B1 | Real browser: profile strip "18.4 · Normal weight", Athletic Lab "WHO 5–19 · BAZ −0.7 · 23rd percentile · age 15 y 5 m" + junior weight band, growth-history backfill row visible | ✅ browser |
| T-BMI-B2 | Real browser: reports table — juniors get WHO labels, 20-year-old Senior gets adult band, values match hand calculation | ✅ browser |
| T-BMI-B3 | Real browser OFFLINE (network disabled): form computes 17.1 + classification with zero network; served chunk contains the bundled WHO tables; request log has no external hosts | ✅ browser |
| T-BMI-🪟 | Desktop EXE: measurement capture via tauri createStudent/updateStudent + Install-button ShellExecuteW flow on real Windows | 🪟 pending next install |

## 0f. Phase 4 regression battery (executed 2026-10-12 — all green)

The §1–§6 battery below is now CODED (six new suites, 58 tests) and wired into `npm run verify`. Suite map: `tests/phase4-financial.test.ts` (T-F battery, 12) · `tests/phase4-students.test.ts` (T-S/T-R11, 17) · `tests/phase4-media.test.ts` (T-A6/A7, 10) · `tests/phase4-exports.test.ts` (T-R source contracts, 8) · `tests/phase4-migration.test.ts` (T-M1/M2, 5) · `tests/phase4-perf.test.ts` (T-M5/T-S9, 6).

| Check | Result |
|---|---|
| ESLint | ✅ 0 errors (4 pre-existing warnings: 3× no-img-element, 1× exhaustive-deps — count reduced from 10 by the 3D SafeImg adoption) |
| tsc --noEmit | ✅ clean |
| vitest (all suites) | ✅ **184/184 across 12 files** (126 prior + 58 new Phase 4) |
| check:parity | ✅ 7 models ↔ 7 tables (70 columns) — AND proven mutation-sensitive by T-M2 |
| client-audit.mjs | ✅ PASS (wired into verify since 3C) |
| next build | ✅ success incl. standalone assembler |
| Battery findings fixed | ✅ 1 hardening: POST /api/payments now rejects non-string month entries with 400 (a numeric month previously crashed the Prisma query build → 500) |
| Perf evidence (p50, synthetic 10k students) | ✅ indexed students search **7 ms** · ledger month-filter **73 ms** · fee statuses **202 ms** · dashboard **216 ms** — no N+1 / full-JSON-parse regressions at volume |

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

## 0c. Owner-reported fixes PS-051 / PS-052 (executed 2026-10-11 — all green)

| Check | Result |
|---|---|
| ESLint | ✅ 0 errors (10 pre-existing warnings unchanged) |
| tsc --noEmit | ✅ clean |
| vitest | ✅ 87/87 |
| check:parity | ✅ 7 models ↔ 7 tables, 29 native delegations ↔ 30 tauri exports |
| client-audit.mjs | ✅ PASS |
| next build | ✅ success; `/api/upload` present in the route list (PS-016 restoration re-verified in the artifact) |
| PS-051 cursor affordance | ✅ CSS block in `globals.css` `@layer base` — pointer on `button:not(:disabled)`, role=button/menuitem/…/tab, `a[href]`, `label[for]`, `select:not(:disabled)`, `summary`; visual check pending on next Windows run 🪟 |
| PS-052 WhatsApp reconnect — Rust compile | 📋 review-only in sandbox (cargo unavailable); `wa_restart` registered in `generate_handler`; generation-guard + unlink-flag + capped auto-respawn logic line-verified; compiles on tag CI 🪟 |
| PS-052 WhatsApp reconnect — behaviour | 📋 scenarios for the next Windows run: (a) revoke pairing on phone → app wipes session, respawns, fresh QR appears with no click; (b) "Restart connection" visible in starting/pairing/reconnecting/QR-pending states and returns to pairing; (c) explicit Unlink does NOT auto-respawn |

## 0d. Crash-safe backup/restore 3A-1…3 (executed 2026-10-11 — all green)

| Check | Result |
|---|---|
| ESLint / tsc / vitest / parity | ✅ 0 errors · clean · 87/87 · 7 models ↔ 7 tables |
| client-audit.mjs | ✅ PASS — now guards the new invariants (VACUUM INTO + quick_check + .partial; atomic `.tmp` rename + pre-restore snapshot; restore_probe + core-table validation; restore_status surfaced) |
| next build | ✅ success |
| Rust compile | 📋 review-only in sandbox (cargo unavailable) — tag CI compiles; `sqlx` promoted to a direct dep of src-tauri (same libsqlite3-sys 0.28 instance as tauri-plugin-sql) |
| PS-002 runtime scenarios | 📋 🪟 (a) Backup now on a healthy DB → toast "verified" with file size + media counts; (b) full/locked USB target → "Backup failed — nothing was written", no `.partial` left behind; (c) exit-backup failure visible in boot.log as "exit backup FAILED"; (d) 21st backup prunes the oldest (retention 20, log line) |
| PS-003 runtime scenarios | 📋 🪟 (a) staged restore with a corrupt/interrupted staged file → banner "FAILED — live database was not modified"; (b) successful restore → banner with pre-restore snapshot path; (c) kill the app mid-apply (simulated) → live DB still opens with original data |
| PS-006 runtime scenarios | 📋 🪟 (a) foreign SQLite file → probe rejects with the exact reason, nothing staged; (b) backup with sibling media-<stamp> → confirm dialog names it, media mirrored with copied/skipped counts; (c) backup without media folder → dialog says only the DB will be restored |

## 0e. Security & privacy 3B (executed 2026-10-11 — all green)

| Check | Result |
|---|---|
| ESLint / tsc / vitest / parity | ✅ 0 errors · clean · 104/104 (87 prior + 17 new `tests/security.test.ts`) · 7 models ↔ 7 tables |
| client-audit.mjs | ✅ PASS — +26 Phase-3B wiring checks (timing-safe compare, no `?token=` anywhere, Origin enforcement, cookie flow, loopback launcher, data-info redaction, fs scope narrowed, dialog perms removed, Rust picks + whitelist, CSP `script-src 'self'` no-ws, updater allowlist/digest/provenance/cleanup/length) |
| next build | ✅ success |
| Rust compile | 📋 review-only in sandbox (cargo unavailable) — tag CI compiles; `sha2 = 0.10` added (pure Rust) |
| PS-012 evidence | ✅ automated: unauth `/api/backup` → 401 with token configured; `?token=` → 401; wrong/wrong-length token → 401; cross-origin POST → 403 (even with valid token); hostile Referer → 403; same-origin POST → 200; loopback cross-port → 200; no-Origin POST → 200; GET never origin-checked; page load sets HttpOnly SameSite=Strict cookie; cookie authenticates media GET. 📋 🪟 runtime: `npm start` binds 127.0.0.1 (log line); LAN `PSAMS_BIND=0.0.0.0` without token → refused with instructions; with token → client works via header+cookie |
| PS-013 evidence | ✅ automated: `DATABASE_URL=libsql://user:sekret@host` → response contains neither `sekret` nor `libsql://`; `file:` URL still prints the local path |
| PS-014 runtime scenarios | 📋 🪟 (a) restore flow: pick file (Rust dialog) → probe → confirm → restore applies; (b) `invoke("restore_backup", { source: "C:/Windows/notepad.exe" })` from devtools → refused (not a dialog pick); (c) backup-folder pick on USB → set, exit backup lands there; (d) export CSV/PDF/JSON via pick_save_path → writes to the picked file; (e) media upload/delete still work under appdata; (f) release build: inline scripts load (Tauri hash injection) — no blank window |
| PS-015 runtime scenarios | 📋 🪟 (a) Check for updates → official asset lists; (b) download → sha256 verified, progress streams, installer saved; (c) truncated/corrupted download → error + partial file removed from Downloads; (d) install → launches; (e) `invoke("download_update", { url: "https://evil.example/x.exe", … })` → refused before any byte; (f) `invoke("install_update", { path: "<any other .exe>" })` → refused (not this session's verified download) |

## 1. Financial integrity (Phase 4)

| ID | Case | Source finding | Status |
|---|---|---|---|
| T-F1 | Valid payment (single + multi-month) → 201, one row, receipt RC-… | baseline guard | ✅ `phase4-financial` — real route, disposable DB; multi-month = ONE receipt, JSON months agree; ledger row per month |
| T-F2 | Amount mismatch / zero / negative / NaN → 400 | PS-009 | ✅ `phase4-financial` — mismatch 400 "must match"; 0/−500/NaN all 400 |
| T-F3 | Malformed month (`2026-13`, `2026-1`, `abc`) → 400 | baseline | ✅ `phase4-financial` — all 400 "YYYY-MM"; **numeric month entry → 400 after the Phase-4 hardening** (was a 500 via Prisma query build) |
| T-F4 | Month before registration / registration month itself / future month → 400 | PS-008 | ✅ unit tests (bounds); future month also via real route |
| T-F5 | Duplicate month in one request → 400 | baseline | ✅ `phase4-financial` — 400 "Duplicate billing months" + zero rows written |
| T-F6 | Zero-fee student: status settled, collect rejected, never defaulter | PS-004 | ✅ unit + route-level re-run (`phase4-financial`): dueAmount 0, collect 400, zero receipts written |
| T-F7 | Fee change mid-tenure → pinned policy (Q1) | PS-007 | ✅ `phase4-financial` — old receipt keeps its amount; pending months reprice at the CURRENT fee; collect at the stale fee → 400; collect at the new fee → 201 |
| T-F8 | **Two concurrent collects, same month** → exactly one 201, one 409; paidMonths single-count | PS-001 | ✅ web (integration test, live backend); 📋 desktop runtime proof |
| T-F9 | **Concurrent receipt numbering** → no duplicate receiptNo; loser re-validates | PS-001 | ✅ `phase4-financial` — two simultaneous collects (different students) both 201 with DISTINCT RC- numbers |
| T-F10 | Failed insert leaves no partial payment/allocation (forced failure) | PS-001 | ✅ `phase4-financial` — unknown student → 404; FeePayment + PaymentMonth counts byte-identical before/after |
| T-F11 | Fractional fees (`x.99`) through validator + dueAmount sums | PS-009 | ✅ unit tests (roundMoney, 499.99 tolerance, rounded dueAmount) |
| T-F12 | paymentDate future/invalid → 400; mode outside allowlist → 400 | PS-008 | ✅ web (integration test via real route) + unit tests |
| T-F13 | Existing receipts byte-identical after MN-1 migration; totals reconcile (counts + sums per table) | MN-1 | ✅ reconciliation check runs on every boot (integration test asserts `COUNT(PaymentMonth) == SUM(json_array_length(months))` on the seeded demo DB + the 150-receipt volume fixture keeps the invariant); legacy-shaped upgrade battery = T-M1 |
| T-F14 | Fees-screen month stats == dashboard monthRevenue at 150 receipts | PS-010 | ✅ `phase4-financial` — 150 synthetic receipts: dashboard revenue reconciles; fees statuses show the month PAID for every fixture student; ledger month-filter returns the full set |

## 2. Students & attendance

| ID | Case | Source | Status |
|---|---|---|---|
| T-S1 | Create: missing/blank/whitespace fields, future DOB, bad mobile, negative fee → 400 (web+desktop) | baseline | ✅ `phase4-students` (web route; the SAME shared validator rejects on desktop — design parity); 📋 desktop runtime click-through 🪟 |
| T-S2 | **Update: `{mobile:"hello"}`, `{monthlyFee:-5}`, `{dateOfBirth:"2030-01-01"}`, `{fullName:""}` → 400 (web+desktop)** | PS-017 | ✅ `phase4-students` — all four 400 against the MERGED record + row untouched; unknown id → 404 |
| T-S3 | registrationDate future / < DOB → 400 | PS-025 | ✅ `phase4-students` |
| T-S4 | Duplicate admissionNo (client-supplied) → 409; auto-generation retry keeps uniqueness | PS-050 | ✅ `phase4-students` — duplicate 409; sequential auto-creates never collide |
| T-S5 | Delete with payments → 409 + receipts intact; delete without payments → 200 + media unlinked | PS-005 | ✅ web (integration test); 📋 desktop runtime proof |
| T-S6 | Edit preserves unrelated fields (patch semantics, both backends) | baseline | ✅ `phase4-students` (web) — one-field patch leaves every other column identical |
| T-S7 | Attendance: `2025-02-31` → 400; future date → 400; duplicate (studentId,date) within batch → 400/upsert per policy | PS-026 | ✅ `phase4-students` — impossible date 400 (nothing saved), future 400, hostile batch 400; duplicate-in-batch = documented UPSERT policy (last wins, ONE row) |
| T-S8 | Attendance stats exclude Inactive students | PS-026 | ✅ `phase4-students` — dashboard counts ACTIVE marks only while the register keeps both rows |
| T-S9 | Search/filter correctness at 1k / 5k / 10k synthetic students (p95 budget) | PS-030 | ✅ `phase4-perf` — indexed search p50 **7 ms** at every volume (budget 2 s); full-list + filters verified correct at 10k |
| T-S10 | phoneDigits edge set (`0919…`, `+91 …`, `0091…`) | PS-033 | ✅ `phase4-students` — loop policy: clean prefixes collapse to 10 digits; the ambiguous `0919…` paste becomes an INVALID remnant (validator rejects) — never a silently-wrong valid number |

## 3. Backup & restore (disposable DBs; 🪟 where noted)

> The crash-safe backup/restore engine is Rust desktop code (3A-1…3) — the sandbox has no cargo, so the T-B battery executes on the next Windows run. The invariants themselves ARE statically guarded today: client-audit asserts VACUUM INTO + quick_check + `.partial` staging, atomic `.tmp` rename + pre-restore snapshot, restore_probe validation, and restore_status surfacing (see §0d/§0e).

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
| T-A1 | No token: non-loopback GET `/api/backup` and `/api/media` denied | PS-012 | ✅ `tests/security.test.ts` (unauth PII dump → 401; query-token rejected; cookie flow green) |
| T-A2 | No token: cross-origin `no-cors` POST to `/api/payments` rejected (Origin check) | PS-012 | ✅ `tests/security.test.ts` (cross-origin POST 403 even with valid token; hostile Referer 403; no-Origin POST allowed; GET never origin-checked) |
| T-A3 | Token mode: valid header accepted; `?token=` no longer accepted; timing-safe compare | PS-012 | ✅ `tests/security.test.ts` + client-audit (timing-safe, wrong/wrong-length → 401) |
| T-A4 | data-info never contains credentials (libsql URL case) | PS-013 | ✅ `tests/security.test.ts` (libsql URL with password → neither secret nor scheme echoed; `file:` still prints the local path) |
| T-A5 | Server binding: standalone listens on 127.0.0.1 by default | PS-012 | ✅ static: client-audit guards the loopback launcher + `npm start` path; 📋 🪟 runtime log-line evidence (`npm start` → 127.0.0.1) |
| T-A6 | Upload: oversized / wrong ext / wrong MIME / hostile filename → 4xx; path stays in media/ | baseline (route verified) | ✅ `phase4-media` — 10 MB+1 → 415, `.exe` → 415, text/html-as-.png → 415, hostile filename flattened to a safe flat photos/ path; round-trip serve + nosniff header verified |
| T-A7 | Media: traversal set (`..`, `%2e%2e`, backslash, absolute) → 400 | baseline | ✅ `phase4-media` — full set 400; regex-shaped `photos/..` never serves content (404); security contract = never 200 with outside bytes |
| T-A8 | Updater: non-release URL → Err; truncated download → Err + file removed (🪟 e2e) | PS-015 | 📋 🪟 (Rust sidecar logic review-verified; e2e on Windows) |

## 5. Reports, exports, UI

| ID | Case | Source | Status |
|---|---|---|---|
| T-R1 | UI counts == PDF/Excel/print rows for defaulters, reports, attendance (same filtered set) | PS-035/043 | 📋 🪟 (needs the browser print pipeline; PDF surface reviewed in 3D-1/2) |
| T-R2 | Receipt history beyond 200 records: totals labelled/windowed correctly | PS-010 | ✅ `phase4-financial` — ledger topped past 200: `limit=200` returns EXACTLY 200, strict paymentDate DESC, no duplicate receiptNo |
| T-R3 | CSV: leading `= + - @ \t \r` neutralized when exportCSV is wired | PS-038 | ✅ `phase4-exports` — REAL exportCSV blob round-trip-parsed: every hostile lead prefixed `'`, innocent values untouched, NO cell anywhere starts a formula character |
| T-R4 | PDF: no U+20B9 mojibake; Malayalam name renders (embedded font); foot once | PS-036 | 📋 🪟 (₹→`Rs.` guard + showFoot:'lastPage' shipped in 3D-2; embedded Malayalam font = documented follow-up needing a font asset) |
| T-R5 | Save-dialog cancel: no second download, neutral toast (desktop stub + browser) | PS-037 | 📋 🪟 (`saveBlob → {saved, cancelled}` shipped; cancel semantics need WebView2) |
| T-R6 | Print layouts on real A4/A5/80 mm (🪟 printer) or documented simulation | baseline CSS | 📋 🪟 |
| T-R7 | Web print paper shows only the document (no dialogs/toasts) | PS-041 | ✅ `phase4-exports` source contract — `@media print` block suppresses Radix portals/dialogs + sonner toaster |
| T-R8 | Stale-request: student-detail + students search out-of-order resolution | PS-018/031 | ✅ `phase4-exports` source contract — search carries the seq-token guard; detail carries the `alive` effect flag |
| T-R9 | Guard set: achievement delete confirm, attendance bulk overwrite confirm, unlink confirm, remind busy/offline | PS-042 | ✅ `phase4-exports` source contract — unlink AlertDialog, attendance overwrite confirm, remind busy/offline gate all present |
| T-R10 | WhatsApp: failed text vs failed attachment distinctly surfaced (existing behavior, regression-locked) | baseline | ✅ `phase4-exports` source contract — result type distinguishes `attachment` from text path; typed `error?` on both |
| T-R11 | Demo: concurrent load → one batch; forced mid-load failure → nothing persisted, removable | PS-021 | ✅ `phase4-students` — concurrent POSTs → exactly one 201 + one 409; tracked IDs all present; DELETE removes every row + the flag |

## 6. Migration & parity (Phases 4–5)

| ID | Case | Source | Status |
|---|---|---|---|
| T-M1 | Legacy-shaped DBs (pre-gender, pre-ledger) upgrade on boot — web + desktop; data preserved | PS-019/020/MN-2 | ✅ `phase4-migration` — real pre-gender v1.5 DB: migration applies, rows survive with default gender, `user_version` advances, re-run is a no-op; manual-push installs skip cleanly; a failing migration is LOUD (names itself) and leaves the frontier untouched (PS-023). Desktop shares the same runner list — 📋 🪟 boot click-through |
| T-M2 | Parity mutation test: remove UNIQUE/FK/index from a schema copy → parity exits 1 | PS-044 | ✅ `phase4-migration` — FK action mutated (RESTRICT→CASCADE) → exit 1 with the exact complaint; ledger UNIQUE mutated → exit 1; tracked file restored byte-identical (asserted) |
| T-M3 | Endpoint-existence: every `api.ts` path has a route file (would have caught PS-016) | PS-016 | ✅ `tests/api-routes.test.ts` (in verify since 3C) |
| T-M4 | Full web/desktop parity matrix walkthrough (Phase 5) | — | 📋 (Phase 5) |
| T-M5 | Perf battery 100/1k/5k/10k students: dashboard, fees statuses, month filter, reports | PS-030 | ✅ `phase4-perf` — all four stages green. p50 medians @10k: search 7 ms · month filter 73 ms · statuses 202 ms · dashboard 216 ms. Budgets: indexed search < 2 s, surfaces < 15 s, ledger filter < 3 s (algorithmic-regression tripwires, not latency certification) |
