# PS-AMS — Migration Notes (PROPOSALS — nothing executed)

Status: **design documents for Phase 3A/3C approval.** No real database has been touched. Every step below is rehearsed on disposable legacy-shaped fixtures first, with before/after reconciliation evidence, per `FIX_PLAN.md`.

---

## MN-1 · Billing allocation ledger `PaymentMonth` (fixes PS-001, enables PS-030)

**Problem.** `FeePayment.months` is a JSON string; the DB cannot enforce "one receipt per (student, billing month)", and month filtering cannot use an index. Concurrency is guarded only by application-level check-then-insert.

**Proposed schema (all three DDL copies + Prisma):**

```prisma
model PaymentMonth {
  id        String     @id @default(cuid())
  studentId String
  month     String     // "YYYY-MM"
  paymentId String
  payment   FeePayment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  student   Student    @relation(fields: [studentId], references: [id], onDelete: Cascade)
  @@unique([studentId, month])
  @@index([month])
  @@index([paymentId])
}
```
Raw DDL: `CREATE TABLE IF NOT EXISTS PaymentMonth (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, month TEXT NOT NULL, paymentId TEXT NOT NULL, UNIQUE(studentId, month), FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY (paymentId) REFERENCES FeePayment(id) ON DELETE CASCADE ON UPDATE CASCADE);` + two indexes.

**Backfill (inside one transaction, per database):**
```sql
INSERT INTO PaymentMonth (id, studentId, month, paymentId)
SELECT lower(hex(randomblob(16))), p.studentId, j.value, p.id
FROM FeePayment p, json_each(p.months) j
WHERE NOT EXISTS (SELECT 1 FROM PaymentMonth m WHERE m.studentId = p.studentId AND m.month = j.value);
```
**Reconciliation checks (report before/after, must match exactly):**
- receipts: `COUNT(FeePayment)` unchanged; every `months` JSON still intact (source of truth during transition).
- allocations: `COUNT(PaymentMonth) == SUM(json_array_length(months))` over all receipts **minus pre-existing duplicates**.
- duplicates: `SELECT studentId, month, COUNT(*) c FROM PaymentMonth GROUP BY 1,2 HAVING c > 1` → **expected non-empty in legacy data only if history already contains a double-receipted month** — each occurrence is listed in the reconciliation report for manual review; nothing is merged, renumbered or deleted (rule: never rewrite historical receipts).
- sums: `SUM(amount)` unchanged; per-student settled-month sets identical to `parsePaidMonths` results computed before migration.

**Write path after migration:** collect = `BEGIN IMMEDIATE` → validate (incl. allocation-table `paid set`) → insert FeePayment + one PaymentMonth row per month → `COMMIT`. `UNIQUE(studentId,month)` turns any race into a constraint error (409) instead of a double receipt. Web uses `db.$transaction`; desktop one batch. The existing JSON `months` column is kept and kept in sync during a transition release (dual-write), then becomes derived data.

**Compatibility:** additive only; old app versions reading `months` keep working. Rollback = drop table (dual-write makes this safe).

---

## MN-2 · Versioned migration runner (fixes PS-019/PS-020/PS-023)

- Desktop: `PRAGMA user_version` ledger; numbered migrations `001_gender…`, `0NN_payment_month`, `0MM_fk_restrict`; each migration: guarded, idempotent, logged to `boot.log`; a failed migration **aborts boot** with a visible `bootError` (no silent continuation). DDL for fresh installs continues to come from the embedded `schema.sql` (generated — see MN-3).
- Web: same ledger concept in `bootstrap.ts` (a `SchemaVersion` Setting row + guarded `ALTER`s mirroring the desktop list), replacing the `CREATE TABLE IF NOT EXISTS`-only bootstrap for **existing** files.
- Single source of truth: a small generator renders `prisma/schema.prisma` → both `src-tauri/resources/schema.sql` and the `SCHEMA_DDL` constant in CI; `check:parity` (upgraded per PS-044) verifies the generated copies.
- `package.json`: remove `--accept-data-loss` from `db:push` (deliberate flag only).

## MN-3 · FK action for FeePayment (fixes PS-005; needs Q2 decision)

`ON DELETE CASCADE → ON DELETE RESTRICT` for `FeePayment.student` in all three copies + the migration above (`PRAGMA foreign_keys=OFF; rebuild table; ON` — SQLite cannot alter FK actions in place; the rebuild must copy rows and verify counts). Legacy DBs with orphaned rows (possible while FK was per-connection) are surfaced by the reconciliation report, not silently cleaned.

## MN-4 · Money representation (needs Q7 decision; optional)

Option (b): `monthlyFee`/`amount`/`dueAmount` → integer paise. Requires table rebuilds (REAL→INTEGER), a formatting pass (`formatINR` ÷100), validator updates, and fixture reconciliation. Recommend (a) epsilon/round compare now; revisit only if fractional fees become real.

## MN-5 · Schema-copy hygiene (fixes PS-046/PS-049)

Delete `tauri/` and `src-tauri/sidecar/whatsapp-bot/` (history preserves them) or move to `docs/legacy/` with DEPRECATED headers; drop the duplicate `idx_payment_receipt` from all copies; align Prisma/SQLite defaults or document the intentional split.

---

**Execution order:** MN-2 (runner) → MN-1 (ledger) → MN-3 (FK) → MN-5 (hygiene). Each lands as its own release-compatible commit with tests from `TEST_MATRIX.md` §6. No automatic migration of real data without: verified backup + owner approval + reconciliation report attached.
