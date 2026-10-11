# PS-AMS — Full Repository Audit Report (Phases 0–2)

- **Repository:** https://github.com/kuttappu507/patterns-sports (branch `main`)
- **Commit under audit:** `63bf119` (v1.6.4) — `main == origin/main`, tags `v1.6.2`–`v1.6.4` pushed, release v1.6.4 live (setup.exe 12 MB / msi 17 MB / portable zip 16 MB)
- **Audit date:** 2026-10-11 (Asia/Kolkata)
- **Mode:** Read-only. No application code was changed in this phase. One tracked file (`src/app/api/upload/route.ts`, 38 lines) was found missing from the working tree and was restored from the git index — see PS-016.
- **Companion documents:** `FIX_PLAN.md` (remediation order + approval gates), `TEST_MATRIX.md` (executed + planned tests), `MIGRATION_NOTES.md` (proposals only — not executed).

---

## 1. Executive summary

PS-AMS is a well-structured offline-first academy system with an unusually good foundation for its size: a single shared domain engine (`src/lib/psams/domain.ts`) drives both backends, the three financial uniqueness constraints that matter most (admission number, receipt number, attendance student+date) exist and are mirrored in all schema copies, write-path validators are shared between web and desktop, and a parity gate (`check-parity.mjs`) plus a Windows release pipeline are already in CI. The billing rules (registration month complimentary, billing from the following month, defaulter = more than one month overdue) are implemented exactly as specified and locked by tests.

The audit still surfaced **50 distinct defects (3 Critical, 11 High, 24 Medium, 12 Low)**. They cluster into five root-cause families:

1. **Backup/restore is not yet crash-safe (Critical).** `backup_now` and the exit backup raw-copy a live WAL-mode database, discard per-file copy results, perform no verification, and always report success. The staged restore applies a file that was validated only by its 16-byte SQLite magic header, takes a *torn* pre-restore safety copy (main DB without its WAL), and has **no rollback** if the in-place copy fails mid-write. A failed restore can corrupt the only live copy of the academy data while appearing to be a routine operation. (PS-002, PS-003, PS-006)
2. **Financial concurrency has an application-level guard but no database-level backstop (Critical).** Payment collection validates "already settled?" outside any transaction and the schema stores billing months as a JSON string with no way to enforce one-receipt-per-month at the DB level. Two concurrent requests (two tabs, double-submit, retried request) can both pass validation and both insert; the receipt-number retry loop then *completes* the second insert. The ledger dedupes on read, so the UI looks right while the money was taken twice. (PS-001, related: PS-009, PS-030)
3. **The web API surface is open by default and partially unvalidated (High).** With no token configured (the default), every `/api/*` route — including a full-database JSON dump of minors' PII and the media endpoint — answers unauthenticated requests, with no Origin/CSRF check on state-changing POSTs; loopback-only operation is a property of the start script, not of the app. Separately, the student **update** path performs no validation on either backend (create does), `registrationDate` is unvalidated (a future date makes a real defaulter invisible), and `/api/data-info` can return a raw `DATABASE_URL` including credentials for non-file databases. (PS-012, PS-013, PS-017, PS-025)
4. **Schema evolution has no migration story (High).** There is no `prisma/migrations/` directory; web bootstrap only runs `CREATE TABLE IF NOT EXISTS` (no column additions for existing DBs); the documented upgrade path hardcodes `prisma db push --accept-data-loss`; the desktop side keeps four hand-synced DDL copies plus a hand-maintained migration list with a single entry. The next schema change will work on fresh installs and silently break existing ones. (PS-019, PS-020)
5. **Zero-fee students, document rendering, and a handful of correctness edges (High/Medium).** Fee-waiver students permanently show as defaulters with ₹0 due; the printed defaulters roster has blank name/admission/parent columns (wrong data shape passed to the print layer); jsPDF renders `₹` as mojibake in table headers and cannot render Malayalam text at all; the desktop save-dialog cancel path falls through to a second, unreliable download; and the Windows updater will download and execute any URL/file the webview asks it to, with no checksum. (PS-004, PS-015, PS-035, PS-036, PS-037)

Positively verified (evidence in §5): the defaulter rule and dashboard/fees agreement, amount-exactness and zero/negative rejection, atomic attendance upserts on both backends, media path traversal guards, receipt/admission numbering that survives deletion, Excel formula-safety, the paper-preset agreement between CSS and native printing, WhatsApp session storage outside install dirs and outside backups, and a least-privilege `verify.yml`.

**Recommendation:** do not cut another release before Phase 3A (backup/restore crash-safety + billing allocation ledger) and 3B (API posture) are done. Everything else can follow incrementally. Fifty policy/technical decisions are itemized in `FIX_PLAN.md`; seven require a product-policy choice from the owner (§6).

---

## 2. Phase 0 — Baseline

### 2.1 Repository and environment

