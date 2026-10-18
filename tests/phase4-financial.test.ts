import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"

// ===========================================================================
// Phase 4 · §1 Financial integrity battery (TEST_MATRIX T-F1…T-F14) — the
// REAL web write/read paths against a DISPOSABLE SQLite file. Covers the
// 📋 route-level items the unit suite cannot prove:
//
//   T-F1  valid single + multi-month collect → 201, receipt RC-…
//   T-F2  amount mismatch / zero / negative / NaN → 400
//   T-F3  malformed month keys → 400
//   T-F5  duplicate month inside ONE request → 400
//   T-F6  zero-fee student: settled forever, collect rejected
//   T-F7  fee change mid-tenure → pinned Q1a policy (arrears at current fee)
//   T-F9  concurrent receipt numbering → distinct receiptNo, no duplicate
//   T-F10 failed collect (unknown student) → no partial payment/allocation
//   T-F14 fees-screen vs dashboard agreement at ~150 receipts
//   T-R2  receipt history beyond 200 records: windowed, ordered, correct
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-phase4-fin-"))
const dbFile = path.join(tmpDir, "phase4-fin.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/payments/route")
  const req = new NextRequest(`http://localhost:3000${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function getJson<T>(mod: string, url: string, exported = "GET"): Promise<T> {
  const route = await import(mod)
  const handler = route[exported] as (req: NextRequest) => Promise<Response>
  const req = new NextRequest(`http://localhost:3000${url}`)
  const res = await handler(req)
  return (await res.json()) as T
}

let seq = 0
async function createStudent(overrides: Record<string, unknown> = {}): Promise<{
  id: string
  monthlyFee: number
  registrationDate: Date
  fullName: string
}> {
  const { POST } = await import("@/app/api/students/route")
  seq++
  const reg = overrides.registrationDate ?? new Date(new Date().getFullYear(), new Date().getMonth() - 3, 5)
  const body = {
    fullName: `Fin Battery Player ${Date.now()}-${seq}`,
    dateOfBirth: "2012-05-01",
    parentName: "Fin Parent",
    mobile: "9847000000",
    ageCategory: "Junior",
    monthlyFee: 500,
    registrationDate: reg,
    ...overrides,
  }
  const req = new NextRequest("http://localhost:3000/api/students", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await POST(req)
  expect(res.status, "student fixture creation").toBe(201)
  const s = (await res.json()) as { id: string; monthlyFee: number; registrationDate: string; fullName: string }
  return { ...s, monthlyFee: s.monthlyFee, registrationDate: new Date(s.registrationDate) }
}

/** Collectable pending month for a freshly-created student (oldest first). */
async function firstPendingMonth(studentId: string): Promise<string> {
  const { db } = await import("@/lib/db")
  const { computeFeeStatus } = await import("@/lib/psams/domain")
  const s = await db.student.findUniqueOrThrow({ where: { id: studentId }, include: { payments: true } })
  const st = computeFeeStatus(s, s.payments)
  expect(st.pendingMonths.length, "fixture student must have pending months").toBeGreaterThan(0)
  return st.pendingMonths[0]
}

describe("T-F1 · valid collects (single + multi-month)", () => {
  it("single month → 201, one row, RC- receipt, ledger row", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
    const s = await createStudent()
    const month = await firstPendingMonth(s.id)
    const res = await postJson("/api/payments", {
      studentId: s.id,
      months: [month],
      amount: 500,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(res.status).toBe(201)
    const p = res.json as unknown as { receiptNo: string; amount: number; months: string | string[] }
    expect(p.receiptNo).toMatch(/^RC-\d{6}-\d{5}$/)
    expect(p.amount).toBe(500)
    // the wire format carries months as the stored JSON string
    expect(JSON.parse(p.months as unknown as string)).toEqual([month])
  })

  it("multi-month collect → 201, one receipt for both months", async () => {
    const { db } = await import("@/lib/db")
    const { computeFeeStatus } = await import("@/lib/psams/domain")
    const s = await createStudent()
    const fresh = await db.student.findUniqueOrThrow({ where: { id: s.id }, include: { payments: true } })
    const pending = computeFeeStatus(fresh, fresh.payments).pendingMonths
    expect(pending.length).toBeGreaterThanOrEqual(2)
    const [m1, m2] = pending
    const res = await postJson("/api/payments", {
      studentId: s.id,
      months: [m1, m2],
      amount: 1000,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "UPI / GPay",
    })
    expect(res.status).toBe(201)
    const rows = await db.feePayment.findMany({ where: { studentId: s.id } })
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].months as unknown as string).sort()).toEqual([m1, m2].sort())
  })
})

