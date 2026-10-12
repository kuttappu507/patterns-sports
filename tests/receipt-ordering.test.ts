import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createClient } from "@libsql/client"
import { NextRequest } from "next/server"

// ===========================================================================
// PS-056 — Receipt History must show the most recently ISSUED receipt first.
//
// The ledger used to order by paymentDate DESC, so a receipt collected TODAY
// for a backdated month (the arrears-settle flow) landed at its backdated
// position instead of the top — "receipt history not showing recent one
// first". The unfiltered ledger now lists by receiptNo DESC (issuance order
// — the RC number printed on the paper), while month-filtered and
// per-student listings keep paymentDate DESC.
//
// Evidence style: the REAL web route handler against a DISPOSABLE SQLite
// file, plus the REAL desktop SQL text from tauri-api.ts (same ORDER BY
// semantics via libsql) — both backends must agree.
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-order-test-"))
const dbFile = path.join(tmpDir, "order-test.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

async function rawRows<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  const client = createClient({ url: `file:${dbFile}` })
  try {
    const result = await client.execute({ sql, args: args as never[] })
    return result.rows as unknown as T[]
  } finally {
    client.close()
  }
}

async function postPayment(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/payments/route")
  const req = new NextRequest("http://localhost:3000/api/payments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function getPayments(url: string): Promise<{ status: number; rows: Record<string, unknown>[] }> {
  const { GET } = await import("@/app/api/payments/route")
  const req = new NextRequest(`http://localhost:3000${url}`)
  const res = await GET(req)
  return { status: res.status, rows: (await res.json()) as Record<string, unknown>[] }
}

describe("PS-056 — receipt ledger lists issuance-first (disposable DB)", () => {
  it("boots the schema and seeds the demo academy", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
    const students = await rawRows<{ n: number }>("SELECT COUNT(*) AS n FROM Student")
    expect(Number(students[0].n)).toBeGreaterThan(0)
  })

  it("a just-issued BACKDATED receipt tops the unfiltered ledger; month + student views stay date-ordered", async () => {
    const { db } = await import("@/lib/db")
    const { computeFeeStatus } = await import("@/lib/psams/domain")

    const students = await db.student.findMany({ include: { payments: true } })
    const thisMonth = new Date().toISOString().slice(0, 7)
    const targets = students
      .map((s) => ({ s, st: computeFeeStatus(s, s.payments) }))
      .filter(({ st }) => st.pendingMonths.some((m: string) => m <= thisMonth))
      .slice(0, 3)
    expect(targets.length).toBe(3)
    const pendingOf = (i: number) => targets[i].st.pendingMonths.filter((m: string) => m <= thisMonth)[0]

    const today = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const oldDay = new Date(today); oldDay.setDate(oldDay.getDate() - 10)

    // Three receipts: yesterday / today / BACKDATED-10-days (issued today).
    const r1 = await postPayment({ studentId: targets[0].s.id, months: [pendingOf(0)], amount: targets[0].s.monthlyFee, paymentDate: iso(yesterday), paymentMode: "Cash" })
    expect(r1.status).toBe(201)
    const r2 = await postPayment({ studentId: targets[1].s.id, months: [pendingOf(1)], amount: targets[1].s.monthlyFee, paymentDate: iso(today), paymentMode: "UPI / GPay" })
    expect(r2.status).toBe(201)
    const r3 = await postPayment({ studentId: targets[2].s.id, months: [pendingOf(2)], amount: targets[2].s.monthlyFee, paymentDate: iso(oldDay), paymentMode: "Cash" })
    expect(r3.status).toBe(201)
    const backdatedNo = String(r3.json.receiptNo)
    const todayNo = String(r2.json.receiptNo)

    // --- web route: unfiltered ledger → issuance order (backdated first) ---
    const ledger = await getPayments("/api/payments?limit=200")
    expect(ledger.status).toBe(200)
    const topTwo = ledger.rows.slice(0, 2).map((p) => String(p.receiptNo))
    expect(topTwo).toContain(backdatedNo)
    expect(ledger.rows[0].receiptNo).toBe(backdatedNo)
    expect(ledger.rows[1].receiptNo).toBe(todayNo)

    // --- month-filtered view keeps paymentDate DESC (period listing) ---
    // The month filter rides the PaymentMonth LEDGER (the settled month,
    // which for the backdated receipt is its arrears month, not the payment
    // date's month) — ordering within the view is still paymentDate DESC.
    const settledMonth = String(pendingOf(2))
    const byMonth = await getPayments(`/api/payments?month=${settledMonth}`)
    expect(byMonth.status).toBe(200)
    expect(byMonth.rows.map((p) => String(p.receiptNo))).toContain(backdatedNo)
    for (let i = 1; i < byMonth.rows.length; i++) {
      const prev = String(byMonth.rows[i - 1].paymentDate)
      const cur = String(byMonth.rows[i].paymentDate)
      expect(prev >= cur, `month view rows must be date-DESC (${prev} < ${cur})`).toBe(true)
    }

    // --- per-student view keeps paymentDate DESC ---
    const byStudent = await getPayments(`/api/payments?studentId=${targets[2].s.id}`)
    expect(byStudent.status).toBe(200)
    expect(byStudent.rows[0].receiptNo).toBe(backdatedNo)
    for (let i = 1; i < byStudent.rows.length; i++) {
      const prev = String(byStudent.rows[i - 1].paymentDate)
      const cur = String(byStudent.rows[i].paymentDate)
      expect(prev >= cur).toBe(true)
    }

    // --- desktop SQL text mirrors the web route exactly ---
    const desktopLedger = await rawRows<{ receiptNo: string }>(
      `SELECT p.receiptNo
       FROM FeePayment p JOIN Student s ON s.id = p.studentId
       ORDER BY p.receiptNo DESC, p.createdAt DESC, p.paymentDate DESC`
    )
    expect(desktopLedger[0].receiptNo).toBe(backdatedNo)
    const desktopMonth = await rawRows<{ receiptNo: string; paymentDate: string }>(
      `SELECT p.receiptNo, p.paymentDate
       FROM FeePayment p JOIN Student s ON s.id = p.studentId
       WHERE p.id IN (SELECT paymentId FROM PaymentMonth WHERE month = $1)
       ORDER BY p.paymentDate DESC, p.createdAt DESC, p.receiptNo DESC`,
      [settledMonth]
    )
    for (let i = 1; i < desktopMonth.length; i++) {
      expect(String(desktopMonth[i - 1].paymentDate) >= String(desktopMonth[i].paymentDate)).toBe(true)
    }
  })
})