| Item | Value |
|---|---|
| HEAD | `63bf119` — "v1.6.4: fix Windows build — printing.rs was missing imports…" |
| Working tree | Clean, except the PS-016 incident (below). `main` is in sync with `origin/main` |
| Tags | v1.0.0 … v1.6.4 (v1.6.2–v1.6.4 pushed this release cycle) |
| App version | 1.6.4 consistent across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src/lib/psams/version.ts` |
| Node / npm / Bun | v24.21.0 / 11.19.0 / 1.3.14 (no `engines` or `packageManager` pinning exists — PS-048) |
| Rust toolchain | **Not installable/present in this Linux sandbox** (transiently available earlier the same day). Rust compile evidence therefore comes from Windows CI (authoritative for the Windows target) + `rustfmt` parse checks performed earlier in-session |
| Key resolved deps (bun.lock) | next 16.1.3, react 19.2.3, prisma + @prisma/client 6.11.1 (+ @prisma/adapter-libsql), @tauri-apps/cli+api 2.12.1, exceljs 4.4.0, jspdf 4.2.1 + autotable 5.0.8, papaparse 5.7.0, zustand 5.0.10, tailwindcss 4.1.18 |
| Databases | Web: Prisma + @libsql/client over a `file:` SQLite (`file:../db/custom.db` default). Desktop: tauri-plugin-sql (sqlx SQLite), WAL mode, DDL embedded via `include_str!` |
| Windows build | GitHub Actions `build-exe.yml` (bun + stable MSVC + tauri build; sidecar crate `whatsapp-bot/` built separately and staged as `whatsapp-bot-x86_64-pc-windows-msvc.exe`) |

### 2.2 Verification commands executed (all results captured under `scripts/phase0/`)

| Command | Result | Notes |
|---|---|---|
| `npm run lint` | **PASS** — 0 errors, **10 pre-existing warnings** | 9× `@next/next/no-img-element` (intentional `<img>` for media URLs), 1× `react-hooks/exhaustive-deps` (`use-toast`) |
| `npm run typecheck` (tsc --noEmit) | **PASS** | — |
| `npm run test` (vitest) | **PASS** — 59/59 in `tests/domain.test.ts` | Coverage gaps enumerated in `TEST_MATRIX.md` |
| `npm run check:parity` | **PASS** — 6 models ↔ 6 tables (66 columns), 29 delegations ↔ 30 tauri exports | Blind spots documented as PS-044 |
| `node scripts/client-audit.mjs` | **PASS** — wiring grep battery | Not wired into `npm run verify` or CI (PS-044) |
| `npx prisma validate` | **PASS** | — |
| `npm run build` (prisma generate + next build) | **PASS** — compiled in 18.7 s, 16/16 routes/pages | Standalone output |
| Windows release build (CI, tag v1.6.4) | **SUCCESS** — 3 release artifacts published | The authoritative Rust compile evidence for this commit |
| `cargo check` (either crate) | **NOT RUN** — toolchain absent in sandbox | Recorded as a limitation, not a failure |
| Runtime FK-pragma verification, WAL tear tests, printer tests | **NOT RUN** — require a Windows desktop + hardware | Flagged `Requires runtime verification` where relevant |

### 2.3 Pre-existing failures and warnings (recorded before any change)

- The 10 ESLint warnings above are pre-existing and were not introduced by this audit.
- **Working-tree loss incident (now PS-016):** at audit start the working tree was missing `src/app/api/upload/route.ts` — a file that is tracked at HEAD and present in the index (the sandbox that hosts this workspace intermittently drops files between sessions; the same loss was observed once before, recorded in the project worklog for the v1.6.2 cycle). It was restored from the index with `git checkout -- src/app/api/upload/route.ts` before code review resumed. **Every gate above had passed while the file was missing** — lint, tsc, vitest, parity, client-audit and even `next build` are all blind to a deleted route file. The file itself was reviewed after restoration (§5).

### 2.4 Environment limitations (honestly stated)

- No Windows/WebView2 runtime → native print, PDF-paper rendering, installer and updater behavior could not be executed.
- No printer hardware → A4/A5/thermal output validated at code/CSS level only.
- No Rust toolchain in this sandbox at audit time → no local `cargo check`/`clippy`; Windows CI green at v1.6.4 is the compile evidence.
- No runtime servers were started against real data; all concurrency and restore findings are code-proven but their exact failure timing is marked "requires runtime verification" where applicable.
- `bun.lock`, binary assets (icons, screenshots, `scripts/ci-logs*`) were not parsed beyond version extraction; `.secrets/` and `.env*` were never opened (audit rule 6).

---

## 3. Phase 1 — Method and coverage

### 3.1 Method

Six parallel deep-audit passes over disjoint file groups (API routes + server helpers; domain engine + both data layers; UI components; exports/print/WhatsApp; Rust/Tauri/sidecar + workflows; config/schema/tests/infra), each instructed to read its files line-by-line and report findings with exact `file:line` evidence, then a verification pass by the lead auditor: **every Critical and High finding cited in §4 was re-verified against the source** before acceptance (including downloading the pinned `webview2-com 0.39` / `windows-core 0.62` / `wacore 0.7` sources from crates.io where third-party API behavior mattered). Agent-claimed findings that failed verification were corrected — notably the "missing upload route" was reclassified from a missing-feature defect to the working-tree-loss/CI-blind-spot defect PS-016 after the route was found intact in git.

### 3.2 File coverage checklist

**Read FULLY (every line)** — application source (all first-party code):
- API layer (18/18 routes incl. restored `upload/route.ts`): students, students/[id], students/[id]/achievements, achievements/[id], payments, fees/statuses, fees/defaulters, dashboard, attendance, committee ×3, settings, backup, demo, data-info, upload, media
- Server helpers: `src/lib/db.ts`, `src/instrumentation.ts`, `src/proxy.ts`, `src/lib/psams/bootstrap.ts`
- Domain & data layers: `domain.ts`, `types.ts`, `serialize.ts`, `store.ts`, `api.ts`, `tauri-api.ts` (all 1,053 lines), `demo-data.ts`, `demo-seed.ts`, `version.ts`
- UI: `page.tsx`, `layout.tsx`, all 12 `components/psams/*` files, all 7 `views/*` files, `print-root.tsx`, `globals.css` (print/@page/splash sections in full, theme skimmed), `hooks/use-toast.ts`
- Exports/print/WhatsApp: `export.ts`, `print-desktop.ts`, `whatsapp.ts`
- Rust & desktop host: `src-tauri/src/{lib,main,printing,updates,whatsapp,build}.rs`, `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `resources/schema.sql`, `.cargo/config.toml`, `whatsapp-bot/src/main.rs`, `whatsapp-bot/Cargo.toml`
- Schema & config: `prisma/schema.prisma`, `prisma.config.ts`, `tauri/database/schema.sql`, `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `components.json`, `.env.example`, `.gitignore`, `README.md`
- Tests & scripts: `tests/domain.test.ts`, `scripts/{seed,check-parity,client-audit,verify-schema-parse,build-tauri-frontend,restore-git-credentials}.??*`, `scripts/acceptance-verify.sh`, `scripts/gen_icons.py`, `scripts/darken-views.mjs`
- Workflows: `.github/workflows/verify.yml`, `.github/workflows/build-exe.yml` (the only two)
- Legacy kit inventoried: `tauri/PORTING_GUIDE.md`, `tauri/database/schema.sql`, `tauri/src-tauri/*`, `src-tauri/sidecar/whatsapp-bot/*`

**Read partially (targeted cross-checks):** `bun.lock` (resolved versions only), vendored `exceljs`/`jspdf-autotable`/`@libsql/client`/`@prisma/adapter-libsql` internals (specific behaviors: formula typing, foot defaults, FK pragma defaults), `node_modules` otherwise untouched.

**Not inspected (with reason):** binary assets (`src-tauri/icons/*`, `docs/screenshots*`, `scripts/ci-logs*`, `public/*.svg` content beyond existence); `.secrets/`, `.env*` (forbidden); `whatsapp-rust`/`wacore` crate internals beyond the downloaded 0.7.0/0.62.0 sources used for verification. **No first-party source file was left unreviewed.**

---

## 4. Phase 2 — Defect register

Severity: **Critical** = data loss/corruption, wrong money, or exploitable breach in a supported deployment · **High** = likely incorrect behavior, privacy leakage, fragile financial/backup handling · **Medium** = correctness edges, perf cliffs, misleading UI · **Low** = polish. Confidence: **C** = Confirmed (code proves it) · **S** = Strongly suspected · **R** = Requires runtime verification. Platform: **W** = web, **D** = desktop, **B** = both.

### 4.1 Summary table

| ID | Sev | Conf | Area | Platform | Title |
|---|---|---|---|---|---|
| PS-001 | Critical | C | Fees | B | Concurrent collect double-books a billing month (no transaction, no DB uniqueness) |
| PS-002 | Critical | C | Backup | D | Backup raw-copies live WAL DB, discards errors, always reports success |
| PS-003 | Critical | C | Restore | D | Restore apply: torn safety copy, no rollback — failed restore corrupts live DB |
| PS-004 | High | C | Fees | B | Zero-fee (waiver) students become permanent defaulters with ₹0 due |
| PS-005 | High | C | Students | B | Hard delete cascades FeePayment — financial history destroyed; media orphaned |
| PS-006 | High | C | Restore | D | Restore validation = magic header only; media never restored |
| PS-007 | Medium | C | Fees | B | Arrears repriced at current monthlyFee — policy undocumented |
| PS-008 | Medium | C | Fees | B | Billing-month window, paymentDate, paymentMode unvalidated |
| PS-009 | Medium | C | Fees | B | Money stored as Float with exact-equality validation |
| PS-010 | Medium | C | Fees | B | Fees-screen stats capped (120/200 receipts) — understated collection |
| PS-011 | Low | C | WhatsApp | B | Reminder lists fewer months than the Outstanding amount covers |
| PS-012 | High | C | Security | W | Default-unauthenticated API incl. full-PII dump; no Origin/CSRF; loopback not enforced |
| PS-013 | Medium | C | Security | W | data-info can return raw DATABASE_URL (credentials) |
| PS-014 | Medium | C | Security | D | Tauri fs scope over-broad; CSP unsafe-inline + ws:// leftover; arbitrary restore paths |
| PS-015 | High | S | Security | D | Updater downloads/executes any webview-supplied URL/file; no checksum |
| PS-016 | High | C | Infra | B | Working-tree file loss is invisible to every gate (upload route vanished) |
| PS-017 | High | C | Students | B | Student UPDATE path performs zero validation (both backends) |
| PS-018 | High | C | UI | B | Student-detail fetch lacks stale-response guard — wrong student printed |
| PS-019 | High | C | DB | B | No versioned migrations; web bootstrap can't upgrade existing DBs; db:push = data loss |
| PS-020 | High | C | DB | D | 4 hand-synced DDL copies + 1-entry migration list → "fresh installs only" bugs |
| PS-021 | Medium | C | Demo | B | Demo load non-atomic; partial seed unremovable; concurrent double-load |
| PS-022 | Medium | C | Demo | B | Production boot auto-seeds a demo academy into any empty DB |
| PS-023 | Medium | C | Boot | B | bootstrap latches success before work; DDL failures swallowed; no schema version |
| PS-024 | Medium | C | DB | B | FK enforcement fragile (per-connection PRAGMA; web driver default unverified) |
| PS-025 | Medium | C | Students | B | registrationDate unvalidated — future date masks real defaulters |
| PS-026 | Medium | C | Attendance | B | Feb-31/future dates accepted; batch free-text; dashboard stats mix Inactive students |
| PS-027 | Medium | C | Settings | B | Settings PUT: no key allowlist, no validation, partial saves reported as success |
| PS-028 | Medium | C | WhatsApp | D | Sidecar spawn TOCTOU — orphaned second process holds the session |
| PS-029 | Medium | C | Parity | B | Web/desktop validation & semantics divergences (committee PUT, settings return, payments limit) |
| PS-030 | Medium | C | Perf | B | Full-table loads, JS-side filtering, no pagination; months JSON defeats indexes |
| PS-031 | Low | C | UI | B | Students search-as-you-type race (no seq/abort) |
| PS-032 | Low | C | Committee | B | displayOrder race on create; PUT NOT-NULL 500s; reorder interleave |
| PS-033 | Low | C | Students | B | phoneDigits corrupts "0"+91 double-prefix pastes into a wrong 10-digit number |
| PS-034 | Low | C | Dates | B | UTC-parse of date-only strings (IST-safe; UTC-negative zones shift a day); Feb-29 → Mar 1 |
| PS-035 | High | C | Print | B | Defaulters PRINT renders blank identity columns (StudentFeeStatus passed as Student) |
| PS-036 | Medium | C | Export | B | PDF: ₹ mojibake in headers; no Unicode font (Malayalam tofu); totals repeat every page |
| PS-037 | Medium | C | Export | D | Save-dialog cancel falls through to a second, unreliable browser download |
| PS-038 | Low | C | Export | B | Dead exportCSV lacks CSV formula-injection neutralization (latent) |
| PS-039 | Low | S | WhatsApp | D | "Sent" = sidecar-accepted, not delivered; 25 s ack timeout can misreport |
| PS-040 | Low | C | Print | B | A6 preview renders A5 width; web receipt PDF always A5; thermal omits notes |
| PS-041 | Medium | C | Print | W | Radix dialogs/toasts print onto the paper (portals not suppressed) |
| PS-042 | Medium | C | UI | B | Missing guards: achievement delete, attendance bulk overwrite, WhatsApp unlink, Remind spam, collect-fee reopen |
| PS-043 | Low | C | UI | B | Count/rows mismatches, "not found" for real errors, broken-image fallbacks, QR error swallowed, toast limit 1, misc |
| PS-044 | Medium | C | Infra | B | check-parity blind spots (indexes/uniques/FK/defaults); client-audit not in verify/CI |
| PS-045 | Medium | C | Infra | D | Supply chain: no Cargo.lock; actions pinned by tag; unfrozen install in release workflow |
| PS-046 | Medium | C | Infra | B | Legacy tauri/ kit (stale DDL, clobber guide, fake stub) + vestigial Node sidecar |
| PS-047 | Medium | C | Build | D | build-tauri-frontend.mjs rename-stash crash mutilates the repo; no self-heal |
| PS-048 | Low | C | Infra | B | No engines/packageManager; README "Node 18+" wrong; Unix-only scripts; noImplicitAny off |
| PS-049 | Low | C | Schema | B | Default/FK-action/updatedAt drift between Prisma and SQLite DDL copies; duplicate index |
| PS-050 | Low | C | API | W | Raw Prisma errors to clients; wrong status codes (P2002→500, P2025→500); GETs unhandled |


### 4.2 Detailed register

Format per finding: **Where** (exact file:line) · **Evidence** · **Why/Impact** · **Fix** · **Test** · **Compat** (only when a migration or backward-compatibility note applies).

---

#### A. Financial integrity

**PS-001 · Concurrent collect double-books a billing month** `Critical|C|B`
- Where: `src/app/api/payments/route.ts:57-104`; desktop mirror `src/lib/psams/tauri-api.ts:485-517`; schema `prisma/schema.prisma:91` (months as JSON string).
- Evidence: read student+payments → `assertValidPayment(...)` → `db.feePayment.create({receiptNo …})` with a 3× retry **on receiptNo collision** (`route.ts:82-103`); desktop has no retry at all. No `db.$transaction` anywhere in the path; the only UNIQUE constraints are `receiptNo` and `admissionNo` — a `(studentId, month)` uniqueness is impossible on a JSON column.
- Why/Impact: two concurrent requests both read the same unpaid ledger, both pass validation, both insert (the web retry actively completes the loser's insert under a fresh RC number). One month, two receipts, money collected twice; dashboard `monthRevenue` double-counts; ledger dedupes on read so the UI hides it.
- Fix: Phase 3A — add `PaymentMonth(studentId, month, paymentId)` allocation table with `UNIQUE(studentId, month)` (migration in `MIGRATION_NOTES.md` MN-1), and wrap read+validate+insert in one `db.$transaction` (web) / one `BEGIN IMMEDIATE…COMMIT` batch (desktop). The retry loop must then re-validate, not blind-retry.
- Test: two concurrent POSTs with identical `{studentId, months, amount}` → exactly one 201 and one 409; `paidMonths` contains the month once. Same for two desktop collects.
- Compat: MN-1 backfill preserves every existing receipt; reconciliation report required.

**PS-002 · Backup can produce corrupt/empty backups and still report success** `Critical|C|D`
- Where: `src-tauri/src/lib.rs:157-160` (`copy_file` → `is_ok()`, results discarded), `:181-196` (main db copied first, `-wal`/`-shm` copied after; no verification), `:227-230` (`backup_now` = `Ok(run_exit_backup(...))` unconditionally), `:201-214` (`mirror_dir` swallows per-file errors).
- Evidence (verified): `copy_file(&db_src, &target.join(...))` — return value unused; `Ok(target)` returned even when `db_src.exists()` is false or every copy failed.
- Why/Impact: DB is WAL-mode (`resources/schema.sql:7`); a checkpoint can run between the main-db copy and the WAL copy producing a non-chaining pair; a failed `-wal` copy silently backs up stale data; USB unplugged/full ⇒ toast "Database backup written" with nothing written. The academy's primary recovery mechanism is unreliable.
- Fix: Phase 3A — replace with `VACUUM INTO 'ps-ams-<stamp>.db'` from a short-lived connection (single consistent file, no sidecars), then `PRAGMA quick_check` + size sanity on the copy; only then mirror media with per-file error counting; return `Err`/counts on any failure; UI shows real outcome.
- Test: full-disk/locked-target simulation → command must Err; restore the produced file into a fresh DB → row counts match.

**PS-003 · Restore apply: torn safety copy and no rollback** `Critical|C|D`
- Where: `src-tauri/src/lib.rs:292-316` (`apply_pending_restore`).
- Evidence (verified): `let _ = fs::copy(&db, &pre)` — main db only, live `-wal` not included; then `-wal`/`-shm` **deleted**; then `fs::copy(&staged, &db)` in-place (truncates the live DB); on failure only `log_line("pending restore FAILED")` — no rollback from `pre`, no verification.
- Why/Impact: the "safety copy" can permanently miss recent commits (they live in the WAL); a disk-full/interrupt mid-copy leaves a torn live DB that the app then opens. One failed restore = destroyed academy data.
- Fix: Phase 3A — checkpoint (or copy db+wal+shm together) for the `pre` snapshot; copy staged → `ps-ams.db.tmp`, `quick_check` + header + size verify, atomic `fs::rename` over the live db; on any failure auto-rename `pre` back and write a visible error record for the UI.
- Test: inject copy failure mid-apply → original DB still opens with original data; success path → `quick_check ok` and row counts match the backup.

**PS-004 · Zero-fee students are permanent defaulters** `High|C|B`
- Where: `src/lib/psams/domain.ts:217-223` (ledger grows, `isDefaulter = overdueMonths.length > 1`), `:357-360` (`assertValidPayment` **forbids** collecting from a zero-fee student).
- Evidence (verified): for `monthlyFee = 0` nothing can ever settle the months ⇒ `overdueMonths` grows ⇒ defaulter forever, `dueAmount = 0`.
- Impact: waiver students pollute the defaulters monitor/dashboard card and can receive fee reminders; the Fees defaulter tile (`dueAmount>0` roster filter) contradicts the card count.
- Fix: Phase 3A — in `computeFeeStatus`, treat `monthlyFee <= 0` as fully settled (`pending/overdue = []`, `due 0`, not defaulter). One-line change, propagates to both backends via the shared engine.
- Test: `computeFeeStatus({...monthlyFee:0}, [], later)` → `isDefaulter === false`, `pendingMonths` empty.
- Compat: none (pure read-side).

**PS-005 · Student hard-delete destroys financial history; media orphaned** `High|C|B`
- Where: `prisma/schema.prisma:89` (`FeePayment.student onDelete: Cascade`; same pattern `:72` achievements, `:121` attendance), `src/app/api/students/[id]/route.ts:45-55` (bare `delete`), desktop `src/lib/psams/tauri-api.ts:384-391` (4 sequential DELETEs, non-transactional).
- Evidence (verified): cascade destroys every RC- receipt for the student; UI confirmation warns but offers no alternative path; `photoPath/birthCertPath/idCardPath/certificatePath` files are never unlinked.
- Impact: one confirmed mis-click irreversibly erases the financial audit trail and silently changes revenue history; minors' photos/documents remain on disk unreferenced (privacy).
- Fix: Phase 3A — `onDelete: Restrict` for FeePayment in all three DDL copies (web+desktop), refuse DELETE when payments exist (409 with guidance to set status Alumni), delete student-owned media after a successful delete, wrap the desktop delete in one transaction. Requires policy sign-off (§6 Q2).
- Test: delete a student with receipts → 409 and receipts intact; delete a zero-payment student → 200 and media removed.
- Compat: schema change; existing DBs need the FK action migration (MN-4).

**PS-006 · Restore accepts any SQLite file; media never restored** `High|C|D`
- Where: `src-tauri/src/lib.rs:272-281` (validation = 16-byte header), `:193-196` (backup mirrors media) vs `:265-316` (restore touches only the .db).
- Why/Impact: any other app's SQLite DB passes; after restart the app boots an "empty academy" (schema re-created over a foreign file) — recoverable only via the footnoted `ps-ams.pre-restore.db`. Restoring an older DB against today's media tree yields records pointing at missing files (broken photos/documents on paper too — see PS-043) and orphaned files.
- Fix: Phase 3A — after staging, `PRAGMA quick_check` + require `Student`/`FeePayment`/`Attendance` tables (+ optional schema-version row) before writing the marker; add an optional media restore from the sibling `media-<stamp>` folder with a confirm dialog; report skipped media files.
- Test: stage a foreign SQLite DB → command Errs and no marker is written; restore a real backup → media consistency report shown.

**PS-007 · Arrears repriced at the current monthlyFee** `Medium|C|B`
- Where: `src/lib/psams/domain.ts:221` (`dueAmount = pendingMonths.length * (student.monthlyFee || 0)`), enforced identically by `assertValidPayment` (`:357`) on both write paths.
- Why/Impact: months accrued at ₹500 become due at ₹600 the moment the fee is edited; receipts keep historical amounts, so the ledger never reconciles across a fee change. This is a **policy**, currently undocumented.
- Fix: Phase 3A (decision §6 Q1) — minimum: document the rule in the validator JSDoc + README; better: persist `feeAtAccrual` per allocated month when MN-1 lands.
- Test: fee 500→600 mid-tenure; assert the chosen policy explicitly.

**PS-008 · Payment inputs under-validated** `Medium|C|B`
- Where: `src/lib/psams/domain.ts:334-366` (no billing-window bounds), `src/app/api/payments/route.ts:69-94` (`paymentDate: body.paymentDate ? new Date(...) : now` — accepts future/invalid; `paymentMode: body.paymentMode || "Cash"` — free text). Desktop identical (`tauri-api.ts:487-526`).
- Why/Impact: receipts can be booked for `2030-05` or `2024-01` (before the student existed); future-dated receipts inflate `monthRevenue`/`todayRevenue` (dashboard sums by `paymentDate >= monthStart`); invalid dates 500 via Prisma; free-text modes break reporting filters.
- Fix: Phase 3A — extend `assertValidPayment` with `billingStartKey`/`currentKey` bounds (reject `< reg+1`, reject `> currentMonth` — see §6 Q6), validate paymentDate is calendar-real and `<= today`, allowlist paymentMode (`Cash | UPI / GPay | Bank Transfer`).
- Test: `months:["2030-05"]` → 400; `paymentDate:"2999-01-01"` → 400; `paymentMode:"Foo"` → 400.

**PS-009 · Money as Float with exact equality** `Medium|C|B`
- Where: `prisma/schema.prisma:47,92` (`Float`), `resources/schema.sql:34,70` + `bootstrap.ts` (`REAL`), `domain.ts:357` (`amount === expected` exact).
- Why/Impact: fractional fees (`499.99`) can fail the exact match via float error, and aggregate dues drift. INR fees are typically whole rupees today, so impact is latent but the class is financial.
- Fix: Phase 3A (decision §6 Q8) — either round-compare with an epsilon (small, safe) or migrate money to integer paise (schema change, MN-5).
- Test: property test with `x.99` fees through validator + `dueAmount` sums.

**PS-010 · Fees-screen stats silently capped** `Medium|C|B`
- Where: `src/components/psams/views/fees-view.tsx:85` (`fetchPayments({limit:120})` feeds the "Collected this month" tile), `:661` (history capped at 200; header count/total silently windowed). Dashboard sums the full table → the two screens disagree for busy months.
- Fix: Phase 3C — month-scoped unbounded fetch (or server-side stat), label the history window ("latest 200 receipts"), align totals.
- Test: seed 150 receipts in one month → Fees stat == Dashboard monthRevenue.

**PS-011 · Reminder lists fewer months than the amount covers** `Low|C|B`
- Where: `src/components/psams/views/fees-view.tsx:608-610` + `src/lib/psams/whatsapp.ts:88-89` — reminder text uses `overdueMonths` only while "Outstanding" is the full `dueAmount` (incl. current month).
- Fix: Phase 3D — use `pendingMonths` in the period list. Test: 3 overdue + current pending → text lists 4 periods and the full amount.


#### B. Security & privacy

**PS-012 · Default-unauthenticated API, no Origin/CSRF check, loopback not enforced** `High|C|W`
- Where: `src/proxy.ts:19-28` (token only if env var set — default off; accepts `?token=` in URLs; plain `!==` compare), `src/app/api/backup/route.ts:5-13` (entire DB as JSON: students incl. minors' PII, payments, attendance), `src/app/api/media/route.ts` (photos/documents), `package.json:7-9` (`dev` binds all interfaces; loopback only via `HOSTNAME=localhost` in `start`). No Origin check on POSTs; cross-site `no-cors` POSTs with `text/plain` bodies are parsed by `req.json()`.
- Why/Impact: in the default posture, any process/browser tab that can reach the port gets the full PII dump and can fabricate receipts/students/attendance. The README's "loopback-only" posture is a launch-script property, not an app property; `npm run dev` on a shared network exposes everything.
- Fix: Phase 3B (decision §6 Q5) — bind the standalone server to `127.0.0.1` in app code (honour `HOSTNAME`), require the token by default with an explicit opt-out, add Origin/Host matching for non-GETs, header-only tokens (drop `?token=`), timing-safe compare. Document that the desktop build ships no routes (its real posture).
- Test: without token, non-loopback GET `/api/backup` → 401/denied; cross-origin no-cors POST → rejected.

**PS-013 · data-info can leak DATABASE_URL credentials** `Medium|C|W`
- Where: `src/app/api/data-info/route.ts:7-13` — `database: file ?? process.env.DATABASE_URL ?? …` (verified verbatim; the comment claims "never credentials" — untrue for non-file URLs).
- Impact: with a hosted DB (`libsql://user:token@…`) any caller of the unauthenticated endpoint reads the token; otherwise it discloses absolute server paths.
- Fix: Phase 3B — return the path for `file:` URLs, otherwise a fixed string ("external database (URL hidden)").
- Test: `DATABASE_URL=libsql://u:secret@h` → response must not contain `secret`.

**PS-014 · Tauri capabilities/CSP broader than needed; arbitrary restore paths** `Medium|C|D`
- Where: `src-tauri/capabilities/default.json:24-43` (fs read/write/**remove** across `$DESKTOP/$DOCUMENT/$DOWNLOAD/$TEMP/**`; app needs full RW only in `$APPDATA`), `src-tauri/tauri.conf.json:48` (`script-src 'self' 'unsafe-inline'`, leftover `ws://localhost:*`), `src-tauri/src/lib.rs:236-249,266-268` (`set_backup_target`/`restore_backup` accept any webview-supplied path).
- Why/Impact: a compromised renderer (XSS surface widened by `unsafe-inline`) can delete user files across common folders and swap the database with an arbitrary header-valid file. Compounding chain with PS-015.
- Fix: Phase 3B — narrow fs scope to `$APPDATA/**` + runtime-extend after dialog picks; drop `unsafe-inline` (nonce/hash) and `ws:` from release; require restore/target paths to come from a dialog in the same session.
- Test: capability audit (tauri dev → try fs remove outside appdata → denied); CSP audit via injected-inline-script probe.

**PS-015 · Updater: download-and-execute of any webview-supplied URL/file** `High|S|D`
- Where: `src-tauri/src/updates.rs:135` (`download_update(app, url, name)` — `agent.get(&url)`, any URL incl. http), `:155-194` (no final `received == Content-Length` check; `file.flush().ok()`; partial file left in Downloads), `:207-224` (`install_update(path)` — exists + `.exe/.msi` extension check, then `Command::new(&path).spawn()`).
- Evidence (verified): no URL allowlist, no checksum (GitHub API `digest` field unused), no completeness verification.
- Why/Impact: a compromised renderer gets a download-and-execute primitive; a truncated download can be launched as an installer. The updater is the app's only remote-code path — it must be bullet-proof.
- Fix: Phase 3B — hardcode-allow only `https://github.com/kuttappu507/patterns-sports/releases/download/`; verify sha256 from the release API `digest`; verify `received == total`; delete partials on error; refuse to launch anything not produced by `download_update` this session.
- Test: non-GitHub URL → Err; truncated stream → Err + file removed; valid flow unchanged.

#### C. Correctness & data safety

**PS-016 · Working-tree loss invisible to every gate** `High|C|B`
- Where: observed this audit — `src/app/api/upload/route.ts` (38 lines, tracked at HEAD) missing from the working tree while **all** gates passed: lint, tsc, vitest 59/59, parity, client-audit, and `next build`. Same loss pattern occurred once before (v1.6.2 cycle, per project worklog). Sandbox environment also wipes git-ignored files (`worklog.md`, `.secrets/`) between sessions.
- Why/Impact: a release built from such a tree silently ships a broken web mode (upload 404s); nothing in `verify.yml`, `check-parity.mjs` or `client-audit.mjs` asserts that every client-called endpoint exists as a route file (`api.ts` POSTs `/api/upload` — grep-based gates check wiring, not existence).
- Fix: Phase 3C — (a) CI step `git diff --stat` must be empty on checkouts (or a "tracked files all present" assertion); (b) add a route-existence test that imports `api.ts`, extracts every `/api/...` path it calls, and asserts a matching `src/app/api/**/route.ts` exists; (c) wire `client-audit.mjs` into `npm run verify` (PS-044).
- Test: delete a route file in CI fixture → pipeline must fail.

**PS-017 · Student UPDATE performs zero validation** `High|C|B`
- Where: `src/app/api/students/[id]/route.ts:18-43` (merge-only: `new Date(body.dateOfBirth)` unchecked, `Number(body.monthlyFee ?? 0)` unchecked, whitespace/empty name → Prisma 500); desktop `tauri-api.ts:342-382` identical. Contrast: POST validates (`students/route.ts:59-63`, `tauri-api.ts:290`).
- Impact: the normal edit screen can persist garbage mobile (breaks WhatsApp targeting), negative/NaN fee, future DOB, blank name (500); inconsistent with create.
- Fix: Phase 3C — validate the **merged** record (current row + patch) with `assertValidStudentInput` + finite/range checks on both backends; trim; 400 with the validator message.
- Test: PUT `{mobile:"hello"}` / `{monthlyFee:-5}` / `{dateOfBirth:"2030-01-01"}` / `{fullName:""}` → all 400 on web and desktop.

**PS-018 · Student-detail stale-response race** `High|C|B`
- Where: `src/components/psams/views/student-detail-view.tsx:84-97` — `useEffect` fetch without an alive/seq token (every other view has one).
- Why/Impact: navigate A→(slow)→B: A's late response overwrites B's hero/ledger; `printProfile()`/`downloadProfilePdf()` then print **student A's PII under student B's record**.
- Fix: Phase 3C — `let alive = true; return () => { alive = false }` + guard before setState (copy `fees-view.tsx:82-98`).
- Test: out-of-order mocked fetches → the visible record always matches the route param.

**PS-019 · No migration story for existing databases** `High|C|B`
- Where: no `prisma/migrations/` exists (verified); `src/lib/psams/bootstrap.ts:24-123` is `CREATE TABLE IF NOT EXISTS` only (no column migrations); `package.json:14` `db:push --accept-data-loss`; the `gender` column episode (added to schema; old web DBs got it only via manual push) already demonstrated the failure mode.
- Why/Impact: schema changes between releases break existing web deployments at runtime (missing column) or tempt a data-loss "fix". Desktop has a partial answer (PS-020) — the story is inconsistent across backends.
- Fix: Phase 3C — add a guarded migration pass to web bootstrap (mirror the desktop `PRAGMA table_info` pattern, or adopt `prisma migrate` with committed SQL); remove `--accept-data-loss` from the script (require deliberate use). See MN-2.
- Test: v1.5-shaped DB fixture → boot → column exists, rows intact; destructive drift without the flag → push fails.

**PS-020 · Desktop schema = 4 hand-synced copies + 1-entry migration list** `High|C|D`
- Where: `prisma/schema.prisma`, `src-tauri/resources/schema.sql`, `bootstrap.ts SCHEMA_DDL`, plus `tauri-api.ts:126-138` `runMigrations()` (exactly one guarded ALTER: `gender`). `check-parity.mjs` guards only the first three, and only for columns (PS-044).
- Why/Impact: any future column addition that misses `runMigrations()` yields "works on fresh installs, silently broken on every existing Windows install" — the worst class of release bug for this app.
- Fix: Phase 3C — single source of truth: generate both SQLite DDLs from the Prisma schema in CI (script + gate), and/or implement a `PRAGMA user_version` migration runner (MN-2).
- Test: legacy-release DB fixture + current code → all columns/tables present after boot.

**PS-021 · Demo load non-atomic; partial seed unremovable** `Medium|C|B`
- Where: `src/app/api/demo/route.ts:23-35` + `src/lib/psams/demo-seed.ts:31-145` (dozens of sequential creates, no `$transaction`; `demoRecordIds` flag written **last**); desktop `tauri-api.ts:919-1035` same; concurrent POSTs both pass the flag check.
- Impact: a mid-load failure (or race) leaves fake students/payments permanently mixed into a real academy ledger — `DELETE /api/demo` 404s without the flag.
- Fix: Phase 3C — wrap the load in one transaction and write the tracking flag inside it (or write it incrementally); add a "loading" guard row.
- Test: force a throw after student 5 → zero rows persisted, no flag; two concurrent loads → one batch.

**PS-022 · Production boot auto-seeds demo data** `Medium|C|B`
- Where: `src/instrumentation.ts:11-20` → `bootstrap.ts:175-184` (empty DB + no flags ⇒ `loadDemoDataset`); desktop `tauri-api.ts:162-174`.
- Why/Impact: a real academy's first production boot starts with 12 fake players consuming admission numbers PSA-…-0001..0012 and receipts; removal later cascades their receipts (PS-005) — demo/real contamination in a financial system.
- Fix: Phase 3C (decision §6 Q4) — gate on `NODE_ENV !== "production"` or a first-run opt-in dialog.
- Test: boot standalone against empty DB with production env → 0 students.

**PS-023 · Boot resilience: success latched before work; DDL failures swallowed** `Medium|C|B`
- Where: `bootstrap.ts:146-147` (`bootstrapped = true` before any work; catch-all `:188-190`), `tauri-api.ts:105-114` (per-statement `console.warn` and continue), no `PRAGMA user_version` ledger anywhere.
- Impact: a transient failure permanently disables schema self-heal until restart; a locked/full disk boots an app with missing tables that fails far from the cause.
- Fix: Phase 3C — set the flag only on success; make a failed DDL statement a hard boot error surfaced via the existing `bootError` channel; add a schema-version record (MN-2).
- Test: sabotage one DDL statement → boot fails loudly with the statement name.

**PS-024 · FK enforcement fragile on both backends** `Medium|C|B`
- Where: `tauri-api.ts:75-79` — `PRAGMA foreign_keys=ON` issued once on one pooled connection (other pool connections have it OFF; SQLite default OFF); `src/lib/db.ts`/bootstrap never issue it (web enforcement depends on libsql driver defaults — unverified); compensated partially by desktop's explicit deletes (`tauri-api.ts:384-391`) and the raw DDL's `ON DELETE CASCADE`.
- Impact: cascades/FK rejects may not fire → orphaned rows or, on web, `toWirePaymentWithStudent` hitting `student: null` (payments list breaks).
- Fix: Phase 3C — set `foreign_keys=ON` in the sqlx connect options (desktop, all connections) and explicitly on web connections at bootstrap; add an integration test that inserts a child with a bogus parent and expects a rejection.
- Test (runtime): delete a student with payments → observe cascade vs orphans; attendance with bogus studentId → rejected.

**PS-025 · registrationDate unvalidated** `Medium|C|B`
- Where: `src/app/api/students/route.ts:74` (POST accepts client value), `[id]/route.ts:31` (PUT too), `domain.ts:306-322` validator doesn't check it. `computeFeeStatus` derives `billingStart = reg+1` — a **future** registration date yields `monthsBetween = []` ⇒ student shows fully paid, `isDefaulter` false, indefinitely.
- Fix: Phase 3C — reject future `registrationDate` (and `< dateOfBirth`) in the shared validator (applies to PUT once PS-017 lands).
- Test: POST/PUT `registrationDate: nextYear` → 400.

**PS-026 · Attendance validation and stats** `Medium|C|B`
- Where: `domain.ts:368-380` (`ATT_DATE_RE` = format only — `2025-02-31` passes; no future-date rejection; `batch` free text; no records-length cap); `src/app/api/dashboard/route.ts:44-45,81` (present/absent counts include Inactive students' rows vs `totalActive` denominator).
- Fix: Phase 3C — calendar-validate by round-trip + reject `> todayKey`; allowlist batch; cap records; filter attendance stats to Active students.
- Test: `date:"2025-02-31"` → 400; tomorrow's date → 400; Inactive student's stale mark doesn't shift the dashboard ratio.

**PS-027 · Settings PUT: junk keys, no validation, partial saves** `Medium|C|B`
- Where: `src/app/api/settings/route.ts:27-43` — any JSON object upserted (`[object Object]` values possible); `defaultMonthlyFee` never numeric-checked (NaN → GET null → letterhead breaks); sequential upserts not transactional (mid-loop failure saved but reported success). Desktop mirrors the laxness.
- Fix: Phase 3C — allowlist the 7 `AcademySettings` keys, validate types, one transaction, return the refetched settings (also fixes PS-029's return-type divergence).
- Test: PUT `{defaultMonthlyFee:"abc",evilKey:"x"}` → 400, nothing written.

**PS-028 · Sidecar spawn TOCTOU orphans a second WhatsApp process** `Medium|C|D`
- Where: `src-tauri/src/whatsapp.rs:99-117` (verified) — check `child.is_some()` under lock, **release lock**, spawn, re-acquire to store. Autostart (`lib.rs:427-432`) racing a user click can leak the first `CommandChild`: a zombie sidecar stays connected to the academy's WhatsApp until process exit.
- Fix: Phase 3C — hold the lock across check+store (store a `Starting` placeholder before spawning; take it back on spawn failure).
- Test: two parallel `wa_start` invocations → exactly one live child.

**PS-029 · Web/desktop behavioral divergences** `Medium|C|B`
- Where: committee PUT — web accepts blank `fullName`/role/phone (`committee/[id]/route.ts:12-16`), desktop requires them (`tauri-api.ts:663-665`); `saveSettings` returns `{ok,saved}` on web vs refetched settings on desktop (`settings/route.ts:38` vs `tauri-api.ts:790`); `fetchPayments({month,limit})` — web drops `limit`, desktop applies it, tie-break ordering differs (`payments/route.ts:32-42` vs `tauri-api.ts:541-546`); desktop `reorderCommittee` lacks the `ids` guard and transaction (`tauri-api.ts:712-721`).
- Fix: Phase 3C — mirror the stricter behavior on the lax side; add all four to the Phase 5 parity matrix with shared tests.
- Test: parity cases per divergence (web PUT committee `{fullName:""}` → 400, etc.).

**PS-030 · Full-table loads / no pagination / months JSON defeats indexes** `Medium|C|B`
- Where: `students/route.ts:39-48`, `payments/route.ts:34-36` (loads **all** payments + joined students and JSON-parses every row to filter one month), `dashboard/route.ts:11-16` (all students incl. Inactive with all payments), `fees/statuses` + `fees/defaulters` (identical duplicated loads), `tauri-api.ts` mirrors.
- Impact: multi-year datasets turn dashboard/fees/reports into multi-second loads; memory spikes on exports.
- Fix: Phase 3C — MN-1's `PaymentMonth` table makes month filtering indexed; add `take/skip` + count to list endpoints; share one statuses implementation; exclude Inactive payment history from the dashboard query.
- Test: synthetic 10k students / 50k payments → p95 budget for dashboard + month filter (Phase 4 perf battery, disposable data only).

**PS-031 · Students search race** `Low|C|B` — `students-view.tsx:36-56`: debounced but unsequenced; a slow older response can overwrite newer results. Fix: seq/abort token. Test: out-of-order resolutions.

**PS-032 · Committee write races** `Low|C|B` — `committee/route.ts:17-26` (max displayOrder then create, no tx/unique → concurrent adds share an order); `[id]/route.ts:12-15` (blank `role`/`phone` → NOT NULL 500); `reorder` transactional but unguarded vs interleaving. Fix: validate-not-null → 400; tolerate P2025 per-row; order uniqueness optional.

**PS-033 · phoneDigits double-prefix corruption** `Low|C|B` — `domain.ts:276-281` (verified): `"091987654321"` → strips `0` → 12 digits starting `91` already passed the 91-branch → `slice(0,10)` = `9198765432` — a wrong but valid-shaped mobile. Fix: loop the prefix strip or 0-strip only when remainder is exactly 11 digits. Test: `phoneDigits("091987654321") === "9876543210"`.

**PS-034 · Date-parse timezone edges** `Low|C|B` — `domain.ts:12,209`, `tauri-api.ts:311,363-365`, `dashboard/route.ts:59-61`: `new Date("YYYY-MM-DD")` = UTC midnight → local getters shift a day in UTC-negative zones (the supported IST deployment is safe); Feb-29 birthdays roll to Mar 1 (consistent both sides). Fix if desired: `parseLocalDate` helper. Test: TZ matrix in vitest (`TZ=America/New_York`).


#### D. Exports, printing, WhatsApp

**PS-035 · Defaulters PRINT renders blank identity columns** `High|C|B`
- Where: `src/components/psams/views/fees-view.tsx:528-531` (verified) passes `rows: defaulters` — raw `StudentFeeStatus[]` — while the print layer reads `s.admissionNo / s.fullName / s.ageCategory / s.parentName / s.mobile` directly (`prints/print-root.tsx` roster section, verified). Those fields live under `r.student.*` ⇒ the printed "Fee Defaulters Roster" has **no names, admission numbers, parents or contacts** (only unpaid-months and outstanding print). The sibling Excel/PDF exporters map fields correctly (`fees-view.tsx:505-514`) — print was missed.
- Fix: Phase 3D — map before printing (`rows: defaulters.map(r => ({...r.student, overdueMonths, dueAmount}))`) and type the print payload union so TS rejects the mismatch.
- Test: render `RosterPrint` with a status row → assert fullName/admissionNo appear in the DOM.

**PS-036 · PDF currency/Unicode rendering** `Medium|C|B`
- Where: `export.ts:203-215` — autotable heads receive `Outstanding (₹)` / `Monthly Fee (₹)` verbatim while the project's own `rs()` guard (`:236-242`, "₹ is NOT in jsPDF's standard WinAnsi fonts") is applied only to receipt amounts; no `addFileToVFS/addFont` anywhere (verified) ⇒ Malayalam/Indic names (a Kozhikode academy!) render as tofu in every PDF body; `foot` rows repeat on every page (autotable 5 default `showFoot: 'everyPage'`).
- Impact: financial documents print a mojibake currency symbol and unreadable recipient names.
- Fix: Phase 3D — use `Rs.` for PDF headers (match the receipt guard), embed a Noto Sans (Latin+Malayalam) subset for user-text fields, `showFoot: 'lastPage'`, and format numeric cells with `formatINR`-equivalent.
- Test: generate PDF with a Malayalam name + ₹ → extract text; assert no U+20B9 and no tofu glyph class.

**PS-037 · Desktop save-dialog cancel = hidden second download** `Medium|C|D`
- Where: `export.ts:31-46` (verified) — `save()` cancelled (`null`) **or** `writeFile` failure falls through to `saveAs(blob, …)`, the anchor-download path the codebase itself documents as unreliable in WebView2 (`export.ts:27-29`). Correct patterns already exist in-repo (`settings-view.tsx:840-852`, `page.tsx:222-224`).
- Fix: Phase 3D — `saveBlob` returns `{saved:boolean}`; on cancel show "not saved" and **never** `saveAs` inside Tauri.
- Test: stub `plugin-dialog.save → null` → `saveAs` not called, neutral toast shown.

**PS-038 · Dead exportCSV lacks formula-injection guard** `Low|C|B` — `export.ts:146-157`: values verbatim into `Papa.unparse` (a crafted `=HYPERLINK(...)` name would execute on open-in-Excel). Currently **zero call sites** (verified) — latent. Fix when wiring it up: neutralize leading `= + - @ \t \r`; unit test. (Excel path is safe — verified ExcelJS types plain strings as text.)

**PS-039 · WhatsApp "sent" semantics** `Low|S|D` — `whatsapp.ts:152-194` treats the sidecar `sent` event as delivery; a >25 s ack shows "failed" for a message that may still deliver (duplicate-send risk on retry). Sidecar emits `sent` when `send_message` resolves (server-accepted), no delivery receipts (`whatsapp-bot/src/main.rs:176,251-259`). Fix: wording ("sent · queued to WhatsApp"), keep id-correlated cleanup. Runtime verification against real network required.

**PS-040 · Paper/preview mismatches** `Low|C|B` — A6 receipt preview renders an A5-width sheet (`print-root.tsx:213` wrapper vs hard-coded 148 mm preview class); web receipt "Save PDF" is always A5 while desktop follows the saved preset (`fees-view.tsx:319-331`); thermal slip omits `notes` that A5 shows (`print-root.tsx:431-466`). Fix: preset-aware preview class, thread paper into the jsPDF builder, include notes.

#### E. UI / state / accessibility

**PS-041 · Dialogs/toasts print onto the paper (web)** `Medium|C|W` — `globals.css:776-822` hides only `#psams-root`/`.aurora`/`.no-print`; Radix portals and the Toaster mount at `<body>` outside it ⇒ an open receipt dialog + toasts render on the printed receipt in browser mode (desktop uses the native pipeline and is unaffected). Fix: `@media print { body > [data-radix-portal], body > [role="dialog"], [data-sonner-toaster] { display:none !important } }`. Test: open dialog → print preview shows only the document.