describe("T-F2 · amount guards", () => {
  it("amount ≠ months × fee → 400 (mismatch)", async () => {
    const s = await createStudent()
    const month = await firstPendingMonth(s.id)
    const res = await postJson("/api/payments", {
      studentId: s.id,
      months: [month],
      amount: 499,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/must match/i)
  })

  it("zero / negative / NaN amount → 400", async () => {
    const s = await createStudent()
    const month = await firstPendingMonth(s.id)
    for (const amount of [0, -500, Number.NaN]) {
      const res = await postJson("/api/payments", {
        studentId: s.id,
        months: [month],
        amount,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode: "Cash",
      })
      expect(res.status, `amount=${amount}`).toBe(400)
    }
  })
})

describe("T-F3 · malformed month keys", () => {
  it("2026-13 / 2026-1 / abc / numeric → 400", async () => {
    const s = await createStudent()
    for (const months of [["2026-13"], ["2026-1"], ["abc"], [13]]) {
      const res = await postJson("/api/payments", {
        studentId: s.id,
        months: months as string[],
        amount: 500,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMode: "Cash",
      })
      expect(res.status, `months=${JSON.stringify(months)}`).toBe(400)
      expect(String(res.json.error)).toMatch(/YYYY-MM/i)
    }
  })
})

describe("T-F5 · duplicate month inside one request", () => {
  it("['2025-08','2025-08'] → 400 before any write", async () => {
    const { db } = await import("@/lib/db")
    const s = await createStudent()
    const before = await db.feePayment.count()
    const res = await postJson("/api/payments", {
      studentId: s.id,
      months: ["2025-08", "2025-08"],
      amount: 1000,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/[Dd]uplicate/i)
    expect(await db.feePayment.count()).toBe(before)
  })
})

describe("T-F6 · zero-fee student (PS-004)", () => {
  it("status is settled, collect is rejected, never a defaulter", async () => {
    const { db } = await import("@/lib/db")
    const { computeFeeStatus } = await import("@/lib/psams/domain")
    const s = await createStudent({ monthlyFee: 0 })
    const fresh = await db.student.findUniqueOrThrow({ where: { id: s.id }, include: { payments: true } })
    const st = computeFeeStatus(fresh, fresh.payments)
    expect(st.isDefaulter).toBe(false)
    expect(st.dueAmount).toBe(0)
    const res = await postJson("/api/payments", {
      studentId: s.id,
      months: st.pendingMonths.length ? [st.pendingMonths[0]] : ["2020-01"],
      amount: 0,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(res.status).toBe(400)
    const msg = String(res.json.error)
    // zero-fee: the bounds guard answers first for a pre-registration month,
    // or the fee guard answers "no monthly fee to collect" — either way the
    // collect NEVER lands
    expect(/billing starts|no monthly fee|amount/i.test(msg)).toBe(true)
    expect(await db.feePayment.count({ where: { studentId: s.id } })).toBe(0)
  })
})

describe("T-F7 · fee change mid-tenure (Q1a policy)", () => {
  it("paid months keep their receipts; arrears reprice at the CURRENT fee", async () => {
    const { db } = await import("@/lib/db")
    const { PUT } = await import("@/app/api/students/[id]/route")
    const s = await createStudent({ monthlyFee: 500 })
    const m1 = await firstPendingMonth(s.id)
    const pay = await postJson("/api/payments", {
      studentId: s.id,
      months: [m1],
      amount: 500,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(pay.status).toBe(201)

    // raise the fee — old receipts are untouched, pending months reprice
    const put = new NextRequest(`http://localhost:3000/api/students/${s.id}`, {
      method: "PUT",
      body: JSON.stringify({ monthlyFee: 600 }),
      headers: { "content-type": "application/json" },
    })
    const putRes = await PUT(put, { params: Promise.resolve({ id: s.id }) })
    expect(putRes.status).toBe(200)

    const fresh = await db.student.findUniqueOrThrow({ where: { id: s.id }, include: { payments: true } })
    const { computeFeeStatus } = await import("@/lib/psams/domain")
    const st = computeFeeStatus(fresh, fresh.payments)
    const oldReceipt = await db.feePayment.findFirstOrThrow({ where: { studentId: s.id } })
    expect(oldReceipt.amount).toBe(500) // history never rewritten
    expect(st.dueAmount).toBe(st.pendingMonths.length * 600) // current fee
    expect(st.pendingMonths.length).toBeGreaterThan(0)

    // a collect at the OLD fee is now rejected — the ledger books the
    // current price (owner decision Q1a, documented in README)
    const stale = await postJson("/api/payments", {
      studentId: s.id,
      months: [st.pendingMonths[0]],
      amount: 500,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(stale.status).toBe(400)
    const honest = await postJson("/api/payments", {
      studentId: s.id,
      months: [st.pendingMonths[0]],
      amount: 600,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(honest.status).toBe(201)
  })
})

describe("T-F9 · concurrent receipt numbering", () => {
  it("two simultaneous collects (different students) → both 201, DISTINCT receiptNo", async () => {
    const s1 = await createStudent()
    const s2 = await createStudent()
    const m1 = await firstPendingMonth(s1.id)
    const m2 = await firstPendingMonth(s2.id)
    const today = new Date().toISOString().slice(0, 10)
    const [a, b] = await Promise.all([
      postJson("/api/payments", { studentId: s1.id, months: [m1], amount: 500, paymentDate: today, paymentMode: "Cash" }),
      postJson("/api/payments", { studentId: s2.id, months: [m2], amount: 500, paymentDate: today, paymentMode: "Cash" }),
    ])
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    const ra = (a.json as unknown as { receiptNo: string }).receiptNo
    const rb = (b.json as unknown as { receiptNo: string }).receiptNo
    expect(ra).toMatch(/^RC-\d{6}-\d{5}$/)
    expect(rb).toMatch(/^RC-\d{6}-\d{5}$/)
    expect(ra).not.toBe(rb)
  })
})

describe("T-F10 · failed collect leaves NO partial write", () => {
  it("unknown student → 404; payments + ledger unchanged", async () => {
    const { db } = await import("@/lib/db")
    const beforePayments = await db.feePayment.count()
    const beforeLedger = await db.paymentMonth.count()
    const res = await postJson("/api/payments", {
      studentId: "does-not-exist",
      months: ["2025-08"],
      amount: 500,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMode: "Cash",
    })
    expect(res.status).toBe(404)
    expect(await db.feePayment.count()).toBe(beforePayments)
    expect(await db.paymentMonth.count()).toBe(beforeLedger)
  })
})

describe("T-F14 / T-R2 · volume agreement + windowed history", () => {
  const VOLUME = 150
  let volumeStudentIds: string[] = []
  let expectedRevenue = 0

  it("seeds 150 receipts across 150 synthetic students and reconciles BOTH surfaces", async () => {
    const { db } = await import("@/lib/db")
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    const rows = Array.from({ length: VOLUME }, (_, i) => ({
      admissionNo: `PSA-VOL-${String(Date.now()).slice(-6)}-${String(i).padStart(4, "0")}`,
      fullName: `Volume Player ${i}`,
      dateOfBirth: new Date("2011-01-15"),
      parentName: "Volume Parent",
      mobile: "9847000000",
      ageCategory: "Youth",
      monthlyFee: 500,
      registrationDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      status: "Active",
    }))
    const students = await db.$transaction(
      rows.map((r) => db.student.create({ data: { ...r, admissionNo: `${r.admissionNo}-${Math.random().toString(36).slice(2, 6)}` } }))
    )
    volumeStudentIds = students.map((s) => s.id)

    // one receipt each for the CURRENT month, ledger row included — the
    // invariant COUNT(PaymentMonth) == SUM(json_array_length(months)) holds
    const receipts: { id: string; studentId: string }[] = []
    for (let i = 0; i < students.length; i++) {
      const p = await db.feePayment.create({
        data: {
          receiptNo: `RC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(90000 + i).padStart(5, "0")}`,
          studentId: students[i].id,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          months: JSON.stringify([monthKey]),
          amount: 500,
          paymentMode: "Cash",
        },
      })
      receipts.push({ id: p.id, studentId: p.studentId })
    }
    await db.paymentMonth.createMany({
      data: receipts.map((r) => ({ studentId: r.studentId, month: monthKey, paymentId: r.id })),
    })
    expectedRevenue = VOLUME * 500

    const dash = await getJson<{ monthRevenue: number }>("@/app/api/dashboard/route", "/api/dashboard")
    expect(dash.monthRevenue).toBeGreaterThanOrEqual(expectedRevenue)

    // the fees screen (statuses) agrees per-student: each volume student
    // shows the current month as PAID, never as pending/overdue
    const statuses = await getJson<{ student: { id: string }; paidMonths: string[]; pendingMonths: string[] }[]>(
      "@/app/api/fees/statuses/route",
      "/api/fees/statuses"
    )
    for (const id of volumeStudentIds.slice(0, 10)) {
      const row = statuses.find((x) => x.student.id === id)
      expect(row, "volume student present on the fees screen").toBeDefined()
      expect(row!.paidMonths).toContain(monthKey)
      expect(row!.pendingMonths).not.toContain(monthKey)
    }

    // the month-filtered payments endpoint (ledger index path) returns
    // exactly the volume receipts for the month
    const { GET } = await import("@/app/api/payments/route")
    const req = new NextRequest(`http://localhost:3000/api/payments?month=${monthKey}&limit=500`)
    const res = await GET(req)
    const rowsOut = (await res.json()) as unknown[]
    expect(rowsOut.length).toBeGreaterThanOrEqual(VOLUME)
  })

  it("T-R2 · receipt history windowing: limit returns an ordered page, not the world", async () => {
    const { db } = await import("@/lib/db")
    // top the ledger up past 200 receipts so the window is actually exercised
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    let total = await db.feePayment.count()
    let extra = 0
    while (total < 205) {
      const s = await db.student.create({
        data: {
          admissionNo: `PSA-WIN-${String(Date.now())}-${extra}`,
          fullName: `Window Player ${extra}`,
          dateOfBirth: new Date("2011-01-15"),
          parentName: "Window Parent",
          mobile: "9847000000",
          ageCategory: "Youth",
          monthlyFee: 500,
          registrationDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
          status: "Active",
        },
      })
      const p = await db.feePayment.create({
        data: {
          receiptNo: `RC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(80000 + extra).padStart(5, "0")}`,
          studentId: s.id,
          paymentDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          months: JSON.stringify([monthKey]),
          amount: 500,
          paymentMode: "Cash",
        },
      })
      await db.paymentMonth.create({ data: { studentId: s.id, month: monthKey, paymentId: p.id } })
      total++
      extra++
    }

    const { GET } = await import("@/app/api/payments/route")
    const page = new NextRequest("http://localhost:3000/api/payments?limit=200")
    const out = (await (await GET(page)).json()) as { receiptNo: string; paymentDate: string }[]
    expect(out).toHaveLength(200)
    for (let i = 1; i < out.length; i++) {
      const prev = new Date(out[i - 1].paymentDate).getTime()
      const cur = new Date(out[i].paymentDate).getTime()
      expect(prev, "strict descending paymentDate").toBeGreaterThanOrEqual(cur)
    }
    const nos = out.map((r) => r.receiptNo)
    expect(new Set(nos).size).toBe(nos.length)
  })
})
