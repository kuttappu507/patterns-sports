# PS-AMS — Release Report (v1.7.0-rc.1)

**Date:** 2026-10-12 · **Commit:** `553c33e` (main) · **Baseline audited:** v1.6.4 @ `63bf119`
**Nature:** behavioral + schema changes → minor version bump, release-candidate.
**Process:** six-phase audit-and-fix pipeline (Phase 1 audit A–J → Phase 2 defect register → Phase 3 fixes 3A/3B/3C/3D → Phase 4 regression battery → Phase 5 parity walkthrough → this report). Owner decisions Q1a/Q2a/Q3a/Q6a/Q7a + Q5a adopted and documented in README "Fee & Billing Rules".

## 1. Fixed defects (PS-001…PS-052 — all 52 closed)

| Phase | Defects | Fix headline | Verified by |
|---|---|---|---|
| 3A (financial integrity) | PS-001 | PaymentMonth ledger + UNIQUE(studentId,month); web collect = single transaction with ledger pre-check; desktop UNIQUE backstop + compensating cleanup; boot backfill + reconciliation on BOTH backends | T-F8/T-F9/T-F10/T-F13/T-F14 (live concurrency evidence) |
| 3A | PS-002 | Crash-safe backup: `VACUUM INTO` snapshot → quick_check + core-table probe → atomic `.partial` rename → media mirror with counts → retention (keep 20, success-only) | client-audit invariants; 🪟 runtime battery T-B1–B4 |
| 3A | PS-003 | Crash-safe restore: WAL-checkpointed pre-restore snapshot, staged `.tmp` + quick_check + atomic rename, failure/success record surfaced via `restore_status` + Settings banner | client-audit invariants; 🪟 T-B7–B10 |
| 3A | PS-006 | Restore validation on a TEMP copy before the confirm dialog; sibling `media-<stamp>` restore with copied/skipped report; required core tables enforced | client-audit; 🪟 T-B5/B6/B8 |
| 3A | PS-004 / PS-005 / PS-007 / PS-008 / PS-009 / PS-011 | Zero-fee auto-settled (Q3a); delete → 409 + Alumni guidance + FK RESTRICT (Q2a); arrears policy documented (Q1a); billing window/date/mode bounds (Q6a); half-rupee money tolerance (Q7a); reminder months == outstanding | T-F2/F4/F6/F7/F11/F12 + unit suite |
| 3B (security) | PS-012 | Loopback bind by default; token required off-loopback (timing-safe, header + HttpOnly cookie, `?token=` removed); Origin/Referer↔Host enforcement on writes | 17-test security suite (401/403/200 matrix) |
| 3B | PS-013 | data-info redacts non-file URLs; never echoes DATABASE_URL | security suite (libsql secret case) |
| 3B | PS-014 | fs scope `$APPDATA/**`; webview dialogs removed → Rust-side pickers + session whitelist; release CSP `script-src 'self'`; no `ws://` | client-audit +26 checks; 🪟 PS-014 scenarios |
| 3B | PS-015 | Updater: download-origin allowlist, REQUIRED sha256 digest, length check, partial-file cleanup, provenance-locked `install_update` | client-audit; 🪟 T-A8 |
| 3C (correctness) | PS-016 | tracked-files gate FIRST in verify + endpoint-existence test (route ↔ api.ts) + upload route guarded | check:tracked + T-M3 (api-routes suite) |
| 3C | PS-017 / PS-018 / PS-025 / PS-026 / PS-027 / PS-031 / PS-032 / PS-033 / PS-034 | Merged-record update validation; stale-response guards (alive/seq); registration-date bounds; attendance calendar/future/batch/cap + Active-only stats; settings allowlist+tx; committee 400s; phoneDigits prefix LOOP; `parseLocalDate` strict local dates | T-S1/S2/S3/S6/S7/S8/S10, T-R8 + domain suite |
| 3C | PS-019 / PS-020 / PS-023 | Shared migration runner (PRAGMA user_version) wired into BOTH boots; guarded ALTER for manual-push installs; DDL failures loud; `db:push --accept-data-loss` removed | T-M1 (upgrade + loud failure) |
| 3C | PS-021 / PS-022 | Demo load transactional (flag in-tx) / atomic-claim desktop; prod auto-seed OFF | T-R11 |
| 3C | PS-024 | FK enforced: web pragma verified by integration test; sqlx connections explicit | fk-enforcement suite |
| 3C | PS-028 | Sidecar spawn TOCTOU closed (SidecarSlot lock + Starting placeholder) | review-verified Rust (🪟 compiles on tag CI) |
| 3C | PS-029 / PS-030 / PS-050 | Parity alignment (committee PUT, settings return, payments limit/tiebreak); indexed month filter + take/skip pagination; shared api-error mapper (400/404/409) | T-F14, endpoint suite, error-contract tests |
| 3D (exports/print/release) | PS-035 | Defaulters print → typed RosterPrintData (identity prints again) | 🪟 print pipeline (code + type-level) |
| 3D | PS-036 / PS-040 | PDF ₹→`Rs.`, INR cells, foot once, A6 preset threading (web honours preset), thermal notes; embedded Malayalam font = documented follow-up | 🪟 T-R4 |
| 3D | PS-037 / PS-038 | `saveBlob → {saved, cancelled}` honest semantics; CSV formula-injection neutralizer | T-R3 (blob round-trip) |
| 3D | PS-041 / PS-042 / PS-043 | Print CSS suppresses portals/toasts; guard set (achievement delete, attendance overwrite, unlink, remind, collect reopen); consistency polish (SafeImg ×7, toasts, mojibake) | T-R7/T-R9 source contracts; 🪟 visual |
| 3D | PS-039 | "sent · queued to WhatsApp" wording + no-delivery-receipt note | T-R10 |
| 3D | PS-045 / PS-046 / PS-047 / PS-048 / PS-049 | Actions SHA-pinned + frozen installs; legacy tauri/ + sidecar/ deleted; self-healing build script; engines/packageManager/.nvmrc + portable standalone build; duplicate index dropped | repo state + build evidence |
| Owner fixes | PS-051 | Global pointer-cursor affordance (Tailwind v4 preflight gap) | CSS block in globals.css; 🪟 visual |
| Owner fixes | PS-052 | WhatsApp reconnect: terminal `LoggedOut` → sidecar exit + wipe + capped auto-respawn; `wa_restart` command; "Restart connection" in all transient states | review-verified Rust; 🪟 PS-052 scenarios |

