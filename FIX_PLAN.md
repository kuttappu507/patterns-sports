# PS-AMS — Fix Plan (Phases 3A–3D, then 4–6)

- **Source:** `AUDIT_REPORT.md` (defect register PS-001…PS-050) @ commit `63bf119` (v1.6.4)
- **Principle:** data integrity and recoverability first; small, reviewable, reversible increments; no rewrites; preserve features/design/offline capability.
- **Rule:** every phase ends with the full gate suite (`npm run verify` + `client-audit` + `next build`) green and a reviewed diff. Windows compile correctness is gated by `build-exe.yml` (tag build); Rust changes additionally get `rustfmt --edition 2021` parse checks locally.
- **Effort keys:** S ≤ ½ day · M ≈ 1 day · L ≈ 2–3 days (single-dev, including tests).
- **Policy decisions (§6) adopted 2026-10-11 (owner: "continue"):** Q1a (arrears repriced at current fee, documented) · Q2a (Restrict + archive-only) · Q3a (zero-fee auto-settled) · Q6a (no advance months) · Q7a (epsilon/round compare now). Documented in README → "Fee & Billing Rules".
- **Status (2026-10-11):** 3A-4…3A-9 ✅ DONE (balance/financial items — ledger live on web, desktop backstop implemented, 87 tests green incl. live concurrency evidence); 3A-1…3A-3 (Rust backup/restore) still pending — cargo unavailable in sandbox, Windows CI compiles on tag.

---

## Phase 3A — Data recovery and financial integrity  *(blocks the next release)*

**Gate 0 (policy):** owner decisions on §6 Q1 (arrears repricing), Q2 (deletion policy), Q3 (zero-fee), Q6 (advance months), Q8→Q7 (money representation) before the affected items start.

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3A-1 | Backup crash-safety | PS-002 | M | `VACUUM INTO` snapshot from a short-lived connection (single consistent .db, no sidecars) → `PRAGMA quick_check` + size verify → mirror media with per-file error counts → return success/failure counts; `backup_now` propagates failure; `.partial` staging + timestamp with millis; retention pruning (keep N); UI renders real outcome incl. skipped-file counts |
| 3A-2 | Restore crash-safety | PS-003 | M | pre-restore snapshot = checkpointed copy (or db+wal+shm together); staged → `.tmp` → `quick_check` → atomic `fs::rename`; auto-rollback from `pre` on any failure; failure record surfaced to UI |
| 3A-3 | Restore validation + media | PS-006 | S | post-stage validation (`quick_check` + `Student/FeePayment/Attendance` present + optional schema version); optional media restore from sibling `media-<stamp>` with confirm + skipped-file report |
| 3A-4 ✅ | Billing allocation ledger | PS-001 (+PS-030 month filtering) | L | **DONE 2026-10-11.** `PaymentMonth(studentId, month, paymentId)` + `UNIQUE(studentId,month)` in all 3 DDL copies + Prisma; boot-time backfill from `months` JSON (first receipt wins, clashes reported, never rewritten) on BOTH backends; reconciliation check runs every boot; web collect = `db.$transaction` (read + ledger pre-check + validate + insert + allocations, retry re-validates, clash → 409); desktop = UNIQUE backstop + compensating cleanup (plugin pool cannot host BEGIN…COMMIT — verified against tauri-plugin-sql 2.2.0 source; documented in tauri-api.ts); live concurrency evidence: tests/payments-ledger.integration.test.ts |
| 3A-5 ✅ | Zero-fee handling | PS-004 | S | **DONE.** `computeFeeStatus`: `monthlyFee <= 0` ⇒ settled + tests |
| 3A-6 ✅ | Deletion guard | PS-005 | M | **DONE.** `onDelete: Restrict` for FeePayment in 3 DDL copies + Prisma (fresh DBs; legacy FK rebuild rides the 3C migration runner — documented); 409 when payments exist (Q2a) on BOTH backends; desktop delete = explicit cascade + PaymentMonth first + media unlink; media unlink on web |
| 3A-7 ✅ | Payment input bounds | PS-008, PS-011 | S | **DONE.** window bounds + calendar-real paymentDate ≤ today + mode allowlist in `assertValidPayment` (Q6a); reminder period list uses `pendingMonths` |
| 3A-8 ✅ | Money precision | PS-009 | S | **DONE.** `roundMoney` + half-rupee tolerance compare in `assertValidPayment` + rounded `dueAmount` (Q7a); Int-paise deferred |
| 3A-9 ✅ | Arrears policy | PS-007 | S | **DONE.** Q1a policy documented in `computeFeeStatus`/`assertValidPayment` JSDoc + README "Fee & Billing Rules"; `feeAtAccrual` column not needed (Q1a) |

**Migration safety protocol (applies to 3A-4/3A-6):** build legacy-shaped fixture DBs (pre-`gender`, pre-ledger), run the migration on copies, compare before/after counts and sums per table, produce a reconciliation report, and only then ship. Never migrate a real database automatically without a verified backup and owner approval.

**Exit criteria:** two concurrent collects cannot double-book (automated test); restore-failure simulation leaves the live DB intact; every backup verifies before "success"; fixtures reconcile.

---

## Phase 3B — Security and privacy

