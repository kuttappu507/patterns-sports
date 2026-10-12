import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { NextRequest } from "next/server"

// ===========================================================================
// Phase 4 · §2 Students & attendance battery (TEST_MATRIX T-S1…T-S10) plus
// the demo safety pair (§5 T-R11) — REAL web routes on a DISPOSABLE SQLite
// file. Windows/desktop runtime proofs stay in the matrix as 🪟.
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-phase4-stu-"))
const dbFile = path.join(tmpDir, "phase4-stu.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

async function studentsPOST(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/students/route")
  const req = new NextRequest("http://localhost:3000/api/students", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function studentsPUT(id: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const { PUT } = await import("@/app/api/students/[id]/route")
  const req = new NextRequest(`http://localhost:3000/api/students/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await PUT(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

const VALID_BASE = {
  fullName: "Battery Player",
  dateOfBirth: "2012-05-01",
  parentName: "Battery Parent",
  mobile: "9847000000",
  ageCategory: "Junior",
  monthlyFee: 500,
}

let seq = 0
async function createStudent(overrides: Record<string, unknown> = {}): Promise<{ id: string } & Record<string, unknown>> {
  seq++
  const res = await studentsPOST({
    ...VALID_BASE,
    fullName: `${VALID_BASE.fullName} ${Date.now()}-${seq}`,
    ...overrides,
  })
  expect(res.status, "fixture student creation").toBe(201)
  return res.json as { id: string } & Record<string, unknown>
}

describe("T-S1 · create-path rejects (web)", () => {
  it("boots the schema on the disposable database", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
  })

  it("missing / blank / whitespace required fields → 400", async () => {
    for (const [field, value] of [
      ["fullName", undefined],
      ["fullName", ""],
      ["fullName", "   "],
      ["parentName", ""],
      ["mobile", undefined],
      ["ageCategory", ""],
    ] as const) {
      const body: Record<string, unknown> = { ...VALID_BASE, fullName: `${Date.now()}` }
      if (value === undefined) delete body[field]
      else body[field] = value
      const res = await studentsPOST(body)
      expect(res.status, `${field}=${JSON.stringify(value)}`).toBe(400)
      expect(String(res.json.error)).toMatch(new RegExp(field === "ageCategory" ? "field" : field, "i"))
    }
  })

  it("future DOB → 400; garbage mobile → 400; negative fee → 400", async () => {
    const future = await studentsPOST({ ...VALID_BASE, dateOfBirth: "2030-01-01" })
    expect(future.status).toBe(400)
    expect(String(future.json.error)).toMatch(/future/i)

    const badMobile = await studentsPOST({ ...VALID_BASE, mobile: "hello" })
    expect(badMobile.status).toBe(400)
    expect(String(badMobile.json.error)).toMatch(/mobile/i)

    const negFee = await studentsPOST({ ...VALID_BASE, monthlyFee: -5 })
    expect(negFee.status).toBe(400)
    expect(String(negFee.json.error)).toMatch(/fee/i)
  })
})

describe("T-S2 · update-path merged-record validation (PS-017)", () => {
  it("{mobile:'hello'} / {monthlyFee:-5} / future DOB / blank name → 400, row untouched", async () => {
    const { db } = await import("@/lib/db")
    const s = await createStudent()
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ mobile: "hello" }, /mobile/i],
      [{ monthlyFee: -5 }, /fee/i],
      [{ dateOfBirth: "2030-01-01" }, /future/i],
      [{ fullName: "" }, /fullName/i],
    ]
    for (const [patch, pattern] of cases) {
      const res = await studentsPUT(s.id, patch)
      expect(res.status, `patch=${JSON.stringify(patch)}`).toBe(400)
      expect(String(res.json.error)).toMatch(pattern)
    }
    const after = await db.student.findUniqueOrThrow({ where: { id: s.id } })
    expect(after.mobile).toBe("9847000000")
    expect(after.monthlyFee).toBe(500)
    expect(after.fullName).not.toBe("")
  })

  it("unknown id → 404 (never a 500)", async () => {
    const res = await studentsPUT("no-such-student", { fullName: "Ghost" })
    expect(res.status).toBe(404)
  })
})

describe("T-S3 · registration date bounds (PS-025)", () => {
  it("future registrationDate → 400", async () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const res = await studentsPOST({ ...VALID_BASE, registrationDate: future })
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/future/i)
  })

  it("registrationDate < DOB → 400", async () => {
    const res = await studentsPOST({ ...VALID_BASE, dateOfBirth: "2012-05-01", registrationDate: "2012-04-01" })
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/before the date of birth/i)
  })
})

describe("T-S4 · admission number integrity (PS-050)", () => {
  it("client-supplied duplicate admissionNo → 409", async () => {
    const dup = `PSA-DUP-${Date.now()}`
    const first = await studentsPOST({ ...VALID_BASE, admissionNo: dup })
    expect(first.status).toBe(201)
    const second = await studentsPOST({ ...VALID_BASE, admissionNo: dup })
    expect(second.status).toBe(409)
  })

  it("auto-generated admission numbers never collide across creates", async () => {
    const a = await createStudent()
    const b = await createStudent()
    expect(a.admissionNo).toMatch(/^PSA-\d{4}-\d{4,}$/)
    expect(b.admissionNo).toMatch(/^PSA-\d{4}-\d{4,}$/)
    expect(a.admissionNo).not.toBe(b.admissionNo)
  })
})

describe("T-S6 · patch semantics — edit preserves unrelated fields", () => {
  it("one-field patch leaves every other column byte-identical", async () => {
    const s = await createStudent({
      address: "12 Volley Lane",
      schoolName: "Greenfield Public School",
      bloodGroup: "B+",
      heightCm: 165,
    })
    const res = await studentsPUT(s.id, { playingPosition: "Setter" })
    expect(res.status).toBe(200)
    const after = res.json as Record<string, unknown>
    expect(after.playingPosition).toBe("Setter")
    expect(after.address).toBe("12 Volley Lane")
    expect(after.schoolName).toBe("Greenfield Public School")
    expect(after.bloodGroup).toBe("B+")
    expect(after.heightCm).toBe(165)
    expect(after.mobile).toBe("9847000000")
    expect(after.monthlyFee).toBe(500)
  })
})

describe("T-S7 · attendance validation (PS-026)", () => {
  async function attendancePOST(records: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const { POST } = await import("@/app/api/attendance/route")
    const req = new NextRequest("http://localhost:3000/api/attendance", {
      method: "POST",
      body: JSON.stringify({ records }),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req)
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
  }

  it("calendar-impossible 2025-02-31 → 400, nothing saved", async () => {
    const { db } = await import("@/lib/db")
    const s = await createStudent()
    const before = await db.attendance.count()
    const res = await attendancePOST([{ studentId: s.id, date: "2025-02-31", batch: "Morning", status: "Present" }])
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/real calendar date/i)
    expect(await db.attendance.count()).toBe(before)
  })

  it("future date → 400", async () => {
    const s = await createStudent()
    const res = await attendancePOST([{ studentId: s.id, date: "2999-01-01", batch: "Morning", status: "Present" }])
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/future/i)
  })

  it("bad status / hostile batch → 400", async () => {
    const s = await createStudent()
    const badStatus = await attendancePOST([{ studentId: s.id, date: "2025-06-10", batch: "Morning", status: "Late" }])
    expect(badStatus.status).toBe(400)
    const badBatch = await attendancePOST([{ studentId: s.id, date: "2025-06-10", batch: "A\r\nB", status: "Present" }])
    expect(badBatch.status).toBe(400)
  })

  it("duplicate (studentId,date) within a batch → UPSERT per policy (last wins, single row)", async () => {
    const { db } = await import("@/lib/db")
    const s = await createStudent()
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const res = await attendancePOST([
      { studentId: s.id, date, batch: "Morning", status: "Absent" },
      { studentId: s.id, date, batch: "Morning", status: "Present" },
    ])
    expect(res.status).toBe(200)
    const rows = await db.attendance.findMany({ where: { studentId: s.id, date } })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("Present")
  })
})

describe("T-S8 · attendance stats exclude Inactive students (PS-026)", () => {
  it("dashboard attendanceToday counts ACTIVE marks only", async () => {
    const { db } = await import("@/lib/db")
    const { POST } = await import("@/app/api/attendance/route")
    const { GET } = await import("@/app/api/dashboard/route")

    const active = await createStudent()
    const inactive = await createStudent({ status: "Inactive" })
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
    // T-S1's bootstrapDatabase() auto-seeds the demo academy on the disposable
    // database, and planDemoAttendance() writes marks for the last 3 non-Sunday
    // days — INCLUDING today whenever the suite runs Monday-Saturday (CI's
    // green runs happened to fall on a Sunday, which hid this for a week).
    // This test owns the day's register: clear the date before marking.
    await db.attendance.deleteMany({ where: { date } })
    const req = new NextRequest("http://localhost:3000/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        records: [
          { studentId: active.id, date, batch: "Morning", status: "Present" },
          { studentId: inactive.id, date, batch: "Morning", status: "Present" },
        ],
      }),
      headers: { "content-type": "application/json" },
    })
    expect((await POST(req)).status).toBe(200)

    const dash = (await (await GET()).json()) as {
      attendanceToday: { present: number; marked: number }
    }
    // both rows exist in the register…
    const rawRows = await db.attendance.findMany({ where: { date } })
    expect(rawRows.length).toBeGreaterThanOrEqual(2)
    // …but the ratio counts only the ACTIVE one
    expect(dash.attendanceToday.marked).toBe(rawRows.filter((r) => r.studentId === active.id).length)
    expect(dash.attendanceToday.present).toBe(
      rawRows.filter((r) => r.studentId === active.id && r.status === "Present").length
    )
  })
})

describe("T-S10 · phoneDigits edge set (PS-033)", () => {
  it("0919… / +91 … / 0091… / paste-with-spaces collapse per the prefix-loop policy", async () => {
    const { phoneDigits } = await import("@/lib/psams/domain")
    // PS-033: the LOOP strips every 0/91 prefix. An ambiguous paste like
    // 091987654321 has only 9 real digits left after both prefixes — it
    // becomes an INVALID 9-digit remnant (rejected by MOBILE_DIGITS_RE),
    // never the old single-pass bug of silently shipping a wrong-but-valid
    // number ("9198765432").
    expect(phoneDigits("091987654321")).toBe("987654321")
    expect(phoneDigits("+91 98765 43210")).toBe("9876543210")
    expect(phoneDigits("0091987654321")).toBe("987654321")
    expect(phoneDigits("9876543210")).toBe("9876543210") // genuine 10-digit untouched
    expect(phoneDigits("+91-98765-43210")).toBe("9876543210")
    expect(phoneDigits("09876543210")).toBe("9876543210")
    expect(phoneDigits("abc")).toBe("")
  })
})

describe("T-R11 · demo load is transactional and idempotent (PS-021)", () => {
  it("concurrent loads → exactly one 201 + one 409; DELETE removes everything", async () => {
    const { POST, DELETE } = await import("@/app/api/demo/route")
    // boot may have auto-seeded the demo academy — clear any prior dataset so
    // this test owns the load cycle
    const pre = await DELETE()
    expect([200, 404]).toContain(pre.status)

    const [a, b] = await Promise.all([POST(), POST()])
    const codes = [a.status, b.status].sort()
    expect(codes).toEqual([201, 409])

    const { db } = await import("@/lib/db")
    const flag = await db.setting.findUnique({ where: { key: "demoRecordIds" } })
    expect(flag?.value).toBeTruthy()
    const { students: ids, committee } = JSON.parse(flag!.value) as { students: string[]; committee: string[] }
    expect(ids.length).toBeGreaterThan(0)
    const demoStudents = await db.student.count({ where: { id: { in: ids } } })
    expect(demoStudents).toBe(ids.length)

    const del = await DELETE()
    expect(del.status).toBe(200)
    expect(await db.student.count({ where: { id: { in: ids } } })).toBe(0)
    expect(await db.committeeMember.count({ where: { id: { in: committee } } })).toBe(0)
    expect(await db.setting.findUnique({ where: { key: "demoRecordIds" } })).toBeNull()
  })
})
