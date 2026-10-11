# PS-AMS — Web/Desktop Parity Matrix (Phase 5 walkthrough)

**Scope:** every user-facing workflow, marked **equivalent** / **intentionally different** / **deferred** — no silent drift. Companion to the mechanical `npm run check:parity` gate (schema ↔ DDL ↔ delegations) and the endpoint-existence test (`tests/api-routes.test.ts`), which together guarantee the CALL SURFACE cannot drift; this document records where behaviour is *deliberately* platform-specific.

**Method:** (1) mechanical gates re-run at `553c33e` — parity OK (7 models ↔ 7 tables, 70 columns, 29 native delegations ↔ 30 tauri exports), endpoint test green; (2) line review of `src/lib/psams/api.ts` ↔ `src/lib/psams/tauri-api.ts` ↔ the route handlers; (3) the Phase 4 battery proves the shared validators reject identically (the SAME `domain.ts` guards run on both backends).

**Status keys:** ✅ equivalent · 🔀 intentionally different (documented reason) · 🖥️ desktop-only (intentional) · 🌐 web-only (intentional) · ⏳ deferred (tracked, not a defect).

## 1. Boot & schema

| Workflow | Web | Desktop | Status |
|---|---|---|---|
| Schema creation | `bootstrap.ts` DDL pass (SCHEMA_DDL copy, parity-gated against schema.sql) | `schema.sql` applied by `initBackend` | ✅ single source enforced by check:parity (columns + indexes + composites + FK actions) |
| Versioned migrations | `applyMigrations()` after DDL (PRAGMA user_version) | same runner, same list (`migrations.ts`) | ✅ T-M1 proves legacy upgrade + loud failure (PS-023) |
| FK enforcement | `foreign_keys=1` verified by integration test | sqlx connect options `.foreign_keys(true)` (PS-024) | ✅ |
| Demo auto-seed on empty DB | OFF (prod gate) | OFF (PS-022) | ✅ |

## 2. Core workflows

| Workflow | Web | Desktop | Status |
|---|---|---|---|
| Students list/search/filter | GET /api/students (same filter set + optional `take`/`skip`, PS-030) | `fetchStudents` (same filters, full list) | ✅ same shared validator + filter semantics; pagination is a web-side OPTION the UI may use — no behavioural drift |
| Student create | POST — `assertValidStudentInput` (shared) | `createStudent` — SAME shared guard | ✅ T-S1 battery |
| Student update (merged-record) | PUT validates `{...current, ...patch}` (PS-017), 404 on unknown id | `updateStudent` merged validation + 404 | ✅ T-S2 battery |
| Student delete (financial guard) | 409 when receipts exist + media unlink | same guard + explicit cascade + PaymentMonth-first + media unlink | ✅ T-S5 (web executed; desktop guard is the same code path in `domain.ts` + UNIQUE RESTRICT) |
| Achievements CRUD | POST/DELETE routes | same | ✅ |
| Fee statuses (billing ledger) | `computeFeeStatus` (shared) over Active students | same function, same inputs | ✅ T-F14 proves both surfaces agree at 150 receipts |
| Collect fee | `db.$transaction` (read → ledger pre-check → validate → insert → allocations) | UNIQUE(studentId,month) backstop + compensating cleanup (plugin pool cannot host BEGIN…COMMIT — verified against tauri-plugin-sql 2.2.0) | 🔀 same GUARANTEES (one receipt per month, 409 on clash), different mechanism — documented in tauri-api.ts; T-F8 executed on web, desktop runtime proof rides the next Windows build |
| Receipt history | GET /api/payments — paymentDate DESC, createdAt DESC, receiptNo DESC + limit | identical order + limit (PS-029) | ✅ T-R2 |
| Defaulters | GET /api/fees/defaulters | `fetchDefaulters` | ✅ same classifyFeeCycle |
| Dashboard | GET /api/dashboard (Active-only attendance, PS-026) | `fetchDashboard` same shape incl. Active-only | ✅ |
| Committee CRUD + reorder | PUT merged 400s; reorder guards stale ids (PS-029/032) | same guards (PS-029 parity comment) | ✅ |
| Attendance | whole-batch validation + upsert (dup-in-batch = last wins) | same shared `assertValidAttendanceRecords` + upsert | ✅ T-S7 |
| Settings | allowlist + transaction + refetched return (PS-027) | same core rejects (PS-027 parity comment) | ✅ |
| Demo data load/remove | transactional POST (flag in-tx) + DELETE (PS-021) | atomic claim marker + checkpointed compensation | 🔀 both guarantee "all or nothing" — different compensation models, both tested |
| Registration/admission numbering | `nextAdmissionNo` / `nextReceiptNo` (shared, deletion-safe) | same | ✅ T-S4/T-F9 |

