// ============================================================
// PS-AMS :: Billing allocation ledger (PaymentMonth) helpers.
//
// Fixes PS-001: FeePayment.months is a JSON string, so the database could
// never enforce "one receipt per (student, billing month)" and two
// concurrent collects could both pass the check-then-insert validation.
// The PaymentMonth table carries UNIQUE(studentId, month) — the database
// itself now rejects the second receipt.
//
// During the transition release the JSON `months` column stays the read
// source of truth and is dual-written; this module keeps the ledger in
// sync:
//   - planLedgerBackfill  — pure, unit-tested planner (first receipt wins)
//   - allocation row ids  — collision-free without a Prisma dependency
// Both backends (web bootstrap.ts + desktop tauri-api.ts) call the planner
// so legacy data is reconciled identically.
// ============================================================

import { parsePaidMonths } from "./domain"

export interface LedgerPaymentRow {
  id: string
  studentId: string
  months: string
}

export interface LedgerAllocation {
  id: string
  studentId: string
  month: string
  paymentId: string
}

export interface LedgerClash {
  studentId: string
  month: string
}

/** Collision-free row id for raw ledger inserts (no cuid dependency). */
export function allocationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pm-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * Pure backfill planner: given every receipt row and the allocation keys
 * that already exist, return the missing allocation rows.
 *
 * Pre-existing double-receipted months in legacy data (history the audit
 * forbids rewriting) are resolved FIRST receipt wins — the later receipt
 * keeps its JSON months untouched and is reported as a clash for the
 * reconciliation report. The planner never mutates receipts.
 */
export function planLedgerBackfill(
  payments: LedgerPaymentRow[],
  existingKeys: LedgerClash[],
  newId: () => string = allocationId
): { allocations: LedgerAllocation[]; clashes: LedgerClash[] } {
  const ledgerKeys = new Set(existingKeys.map((k) => `${k.studentId}\u0000${k.month}`))
  const seen = new Set(ledgerKeys)
  const allocations: LedgerAllocation[] = []
  const clashes: LedgerClash[] = []
  for (const p of payments) {
    const months = parsePaidMonths(p.months)
    for (const month of months) {
      const key = `${p.studentId}\u0000${month}`
      if (seen.has(key)) {
        // A key already IN the ledger is simply migrated (idempotent re-run);
        // a duplicate WITHIN this scan is a legacy double-receipted month.
        if (!ledgerKeys.has(key)) clashes.push({ studentId: p.studentId, month })
        continue
      }
      seen.add(key)
      allocations.push({ id: newId(), studentId: p.studentId, month, paymentId: p.id })
    }
  }
  return { allocations, clashes }
}
