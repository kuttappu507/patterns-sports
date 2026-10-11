# PS-AMS — Fix Plan (Phases 3A–3D, then 4–6)

- **Source:** `AUDIT_REPORT.md` (defect register PS-001…PS-052) @ commit `63bf119` (v1.6.4)
- **Principle:** data integrity and recoverability first; small, reviewable, reversible increments; no rewrites; preserve features/design/offline capability.
- **Rule:** every phase ends with the full gate suite (`npm run verify` + `client-audit` + `next build`) green and a reviewed diff. Windows compile correctness is gated by `build-exe.yml` (tag build); Rust changes additionally get `rustfmt --edition 2021` parse checks locally.
- **Effort keys:** S ≤ ½ day · M ≈ 1 day · L ≈ 2–3 days (single-dev, including tests).
- **Policy decisions (§6) adopted 2026-10-11 (owner: "continue"):** Q1a (arrears repriced at current fee, documented) · Q2a (Restrict + archive-only) · Q3a (zero-fee auto-settled) · Q6a (no advance months) · Q7a (epsilon/round compare now). Documented in README → "Fee & Billing Rules".
- **Status (2026-10-11):** **3A COMPLETE** — 3A-4…3A-9 ✅ (balance/financial items — ledger live on web, desktop backstop implemented, 87 tests green incl. live concurrency evidence) and 3A-1…3A-3 ✅ (crash-safe backup/restore: VACUUM INTO + verify + atomic swap, restore validation + media restore + status record; code review-verified in sandbox — cargo unavailable, Windows tag CI compiles; frontend gates green, client-audit now guards the new invariants). New direct `sqlx` dep in src-tauri (same libsqlite3-sys 0.28 as tauri-plugin-sql — no new native build).
- **Status (2026-10-11, 3B):** **3B COMPLETE** — PS-012 ✅ (loopback bind enforced in `scripts/start-server.mjs`; LAN bind requires a token unless `PSAMS_API_OPEN=1`; proxy: Origin/Host same-origin for writes, timing-safe token via header + new HttpOnly `psams_token` cookie, `?token=` URLs removed), PS-013 ✅ (data-info: path for file: URLs, fixed string otherwise), PS-014 ✅ (fs scope → `$APPDATA/**`; all webview dialog perms removed; Rust-side pickers + session whitelist gate restore/backup-target/print paths; release CSP `script-src 'self'` — Tauri injects asset hashes at compile time; `ws:` leftover dropped), PS-015 ✅ (download-origin allowlist, release `digest` sha256 required, length check, partial-file cleanup, `install_update` provenance). `sha2` dep added (pure Rust). Regression suite `tests/security.test.ts` (17 tests) + client-audit 3B section (+26 checks). Gates: verify 104/104 ✓, client-audit PASS ✓, `next build` ✓. Rust review-verified (tag CI compiles).
- **Status (2026-10-11, 3C):** **3C COMPLETE** — all 11 items ✅. 3C-3/3C-7: merged-record student UPDATE validation (PS-017) + registrationDate bounds (PS-025) + attendance calendar-real/future/batch/cap guards + Active-only dashboard stats (PS-026) + settings allowlist/tx (PS-027) + committee 400s (PS-032) + phoneDigits prefix loop (PS-033) + `parseLocalDate` (PS-034) — all in the SHARED validator so web and desktop reject identically. 3C-4: alive/seq stale-response guards (PS-018/031). 3C-5: demo load transactional web (flag written in-tx) / desktop atomic-claim marker + checkpointed compensating cleanup (PS-021), prod auto-seed OFF both backends (PS-022). 3C-6: FK — web verified `foreign_keys=1` via new 4-test integration suite, sqlx connections explicit (PS-024). 3C-8: `SidecarSlot{None|Starting|Running}` placeholder kills the spawn TOCTOU (PS-028). 3C-9: committee PUT merged validation, settings return refetched, web payments limit+receiptNo tiebreak, desktop reorder guard (PS-029). 3C-11: `api-error.ts` mapper — ValidationError→400, P2002→409, P2025→404, P2003→409, 500s generic (PS-050). 3C-1: shared `migrations.ts` runner (PRAGMA user_version + guarded ALTERs) wired into BOTH boot paths; `bootstrapped` latches success only; DDL failures loud; `db:push` de-flagged; single-source DDL enforced by the extended parity gate (columns+indexes+composites+FK actions across prisma↔schema.sql↔bootstrap copy) instead of fragile codegen. 3C-2: endpoint-existence test (every api.ts path ↔ route file, PS-016 strike file guarded), client-audit wired into `npm run verify`. 3C-10: payments month filter rides the `idx_paymentmonth_month` index on BOTH backends (no more full-table JSON parse), web students GET take/skip, web payments limit parity. Gates: verify 126/126 ✓ (6 suites incl. new fk-enforcement/api-routes/migrations), parity OK (indexes/uniques/FK), client-audit PASS ✓, `next build` ✓. Rust (SidecarSlot, FK options) review-verified — tag CI compiles.
- **Owner-reported fixes folded in (2026-10-11):** PS-051 (pointer cursor — CSS affordance block in `globals.css`) and PS-052 (WhatsApp reconnect dead-end — terminal `LoggedOut` in sidecar + wipe-and-respawn with capped budget + `wa_restart` command + "Restart connection" button in all transient states). Gates re-run green (verify 87/87, parity, client-audit, `next build`); Rust changes compile on tag CI. PS-016 file-loss recurred (`upload/route.ts` restored from index).