## 2. Migration evidence

- **MN-1 (billing ledger):** `PaymentMonth(studentId, month, paymentId)` + `UNIQUE(studentId, month)` in all three DDL copies + Prisma. Boot-time backfill from the legacy `months` JSON (first receipt wins, clashes reported, never rewritten) runs on BOTH backends; the reconciliation check (`COUNT(PaymentMonth) == SUM(json_array_length(months))`) is asserted by the integration suite on the seeded demo DB AND holds on the 150-receipt volume fixture (T-F13/T-F14). No destructive rewrite: existing receipts are untouched.
- **MN-2 (versioned runner):** `PRAGMA user_version` frontier; migration 1 = guarded `Student.gender` ALTER (skips manual-push installs). T-M1 proves: legacy v1.5-shaped DB upgrades with rows preserved, re-run is a no-op, manual-push skips cleanly, and a FAILING migration aborts loudly naming itself while leaving the frontier untouched (PS-023).
- **FK RESTRICT rebuild:** fresh DBs get `ON DELETE RESTRICT` in DDL; legacy files pick it up via the 3C migration-runner FK rebuild (SQLite cannot ALTER an FK action). Until a legacy file migrates, the application-layer 409 guard is operative — both layers tested.
- **Migration safety protocol:** no real database is migrated automatically; the upgrade path runs on a verified backup first. Owner approval for the real-DB migration remains gate 2 of the plan.

## 3. Test evidence

