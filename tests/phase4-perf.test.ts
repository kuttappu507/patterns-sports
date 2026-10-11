import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createClient } from "@libsql/client"
import { NextRequest } from "next/server"

// ===========================================================================
// Phase 4 · T-M5 / T-S9 performance battery — 100 / 1k / 5k / 10k SYNTHETIC
// students (disposable DB, deterministic fixtures, never real data):
//
//   dashboard snapshot · fees statuses · month-filtered payments (ledger
//   index) · students search (indexed + full-list mode)
//
// Budgets are deliberately generous (CI hardware varies); they exist to
// catch ALGORITHMIC regressions (full-table JSON parses, N+1 queries,
// missing indexes) rather than to certify absolute latency. Measured
// medians are recorded in TEST_MATRIX.md §6.
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-phase4-perf-"))
const dbFile = path.join(tmpDir, "phase4-perf.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

const TARGETS = [100, 1000, 5000, 10000]

async function rawExec(sql: string, args: unknown[] = []): Promise<void> {
  const client = createClient({ url: `file:${dbFile}` })
  try {
    await client.execute({ sql, args: args as never[] })
  } finally {
    client.close()
  }
}

async function timeMs(fn: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now()
  await fn()
  return Math.round(performance.now() - t0)
}

/** Bulk-insert students up to `count` using chunked multi-row INSERTs. */
async function seedStudentsTo(count: number): Promise<void> {
  const reg = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 5).toISOString()
  const dob = "2012-05-01T00:00:00.000Z"
  for (let start = 0; start < count; start += 200) {
    const n = Math.min(200, count - start)
    const values: string[] = []
    const args: (string | number)[] = []
    for (let i = 0; i < n; i++) {
      values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      // order MUST match the INSERT column list below
      args.push(
        `perf-${String(start + i).padStart(6, "0")}`,
        `PSA-PERF-${String(start + i).padStart(6, "0")}`,
        `Perf Player ${start + i}`,
        "Perf Parent",
        `9847${String(1000000 + start + i).slice(-6)}`,
        "Junior",
        500,
        reg,
        "Active",
        dob
      )
    }
    await rawExec(
      `INSERT INTO Student (id, admissionNo, fullName, parentName, mobile, ageCategory, monthlyFee, registrationDate, status, dateOfBirth)
       VALUES ${values.join(", ")}
       ON CONFLICT(id) DO NOTHING`,
      args
    )
  }
}

/** Seed `n` receipts for the current month spread over the perf students. */
async function seedPaymentsForMonth(n: number): Promise<void> {
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  for (let start = 0; start < n; start += 200) {
    const n2 = Math.min(200, n - start)
    const values: string[] = []
    const args: (string | number)[] = []
    for (let i = 0; i < n2; i++) {
      const k = start + i
      values.push("(?, ?, ?, ?, ?, ?, ?)")
      // order MUST match: id, receiptNo, studentId, paymentDate, months, amount, paymentMode
      args.push(
        `perf-rc-${k}`,
        `RC-PERF-${String(k).padStart(6, "0")}`,
        `perf-${String(k).padStart(6, "0")}`,
        new Date(now.getFullYear(), now.getMonth(), Math.min(10 + (k % 15), now.getDate())).toISOString(),
        JSON.stringify([monthKey]),
        500,
        "Cash"
      )
    }
    await rawExec(
      `INSERT INTO FeePayment (id, receiptNo, studentId, paymentDate, months, amount, paymentMode) VALUES ${values.join(", ")}
       ON CONFLICT(id) DO NOTHING`,
      args
    )
    const allocValues: string[] = []
    const allocArgs: (string | number)[] = []
    for (let i = 0; i < n2; i++) {
      const k = start + i
      allocValues.push("(?, ?, ?)")
      allocArgs.push(`perf-${String(k).padStart(6, "0")}`, monthKey, `perf-rc-${k}`)
    }
    // keep the ledger in sync so the month filter rides REAL PaymentMonth
    // rows (UNIQUE(studentId, month) → INSERT OR IGNORE)
    await rawExec(
      `INSERT OR IGNORE INTO PaymentMonth (studentId, month, paymentId) VALUES ${allocValues.join(", ")}`,
      allocArgs
    )
  }
}