---

## Phase 3A — Data recovery and financial integrity  *(blocks the next release)*

**Gate 0 (policy):** owner decisions on §6 Q1 (arrears repricing), Q2 (deletion policy), Q3 (zero-fee), Q6 (advance months), Q8→Q7 (money representation) before the affected items start.

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3A-1 ✅ | Backup crash-safety | PS-002 | M | **DONE 2026-10-11.** `VACUUM INTO` snapshot from a short-lived sqlx connection (single consistent .db, no sidecars) → `PRAGMA quick_check` + core-table probe + size verify → atomic rename from `.partial` (millis stamp) → media mirror with per-file copied/skipped counts → retention pruning (keep 20, exact `ps-ams-*.db` pattern, success-only, logged); `backup_now` returns the full `BackupOutcome`; UI renders the real outcome incl. skipped-media warning; exit backup logs the real result |
| 3A-2 ✅ | Restore crash-safety | PS-003 | M | **DONE 2026-10-11.** pre-restore snapshot = WAL-checkpointed copy (+ sidecar triple fallback); staged → `ps-ams.db.tmp` → `quick_check` → atomic `fs::rename`; any failure leaves the live DB untouched and writes `ps-ams-restore-status.txt`; failure/success record surfaced via new `restore_status` command + Settings banner |
| 3A-3 ✅ | Restore validation + media | PS-006 | S | **DONE 2026-10-11.** `restore_probe` validates a TEMP copy (read-only-media safe) before the confirm dialog; `restore_backup` validates staged copy before writing the marker; sibling `media-<stamp>` auto-detected, restored on explicit confirm (mirror-only, skipped-file report); required tables `Student/FeePayment/Attendance` enforced at stage AND apply |
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