**Executed in the sandbox (all green at `553c33e`):**
- `npm run verify`: tracked-files gate ✓ (254 files) · ESLint 0 errors (4 pre-existing warnings) · tsc clean · **vitest 184/184 across 12 suites** · check:parity OK (7↔7 models, 70 columns, mutation-proven by T-M2) · client-audit PASS (all wiring checks)
- `next build` ✓ via the portable standalone assembler
- Phase 4 battery: financial (12), students/attendance/demo (17), media security (10), exports/CSV/UI contracts (8), migration + parity mutation (5), perf battery (6) — details in TEST_MATRIX §0f
- Perf medians @10k synthetic students: search 7 ms · ledger month filter 73 ms · fee statuses 202 ms · dashboard 216 ms

**NOT executed here (environment-limited, 🪟 Windows):**
- Rust compile (no cargo in sandbox) — gated by the `build-exe.yml` tag CI; all Rust changes review-verified line-by-line
- Crash-safe backup/restore runtime battery T-B1…B10 (real WAL/USB/kill scenarios)
- Updater e2e T-A8; WhatsApp sidecar scenarios (PS-052 reconnect trio, PS-028 spawn)
- Print/PDF visual battery T-R1/R4/R5/R6 (printers, WebView2 dialogs)
- Desktop click-throughs of the shared validators (same code as web, executed there)
- `npm start` loopback log-line evidence (T-A5 static guard is green)

## 4. Remaining risks & documented follow-ups

1. **Desktop runtime proof debt** — the 🪟 list above; cleared by running the manual acceptance checklist on the tag-CI build (§5).
2. **Embedded Malayalam font** — PDF ₹ guard ships; the embedded Noto Sans (Latin+Malayalam) subset needs a font asset committed to the repo (binary, owner decision; documented in FIX_PLAN 3D-2). Malayalam names currently render through system fonts where available.
3. **Money as Float (paise-level)** — half-rupee tolerance compare shipped (Q7a); Int-paise representation deferred as recorded (3A-8).
4. **Legacy FK rebuild timing** — legacy databases get RESTRICT at their next boot via the migration runner; until then the app-layer 409 is the operative guard (both layers tested independently).
5. **`?token=` URLs already in the wild** — the proxy no longer accepts them; operators who bookmarked token URLs must re-authenticate (README threat model updated).

## 5. Manual acceptance checklist (Windows, on the tag-CI build)

1. Boot on a COPY of the real database → boot log shows migration applied + ledger reconciled; spot-check balances, receipts, attendance.
2. Backup now → toast "verified" with size + media counts; 21st backup prunes the oldest; pull the USB mid-backup → failure toast, no `.partial` left.
3. Restore: probe a foreign .db → rejected with reason; restore a good backup → banner with pre-restore snapshot path; data intact after restart.
4. WhatsApp: revoke pairing on the phone → app wipes, respawns, fresh QR with no click; "Restart connection" returns to pairing from any transient state; Unlink asks confirm and does NOT auto-respawn.
5. Collect: two rapid double-clicks on Collect → one receipt; duplicate month rejected 409-style; amount fields can't be tricked.
6. Students: edit with `{mobile:"hello"}`-class garbage → inline 400s; delete a student with receipts → refused with Alumni guidance.
7. Exports: Excel/CSV/PDF save-dialog cancel → no second download, neutral toast; CSV opens clean in Excel (no formula execution).
8. Print: A4 roster, A6 receipt preview (true 105 mm), thermal slip notes; no dialogs/toasts on the paper.
9. Updater: check for updates → asset + digest; tamper the download → error + partial removed.
10. Web mode (if used): `npm start` binds 127.0.0.1; LAN bind refuses without token; cross-origin POST rejected.

## 6. Artifacts & provenance

- Tag: `v1.7.0-rc.1` → triggers `build-exe.yml` (SHA-pinned actions, frozen installs) producing the Windows installer + portable artifacts; Cargo.locks are generated by the cargo-enabled CI runner.
- Gates at the tagged commit: verify 184/184 · parity OK · client-audit PASS · next build ✓ — recorded in TEST_MATRIX §0f, FIX_PLAN status, and this report.
- Pipeline documents: AUDIT_REPORT.md (52 defects) · FIX_PLAN.md (fix ledger) · TEST_MATRIX.md (battery + evidence) · PARITY_MATRIX.md (Phase 5 walkthrough) · worklog.md (session log, local).