## 3. Data safety

| Workflow | Web | Desktop | Status |
|---|---|---|---|
| JSON snapshot export | `/api/backup` download | same + Rust save dialog | ✅ |
| Crash-safe DB backup (VACUUM INTO + quick_check + atomic rename + media mirror + retention 20) | — | `backup_now` (3A-1) | 🖥️ the JSON snapshot IS the web backup surface; a web .db copy would need server fs access the threat model excludes |
| Restore (staged + validated + pre-restore snapshot + status banner) | — | `restore_probe`/`restore_backup` (3A-2/3) | 🖥️ web restores by re-cloning from a snapshot via the owner's own tooling; the validated one-click restore is a desktop capability by design |
| Boot reconciliation of the ledger | every boot (web) | every boot (desktop backfill) | ✅ T-F13 |
| Migration safety | shared runner | shared runner | ✅ |

## 4. Media

| Workflow | Web | Desktop | Status |
|---|---|---|---|
| Upload (10 MB, ext+MIME allowlist) | POST /api/upload → media/ folder | plugin-fs write into appData media/ | ✅ same `assertValidUpload` + `sanitizeFileName` |
| Serving | `/api/media?path=` (traversal-guarded, nosniff) | `convertFileSrc` custom protocol (same `isSafeMediaPath` guard) | ✅ T-A7 |
| Delete-time unlink | best-effort rm | best-effort unlink | ✅ |

## 5. Platform integrations

| Workflow | Web | Desktop | Status |
|---|---|---|---|
| WhatsApp linked device (send from app number) | card explains desktop-only | bundled sidecar (whatsapp-rust), QR link, auto-respawn budget, wa_restart | 🖥️ sidecar ships only with the desktop binary |
| WhatsApp quick share (wa.me deep link) | ✅ | ✅ fallback when not linked | ✅ |
| Updater (GitHub releases, sha256 digest) | — | PS-015 hardened flow | 🖥️ |
| Excel/CSV/PDF exports | same export.ts code; browser download | same code; Rust save dialog — `{saved, cancelled}` honest outcome, no hidden fallback (PS-037) | 🔀 transport only, same documents |
| Print (rosters/receipts) | browser print (`@media print` suppresses overlays, PS-041) | `print_to_pdf` via Rust dialog + same CSS | 🔀 transport only |
| Data location info | SQLite path behind DATABASE_URL (redacted, PS-013) | `data_paths` Rust command (appData/db/media/backup/log) | 🔀 content is platform-specific by definition; shape equal |
| API auth posture | token header + HttpOnly cookie + Origin checks (PS-012) | no network API at all — static frontend + in-process SQLite | 🌐 the desktop build ships NO attack surface to guard |

## 6. Defects found during this walkthrough

None open. (The walkthrough WAS the review pass for the remaining PS-029/PS-030/PS-044 follow-ups — all three closed in 3C/3D with tests. PS-043 remainder items were recorded as Phase 5 polish in 3D-4 and are reflected here: aria labels, empty states, deep links, SafeImg fallbacks.)

## 7. Result

**34/34 workflow rows: no unexplained drift.** 24 equivalent, 5 intentionally different (transport/mechanism with equal guarantees, each carrying its own evidence link), 4 desktop-only capabilities, 1 web-only postural difference (API auth — the desktop ships no network surface at all). The parity story is enforced three ways: the mechanical gate (schema + delegation), the endpoint-existence test (routes ↔ api.ts), and the shared validator battery (Phase 4) — a future contributor must break at least all three to reintroduce silent drift.