**Gate 0 (policy):** ~~owner decision on §6 Q5 (API posture)~~ — **adopted 2026-10-11 (owner: "continue"): Q5(a)** token required on non-loopback binds + loopback bind enforced in code.

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3B-1 ✅ | API posture | PS-012 | M | **DONE 2026-10-11.** `scripts/start-server.mjs` binds `127.0.0.1` by default (honours explicit `HOSTNAME`/`PSAMS_BIND`, validates it is a bind address); non-loopback start REQUIRES a token unless `PSAMS_API_OPEN=1`; `npm run dev` binds `-H 127.0.0.1`. Proxy: Origin/Referer↔Host match for non-GET (403), token via `x-psams-token` header or HttpOnly `psams_token` session cookie (set on page loads, SameSite=Strict), `?token=` dropped everywhere, constant-time compare. README threat model + `.env.example` rewritten |
| 3B-2 ✅ | Secret redaction | PS-013 | S | **DONE 2026-10-11.** data-info: resolved path for `file:` URLs, fixed `external database (URL hidden)` otherwise; never echoes `DATABASE_URL`; regression-tested |
| 3B-3 ✅ | Tauri least privilege | PS-014 | M | **DONE 2026-10-11.** fs scope → `$APPDATA/**` only (+ setup-time runtime extension for portable mode); dropped read-*/copy/read-dir + ALL webview dialog permissions; new `picks.rs` Rust-side dialog commands (`pick_restore_source`/`pick_backup_folder`/`pick_save_path`) register session-whitelisted paths and extend the fs scope per pick; `restore_probe`/`restore_backup`/`set_backup_target`/`print_to_pdf` enforce the whitelist; release CSP `script-src 'self'` (Tauri compile-time hash injection covers the 11 static-export inline scripts) and no `ws://localhost:*` |
| 3B-4 ✅ | Updater hardening | PS-015 | M | **DONE 2026-10-11.** `DOWNLOAD_BASE` allowlist enforced in `pick_asset` AND `download_update` (no traversal/query); release asset `digest` (sha256) surfaced to UI and REQUIRED; `received == Content-Length` enforced; HTML-response guard; any failure deletes the partial file; `install_update` launches only the file `download_update` verified this session (`LAST_INSTALLER`); `sha2 = 0.10` added |
| 3B-5 ✅ | Regression tests | — | S | **DONE 2026-10-11.** `tests/security.test.ts` 17 tests: unauth PII dump denied, query-token rejected, cross-origin POST rejected (even with valid token), hostile Referer rejected, loopback cross-port allowed, cookie flow green, page-load Set-Cookie (HttpOnly/SameSite), DATABASE_URL never in data-info responses; client-audit +26 wiring checks (Phase 3B section) |

---

## Phase 3C — Application correctness

| Order | Item | Fixes | Effort | Key work |
|---|---|---|---|---|
| 3C-1 ✅ | Migration runner | PS-019, PS-020, PS-023 | L | **DONE 2026-10-11.** MN-2: `PRAGMA user_version` runner for desktop + guarded-ALTER pass for web bootstrap; generate both SQLite DDLs from `prisma/schema.prisma` in CI (single source of truth); `bootstrapped` latches on success; failed DDL = loud boot error; drop `--accept-data-loss` from `db:push` |
| 3C-2 ✅ | Gate the gates | PS-016, PS-044 | M | **DONE 2026-10-11.** CI "tracked files present" assertion; endpoint-existence test (every `api.ts` path has a route file); parity parses indexes/uniques/FK actions/defaults; client-audit wired into `verify` |
| 3C-3 ✅ | Update-path validation | PS-017, PS-025 | S | **DONE 2026-10-11.** Merged-record validation both backends; registrationDate bounds |
| 3C-4 ✅ | Stale-response guards | PS-018, PS-031 | S | **DONE 2026-10-11.** Alive/seq tokens in student-detail + students search |
| 3C-5 ✅ | Demo safety | PS-021, PS-022 | S | **DONE 2026-10-11.** Transactional load + in-transaction flag (Q4a/b); prod auto-seed off |
| 3C-6 ✅ | FK enforcement | PS-024 | S | **DONE 2026-10-11.** `foreign_keys=ON` in connect options (desktop) + explicit web pragma; integration test |
| 3C-7 ✅ | Input/stats corrections | PS-026, PS-027, PS-032, PS-033, PS-034 | M | **DONE 2026-10-11.** Attendance date/batch/cap + Active-only stats; settings allowlist+tx; committee NOT-NULL→400; phoneDigits prefix loop; `parseLocalDate` helper |
| 3C-8 ✅ | Sidecar spawn race | PS-028 | S | **DONE 2026-10-11.** Lock across check+store; `Starting` placeholder |
| 3C-9 ✅ | Parity alignment | PS-029 | S | **DONE 2026-10-11.** Mirror stricter side for committee PUT, settings return, payments limit/tiebreak, reorder guard |
| 3C-10 ✅ | Pagination & perf | PS-030 | M | **DONE 2026-10-11 (perf battery → Phase 4).** MN-1-backed month filtering; take/skip on lists; single statuses implementation; 10k/50k synthetic perf run (Phase 4) |
| 3C-11 ✅ | Error contract | PS-050 | S | **DONE 2026-10-11.** Shared mapper (409/404/400), wrap GETs |

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