**PS-042 · Missing destructive/async guards** `Medium|C|B`
- Achievement delete: immediate, unconfirmed, no busy flag, no aria-label (`student-detail-view.tsx:245-260`) — one mis-tap erases a career milestone.
- Attendance "All present"/"All absent" silently overwrites an already-marked day (`attendance-view.tsx:110-129`) — bulk history rewrite without confirm.
- WhatsApp "Unlink device" wipes the session on one click (`settings-view.tsx:129-139,165-167`).
- Defaulters "Remind": no per-row busy state, no offline gate (`fees-view.tsx:598-620`) — repeated clicks send duplicate messages.
- Collect-fee dialog: `saving` not reset on reopen (`collect-fee-dialog.tsx:64-88`) — in-flight payment resurfaces as a receipt popup over the reset form.
Fix: Phase 3D — confirm dialogs, busy flags, offline gate (mirror `ReceiptDialog`'s `navigator.onLine`), `setSaving(false)` in the open-reset. Tests per case.

**PS-043 · UI consistency polish (grouped)** `Low|C|B`
- Gender filter badge ignores the filter (`students-view.tsx:118-120` vs `:171`); detail fetch failure shown as "Student not found." with no toast (`student-detail-view.tsx:91-112`); no `onError` fallback on any `<img>` for missing media (7 call sites — a restored DB without media shows broken glyphs on screen **and blank boxes on printed A4 profiles**); QR render failure swallowed → stuck "Generating pairing QR…" (`settings-view.tsx:102-116`); toast subsystem: limit 1 + no auto-dismiss (`hooks/use-toast.ts:11-12`) — errors erased by following successes; defaulters Print scope ≠ Excel/PDF scope (PS-035 sibling); empty states don't distinguish "no data" vs "no matches" (students/reports); updater "Run installer" not disabled while invoking (`settings-view.tsx:722-731`); print tooltips promise silent printing on web too (`fees-view.tsx:403`); ErrorBoundary "Reload interface" doesn't reload (`page.tsx:76-82`); dashboard defaulters tile lands on the Collect tab (no deep-link), committee grid caps at 8 with no indicator; "the player2019s" typo (`students-view.tsx:235`); icon-only buttons lack accessible names (students row actions, committee edit/delete, achievement delete, collect-fee clear X).

#### F. Infrastructure, config, supply chain

**PS-044 · Verification gates verify less than they claim** `Medium|C|B`
- `check-parity.mjs:53,84-85` (verified): skips `@@index`/`@@unique` lines and table-level `UNIQUE(...)` — deleting `UNIQUE(studentId,date)` or an FK action from a schema copy stays green; defaults unparse; stale `tauri/database/schema.sql` unchecked (it **lacks `gender`**).
- `client-audit.mjs` (~100 substring checks) is not referenced by `npm run verify` or any workflow — "AUDIT PASS" is a manual battery.
- Fix: Phase 3F/3C — parse indexes/uniques/FK actions/defaults in parity; wire client-audit into verify; delete or sync the legacy schema copy (PS-046).
- Test: mutation test — remove `UNIQUE (studentId,date)` from a fixture copy → parity must exit 1 (fails today).

**PS-045 · Release supply chain** `Medium|C|D` — no committed `Cargo.lock` in either crate (every CI build re-resolves; `whatsapp-rust = "0.7"` floats the minor); `build-exe.yml` actions pinned by mutable tags (`checkout@v4`, `setup-bun@v2`, `dtolnay/rust-toolchain@stable` branch, `swatinem/rust-cache@v2`, third-party `softprops/action-gh-release@v2` in a `contents: write` flow); `bun install` without `--frozen-lockfile` in the release workflow (verify.yml uses it); `bun.lock` workspace name drift (`nextjs_tailwind_shadcn_ts` vs `ps-ams`). Fix: commit lockfiles, pin by SHA, freeze installs, regenerate lock name.

**PS-046 · Legacy kit is a trap** `Medium|C|B` — `tauri/` (v1-era): stale DDL **missing `gender`**, `tauri.conf.json` pointing at a standalone-server output Tauri can't run, `capabilities` granting `*/**`, a `rusqlite_stub` whose `execute_batch` is a no-op, and a PORTING_GUIDE that instructs copying it over the live `src-tauri/`; plus the vestigial Node sidecar `src-tauri/sidecar/whatsapp-bot/` (246 lines, unreferenced, contradicts the "no Node" architecture). Fix: delete both (history preserves them) or move under `docs/legacy/` with DEPRECATED headers; add a CI assertion that the guide no longer instructs clobbering.

**PS-047 · build-tauri-frontend.mjs rename-stash fragility** `Medium|C|D` — `scripts/build-tauri-frontend.mjs:19-42` renames `src/app/api` to a git-ignored stash for the static export; a SIGKILL/CI-cancel between rename and restore leaves the repo looking mutilated (`git status` = mass deletion) and the next run silently proceeds without the API. Fix: self-heal at script start (restore stash if present), prefer copy+tsconfig-exclude. Test: kill mid-run → re-run → `src/app/api` intact.

**PS-048 · Toolchain/scripting hygiene** `Low|C|B` — no `engines`/`packageManager`/`.nvmrc` (README claims "Node 18+"; next@16.1.3 requires ≥ 20.9); `npm run build` ends with POSIX-only `cp -r` (Windows devs can't build web mode; CI avoids it via `build:tauri`); `scripts/acceptance-verify.sh` + `gen_icons.py` hardcode `/home/z/my-project`; `tsconfig.json:13` `noImplicitAny: false` inside `"strict": true`; eslint warnings don't fail verify (no `--max-warnings`). Fix: pin versions, portable scripts, incremental strictness.

**PS-049 · Schema-copy drift details** `Low|C|B` — SQLite DDL has `DEFAULT`s Prisma lacks (`Achievement.level 'School'`, `medal 'None'`, `paymentMode 'Cash'`); Prisma `@default(now())`/`@updatedAt` are client-maintained while raw DDL defaults apply only at insert (desktop UPDATEs set `updatedAt` manually today — any future raw-SQL writer silently freezes it); duplicate `idx_payment_receipt` index (the `@unique` already indexes); parity gate can't see any of this (PS-044). Fix: align or document; drop the duplicate index in all three copies.

**PS-050 · Error contract on web API** `Low|C|W` — every catch returns `e.message` verbatim (Prisma error text with model/constraint names); duplicate admissionNo → 500 not 409; missing id (P2025) → 500 not 404; **all GET routes have no try/catch** (DB failure = Next default 500, not the `{error}` shape). Fix: shared error mapper (P2002→409, P2025→404, validation→400, log server-side), wrap GETs.

---

## 5. Verified-correct (clean checks digest)

The following were explicitly checked and found **correct** (file:line evidence in the working papers):

- **Billing rules exactly as specified** — registration month complimentary, billing from the next month through the current month; defaulter = `overdueMonths.length > 1` even when the current month is paid; new joiner with nothing pending is "paid", never "due"; `classifyFeeCycle` is the single bucket function used by dashboard, fees statuses/defaulters and both backends; locked by `tests/domain.test.ts:329-388` (`domain.ts:199-259`).
- **Payment amount discipline** — `assertValidPayment` enforces exact `months × fee`, rejects zero/negative/NaN, zero-fee collection, in-request duplicate months and already-settled months; the settled set is recomputed server-side, never trusted from the client; both backends call the same validator (`domain.ts:334-366`; `payments/route.ts:70-75`; `tauri-api.ts:490-495`). Multi-month payments are a single atomic row.
- **Admission/receipt numbering** — deletion-safe `MAX(suffix)+1` (not count+1), unique constraints in all DDL copies, 3-attempt retry with re-read on the web path; receipt prefix uses the collection month, not the client-supplied date (`domain.ts:410-450`, `payments/route.ts:80-104`).
- **Attendance** — `@@unique([studentId,date])` in schema + DDL; whole-batch validation before any write; web bulk upsert wrapped in `$transaction`; desktop uses one multi-row `INSERT … ON CONFLICT` (single implicit transaction); optimistic UI with rollback and sequence token (`attendance/route.ts:30-38`; `tauri-api.ts:744-756`; `attendance-view.tsx:57-106`).
- **Media path safety** — `isSafeMediaPath` (folder allowlist + slash-free filename) enforced on serve, mirrored client-side in `mediaUrl()`; correct content-types, `nosniff`, private caching, GET-only (`domain.ts:483-494`; `media/route.ts:18-33`; `api.ts:355-368`).
- **Restored upload route reviewed and sound** — folder allowlist, shared `assertValidUpload` (10 MB, ext+MIME), `sanitizeFileName` + `Date.now()` prefix naming, write under `media/` (`src/app/api/upload/route.ts:1-38`).
- **Excel export safety** — plain strings typed as text by ExcelJS (no formula execution), sane sheet names/widths, UTF-8 BOM; receipt PDF money uses the `Rs.` guard with correct Indian-numbering amount-in-words (`export.ts:104-119,236-263`).
- **Paper pipeline agreement** — five named `@page` rules bound via `PAGE_CLASS`; native WebView2 presets in inches match CSS mm (A6 105×148 etc.); margins zero, backgrounds on, app chrome suppressed; preview toolbar cancel paths show neutral "not saved" toasts (`globals.css:795-839`; `printing.rs:26-34,73-84`; `print-root.tsx:39-46,132`).
- **WhatsApp bridge hygiene** — session store under app-data (writable, survives updates), **not** included in backups (no credential leakage); recipient digits-only validation duplicated on both sides; 20 MB document cap enforced before the pipe; id-correlated ack map with timeouts; sidecar killed on exit, self-exits on stdin EOF, stderr drained asynchronously (`whatsapp.rs:74-96,245-252,307-315`; `whatsapp-bot/src/main.rs:37,50-58,213-215`).
- **Desktop data-dir resolution** — portable.flag → `<exe>/PS-AMS-Data`, else `%APPDATA%`; marker file (`ps-ams-backup-target.txt`) written/read consistently next to the DB and surfaced via `data_paths`; WebView2 UDF forced writable; schema embedded in the binary (`lib.rs:29,111-155,328-331`).
- **Dashboard/fees agreement (v1.6.1 fix holds)** — both bucket via `computeFeeStatus`+`classifyFeeCycle` (`dashboard/route.ts:33-39`; `tauri-api.ts:596-605`).
- **CI posture** — `verify.yml` least-privilege (`contents: read`), frozen lockfile, full verify chain; `build-exe.yml` correct tag-gated release publishing with all three artifacts; sidecar built before `tauri build` with the right target-triple name; `verify.yml` triggers on main pushes (README overstates "every PR" — PS-051-adjacent wording nit folded into PS-048/PS-050 docs items).
- **Version strings agree** (1.6.4 ×4 locations); `.gitignore` correctly excludes runtime data, WAL sidecars, `.env*`, `.secrets/`; `seed.ts` cannot clobber real data (student-count guard).

---

## 6. Unresolved questions requiring a product-policy decision

| # | Question | Options | Consequence |
|---|---|---|---|
| Q1 | Arrears pricing when monthlyFee changes (PS-007) | (a) keep current-fee repricing, document it; (b) per-month fee history (`feeAtAccrual` in MN-1) | (a) zero schema change, simpler; (b) historically exact, larger migration |
| Q2 | Student deletion policy (PS-005) | (a) `Restrict` FK + archive-only (status Alumni); (b) allow purge with explicit `?purge=financials`; (c) keep cascade + louder warning | (a) recommended — preserves audit trail; (c) keeps data-loss footgun |
| Q3 | Zero-fee students (PS-004) | (a) auto-settled (recommended); (b) explicit waiver record per month | (a) one-line engine change; (b) auditable waivers, more UI |
| Q4 | Demo auto-seed in production (PS-022) | (a) dev/preview only; (b) first-run opt-in dialog | (a) recommended; (b) friendlier for evaluating the app |
| Q5 | Web API threat model (PS-012) | (a) token required by default + loopback bind enforced in code; (b) loopback bind only; (c) status quo + README caveat | (a) recommended; (c) leaves the PII dump reachable on LAN/dev |
| Q6 | Advance-payment months (PS-008) | (a) reject months > current month; (b) allow advance booking as a feature | (a) simpler ledger; (b) needs UI + reporting support |
| Q7 | Money representation (PS-009) | (a) epsilon/round compare now, Int paise later; (b) Int paise migration now | (a) low risk, small; (b) cleanest, schema migration |

---

## 7. Prioritized remediation plan (summary)

Full ordering, effort, dependencies and approval gates live in **`FIX_PLAN.md`**. Shape:

1. **Phase 3A — Data recovery & financial integrity (blocks release):** PS-002, PS-003, PS-006 (backup/restore crash-safety), PS-001 + MN-1 (allocation ledger + transactions), PS-004, PS-005, PS-008, PS-009, PS-007.
2. **Phase 3B — Security & privacy:** PS-012, PS-013, PS-014, PS-015.
3. **Phase 3C — Application correctness:** PS-019, PS-020, PS-016, PS-017, PS-018, PS-021, PS-022, PS-023, PS-024, PS-025, PS-026, PS-027, PS-028, PS-029, PS-030, PS-031, PS-032, PS-033, PS-034.
4. **Phase 3D — Exports, print, release quality:** PS-035, PS-036, PS-037, PS-041, PS-042, PS-043, PS-038, PS-039, PS-040, PS-044, PS-045, PS-046, PS-047, PS-048, PS-049, PS-050.

Then Phase 4 (regression tests per `TEST_MATRIX.md`), Phase 5 (parity matrix — several items pre-answered by PS-029/PS-030), Phase 6 (release verification → `RELEASE_REPORT.md`).

*No application code has been changed in Phases 0–2. Implementation starts only after the fix plan is approved.*