describe("T-M5 · perf battery (synthetic volume, disposable DB)", () => {
  it("boots the schema, then clears the demo seed for exact-count math", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
    // the boot seeds the demo academy — exact-count assertions need a clean
    // slate (children first: RESTRICT on FeePayment→Student)
    await rawExec("DELETE FROM PaymentMonth")
    await rawExec("DELETE FROM FeePayment")
    await rawExec("DELETE FROM Attendance")
    await rawExec("DELETE FROM Achievement")
    await rawExec("DELETE FROM Student")
  })

  const medians: Record<string, number[]> = { students: [], statuses: [], dashboard: [], monthFilter: [] }

  for (const size of TARGETS) {
    it(`volume ${size}: seed + search + statuses + dashboard + month filter`, async () => {
      await seedStudentsTo(size)

      const { GET: studentsGET } = await import("@/app/api/students/route")

      // T-S9 — indexed search (server-side take) stays fast at every size
      const searchMs = await timeMs(async () => {
        const res = await studentsGET(new NextRequest("http://localhost:3000/api/students?q=Player%201&take=50"))
        expect(res.status).toBe(200)
        const rows = (await res.json()) as unknown[]
        expect(rows.length).toBeLessThanOrEqual(50)
        expect(rows.length).toBeGreaterThan(0)
      })
      medians.students.push(searchMs)
      expect(searchMs, `indexed search at ${size}`).toBeLessThan(2000)

      // full-list mode (the UI default) — bounded by data volume, not N+1
      const fullMs = await timeMs(async () => {
        const res = await studentsGET(new NextRequest("http://localhost:3000/api/students"))
        expect(res.status).toBe(200)
        const rows = (await res.json()) as unknown[]
        expect(rows.length).toBe(size)
      })
      expect(fullMs, `full list at ${size}`).toBeLessThan(15000)

      const { GET: statusesGET } = await import("@/app/api/fees/statuses/route")
      const statusMs = await timeMs(async () => {
        const res = await statusesGET()
        expect(res.status).toBe(200)
        const rows = (await res.json()) as unknown[]
        expect(rows.length).toBe(size) // every perf student is Active
      })
      medians.statuses.push(statusMs)
      expect(statusMs, `fee statuses at ${size}`).toBeLessThan(15000)

      const { GET: dashGET } = await import("@/app/api/dashboard/route")
      const dashMs = await timeMs(async () => {
        const res = await dashGET()
        expect(res.status).toBe(200)
        const dash = (await res.json()) as { totalActive: number }
        expect(dash.totalActive).toBe(size)
      })
      medians.dashboard.push(dashMs)
      expect(dashMs, `dashboard at ${size}`).toBeLessThan(15000)

      // month filter: 5k ledger-backed receipts from the 5k stage onward
      if (size >= 5000 && medians.monthFilter.length === 0) {
        await seedPaymentsForMonth(5000)
        const now = new Date()
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
        const { GET: paymentsGET } = await import("@/app/api/payments/route")
        const monthMs = await timeMs(async () => {
          const res = await paymentsGET(new NextRequest(`http://localhost:3000/api/payments?month=${monthKey}&limit=100`))
          expect(res.status).toBe(200)
          const rows = (await res.json()) as unknown[]
          expect(rows).toHaveLength(100)
        })
        medians.monthFilter.push(monthMs)
        expect(monthMs, `ledger month filter at ${size} students`).toBeLessThan(3000)
      }
    }, 60000)
  }

  it("records the measured medians as evidence", () => {
    const med = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : -1)
    const evidence = {
      studentsSearchP50_ms: med(medians.students),
      feeStatusesP50_ms: med(medians.statuses),
      dashboardP50_ms: med(medians.dashboard),
      monthFilterP50_ms: med(medians.monthFilter),
    }
    console.warn("[phase4-perf evidence]", JSON.stringify(evidence))
    // sanity: the indexed paths must not blow up — algorithmic regressions
    // (N+1, full JSON parse) would show as multiples of the budget
    expect(evidence.studentsSearchP50_ms).toBeLessThan(2000)
    expect(evidence.dashboardP50_ms).toBeLessThan(15000)
  })
})