**Gate 0 (policy):** owner decision on §6 Q5 (API posture).

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3B-1 | API posture | PS-012 | M | bind standalone server to `127.0.0.1` (honour explicit `HOSTNAME`); require token by default with explicit opt-out env; Origin/Host match for non-GET; header-only token; timing-safe compare; update README threat model |
| 3B-2 | Secret redaction | PS-013 | S | data-info: path for `file:` URLs, fixed string otherwise |
| 3B-3 | Tauri least privilege | PS-014 | M | fs scope → `$APPDATA/**` + runtime-extend after dialog picks; drop `unsafe-inline`/`ws:` from release CSP; dialog-session-scoped restore/target paths |
| 3B-4 | Updater hardening | PS-015 | M | URL allowlist (own releases), sha256 from release `digest`, length verification, partial-file cleanup, installer-launch provenance check |
| 3B-5 | Regression tests | — | S | route tests: unauthenticated PII dump denied; cross-origin POST rejected; DATABASE_URL never in responses |

---

## Phase 3C — Application correctness

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3C-1 | Migration runner | PS-019, PS-020, PS-023 | L | MN-2: `PRAGMA user_version` runner for desktop + guarded-ALTER pass for web bootstrap; generate both SQLite DDLs from `prisma/schema.prisma` in CI (single source of truth); `bootstrapped` latches on success; failed DDL = loud boot error; drop `--accept-data-loss` from `db:push` |
| 3C-2 | Gate the gates | PS-016, PS-044 | M | CI "tracked files present" assertion; endpoint-existence test (every `api.ts` path has a route file); parity parses indexes/uniques/FK actions/defaults; client-audit wired into `verify` |
| 3C-3 | Update-path validation | PS-017, PS-025 | S | merged-record validation both backends; registrationDate bounds |
| 3C-4 | Stale-response guards | PS-018, PS-031 | S | alive/seq tokens in student-detail + students search |
| 3C-5 | Demo safety | PS-021, PS-022 | S | transactional load + in-transaction flag (Q4a/b); prod auto-seed off |
| 3C-6 | FK enforcement | PS-024 | S | `foreign_keys=ON` in connect options (desktop) + explicit web pragma; integration test |
| 3C-7 | Input/stats corrections | PS-026, PS-027, PS-032, PS-033, PS-034 | M | attendance date/batch/cap + Active-only stats; settings allowlist+tx; committee NOT-NULL→400; phoneDigits prefix loop; `parseLocalDate` helper |
| 3C-8 | Sidecar spawn race | PS-028 | S | lock across check+store; `Starting` placeholder |
| 3C-9 | Parity alignment | PS-029 | S | mirror stricter side for committee PUT, settings return, payments limit/tiebreak, reorder guard |
| 3C-10 | Pagination & perf | PS-030 | M | MN-1-backed month filtering; take/skip on lists; single statuses implementation; 10k/50k synthetic perf run (Phase 4) |
| 3C-11 | Error contract | PS-050 | S | shared mapper (409/404/400), wrap GETs |

## Phase 3D — Exports, print, release quality

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3D-1 | Defaulters print fix | PS-035 | S | map status rows → roster shape; type the payload union |
| 3D-2 | PDF rendering | PS-036, PS-040 | M | `Rs.` headers, embedded Noto Sans (Latin+Malayalam subset), `showFoot:'lastPage'`, INR-formatted cells, A6 preview class, paper-aware web receipt, thermal notes |
| 3D-3 | Save-dialog semantics | PS-037, PS-038 | S | `saveBlob → {saved}`; no `saveAs` fallback in Tauri; CSV-injection guard when `exportCSV` is used |
| 3D-4 | Print CSS + UI guards | PS-041, PS-042, PS-043 | M | suppress portals/toasts in `@media print`; confirm/busy/offline guards (achievement delete, attendance bulk, unlink, remind, collect reopen); consistency polish batch (badges, toasts, empty states, aria-labels, deep-links, img onError) |
| 3D-5 | WhatsApp wording | PS-039 | S | "sent · queued" wording (Q7-adjacent, no protocol change) |
| 3D-6 | Repo hygiene | PS-046, PS-047, PS-048, PS-049, PS-045 | M | delete/mark legacy `tauri/` + `src-tauri/sidecar/`; self-healing stash script; engines/packageManager + portable scripts; align defaults + drop duplicate index; commit Cargo.locks, pin actions by SHA, freeze release installs, fix bun.lock name |

---

## Phases 4–6 (after 3A–3D)

- **Phase 4:** implement `TEST_MATRIX.md` (concurrency, migration, restore/rollback, security, parity, perf batteries; disposable data only).
- **Phase 5:** web/desktop parity matrix — every workflow marked equivalent / intentionally different / defective; shared domain tests already cover the core; PS-029/PS-030 items fold in.
- **Phase 6:** release verification → `RELEASE_REPORT.md` (fixed IDs, files, migration evidence, executed vs not-executed tests, remaining risks, manual acceptance checklist). Windows runtime items (printers, updater end-to-end, WAL tear timing) are reported explicitly as environment-limited where they cannot be executed here.

## Approval gates

1. **Now:** approve this plan + the seven policy decisions (AUDIT_REPORT §6).
2. **After 3A:** review migration reconciliation report before any real-DB migration is offered.
3. **After 3D:** release-candidate tag (`v1.7.0` suggested: behavioral + schema changes) → CI → manual acceptance checklist → release.
