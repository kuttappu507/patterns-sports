import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readFileSync } from "node:fs"
import { createClient, type Client } from "@libsql/client"
import { NextRequest } from "next/server"

// ===========================================================================
// v1.8.0 BMI integration battery — measurement history, migration backfill,
// API capture hooks and cross-surface consistency.
//
//   T-BMI-1  legacy v1.7 database upgrades: Measurement table created,
//            existing height/weight backfilled as dated rows, data intact,
//            re-run idempotent (migration-runner guarantees)
//   T-BMI-2  web API capture hooks: create/changed-save record dated
//            measurements; unrelated saves do NOT pollute history
//   T-BMI-3  profile read path returns the history; assessments use the
//            MEASUREMENT date (not today) for historical rows
//   T-BMI-4  every display/export surface derives from the same module
//            (report cell == assessment == presentation)
//   T-BMI-5  offline source contract: the BMI domain + bundled WHO data
//            contain no network code — the assessment cannot phone home
// ===========================================================================

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psams-bmi-int-"))
const dbFile = path.join(tmpDir, "bmi-int.db")
process.env.DATABASE_URL = `file:${dbFile}`

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* temp best-effort */
  }
})

function migrationAdapter(client: Client) {
  return {
    execute: async (sql: string) => {
      await client.execute(sql)
    },
    select: async <T>(sql: string): Promise<T[]> => {
      const r = await client.execute(sql)
      return r.rows as unknown as T[]
    },
  }
}

/** The v1.7-shaped Student table (has gender, NO Measurement table yet). */
const LEGACY_V17_DDL = `
CREATE TABLE IF NOT EXISTS Student (
  id TEXT PRIMARY KEY,
  admissionNo TEXT NOT NULL UNIQUE,
  registrationDate TEXT NOT NULL,
  fullName TEXT NOT NULL,
  dateOfBirth TEXT NOT NULL,
  parentName TEXT NOT NULL,
  mobile TEXT NOT NULL,
  emergencyContact TEXT,
  address TEXT,
  schoolName TEXT,
  classGrade TEXT,
  division TEXT,
  bloodGroup TEXT,
  gender TEXT NOT NULL DEFAULT '',
  heightCm REAL,
  weightKg REAL,
  standingReachCm REAL,
  spikeReachCm REAL,
  jumpReachCm REAL,
  primarySport TEXT NOT NULL DEFAULT 'Volleyball',
  playingPosition TEXT,
  ageCategory TEXT NOT NULL,
  trainingBatch TEXT,
  monthlyFee REAL NOT NULL DEFAULT 0,
  photoPath TEXT,
  birthCertPath TEXT,
  idCardPath TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
`

describe("T-BMI-1 · legacy database upgrade (Measurement + backfill)", () => {
  it("creates the table, backfills dated rows, preserves data, re-runs clean", async () => {
    const file = path.join(tmpDir, "legacy-bmi.db")
    const client = createClient({ url: `file:${file}` })
    await client.execute(LEGACY_V17_DDL)
    await client.execute(
      `INSERT INTO Student (id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile, gender, heightCm, weightKg, ageCategory, updatedAt)
       VALUES ('s1', 'ADM-1', '2024-05-01', 'Legacy Kid', '2012-06-10T00:00:00.000Z', 'Parent', '9999999999', 'Male', 148, 38, 'Sub-Junior', '2025-03-15T10:00:00.000Z')`
    )
    await client.execute(
      `INSERT INTO Student (id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile, gender, heightCm, weightKg, ageCategory, updatedAt)
       VALUES ('s2', 'ADM-2', '2024-05-01', 'No Measures', '2012-06-10T00:00:00.000Z', 'Parent', '9999999998', 'Female', NULL, NULL, 'Sub-Junior', '2025-03-15T10:00:00.000Z')`
    )

    const { applyMigrations } = await import("../src/lib/psams/migrations")
    const applied = await applyMigrations(migrationAdapter(client), "test")
    expect(applied).toContain("v1.8.0: Measurement history + backfill")

    // table exists, backfill row for s1 dated from updatedAt, none for s2
    const rows = await client.execute("SELECT studentId, date, heightCm, weightKg, source FROM Measurement ORDER BY studentId")
    expect(rows.rows.length).toBe(1)
    const back = rows.rows[0] as Record<string, unknown>
    expect(back.studentId).toBe("s1")
    expect(back.date).toBe("2025-03-15") // substr(updatedAt, 1, 10)
    expect(back.heightCm).toBe(148)
    expect(back.weightKg).toBe(38)
    expect(back.source).toBe("backfill")

    // original student rows untouched
    const students = await client.execute("SELECT heightCm, weightKg, fullName FROM Student WHERE id = 's1'")
    const s1 = students.rows[0] as Record<string, unknown>
    expect(s1.heightCm).toBe(148)
    expect(s1.fullName).toBe("Legacy Kid")

    // idempotent: re-run applies nothing new, no duplicate rows
    const again = await applyMigrations(migrationAdapter(client), "test")
    expect(again).toEqual([])
    const rows2 = await client.execute("SELECT COUNT(*) AS n FROM Measurement")
    expect(Number((rows2.rows[0] as Record<string, unknown>).n)).toBe(1)
    client.close()
  })
})

// ---- web API battery on the real routes ------------------------------------

async function studentsPOST(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/students/route")
  const req = new NextRequest("http://localhost:3000/api/students", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function studentsPUT(id: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const { PUT } = await import("@/app/api/students/[id]/route")
  const req = new NextRequest(`http://localhost:3000/api/students/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
  const res = await PUT(req, { params: Promise.resolve({ id }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function studentsGET(id: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/students/[id]/route")
  const res = await GET(new NextRequest(`http://localhost:3000/api/students/${id}`), {
    params: Promise.resolve({ id }),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function measurementCount(studentId: string): Promise<number> {
  const { db } = await import("@/lib/db")
  return db.measurement.count({ where: { studentId } })
}

const GOOD_STUDENT = {
  fullName: "BMI Integration Kid",
  dateOfBirth: "2012-06-10",
  parentName: "Parent Two",
  mobile: "9876543210",
  gender: "Female",
  ageCategory: "Sub-Junior",
  heightCm: 148,
  weightKg: 38,
  monthlyFee: 500,
}

describe("T-BMI-2 · API capture hooks", () => {
  it("boots the schema on the disposable database", async () => {
    const { bootstrapDatabase } = await import("@/lib/psams/bootstrap")
    await bootstrapDatabase()
  })

  it("create with height/weight records the first dated measurement", async () => {
    const { status, json } = await studentsPOST({ ...GOOD_STUDENT })
    expect(status).toBe(201)
    const id = json.id as string
    expect(await measurementCount(id)).toBe(1)
    const { db } = await import("@/lib/db")
    const row = await db.measurement.findFirst({ where: { studentId: id } })
    expect(row?.source).toBe("create")
    expect(row?.heightCm).toBe(148)
    expect(row?.weightKg).toBe(38)
    expect(row?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("a save that CHANGES weight updates the day's row (upsert, no duplicates)", async () => {
    const { json } = await studentsPOST({ ...GOOD_STUDENT, fullName: "Upsert Kid", mobile: "9876543211" })
    const id = json.id as string
    const put = await studentsPUT(id, { weightKg: 40.5 })
    expect(put.status).toBe(200)
    expect(await measurementCount(id)).toBe(1) // same-day upsert
    const { db } = await import("@/lib/db")
    const row = await db.measurement.findFirst({ where: { studentId: id } })
    expect(row?.weightKg).toBe(40.5)
    expect(row?.source).toBe("edit")
  })

  it("a save that does NOT touch height/weight leaves the history alone", async () => {
    const { json } = await studentsPOST({ ...GOOD_STUDENT, fullName: "Unrelated Edit Kid", mobile: "9876543212" })
    const id = json.id as string
    const before = await measurementCount(id)
    const put = await studentsPUT(id, { mobile: "9876543299", address: "Kochi" })
    expect(put.status).toBe(200)
    expect(await measurementCount(id)).toBe(before)
  })

  it("rejects impossible measurements via the shared validation instead of storing them", async () => {
    const { json } = await studentsPOST({ ...GOOD_STUDENT, fullName: "Guard Kid", mobile: "9876543213" })
    const id = json.id as string
    const put = await studentsPUT(id, { weightKg: -5 })
    expect(put.status).toBe(400)
  })
})

describe("T-BMI-3 · history read path & measurement-date assessment", () => {
  it("GET /api/students/:id returns the measurement history", async () => {
    const { json } = await studentsPOST({ ...GOOD_STUDENT, fullName: "History Kid", mobile: "9876543214" })
    const id = json.id as string
    const got = await studentsGET(id)
    expect(got.status).toBe(200)
    const measurements = got.json.measurements as Array<Record<string, unknown>>
    expect(Array.isArray(measurements)).toBe(true)
    expect(measurements.length).toBeGreaterThanOrEqual(1)
    expect(measurements[0].heightCm).toBe(148)
  })

  it("historical rows are assessed at THEIR date, not today", async () => {
    const { db } = await import("@/lib/db")
    const { json } = await studentsPOST({ ...GOOD_STUDENT, fullName: "Dated Kid", mobile: "9876543215" })
    const id = json.id as string
    // simulate a measurement taken ~2 years ago (child was younger)
    await db.measurement.create({
      data: { studentId: id, date: "2024-06-15", heightCm: 138, weightKg: 30, source: "edit" },
    })
    const { assessStudentBmi } = await import("../src/lib/psams/bmi")
    const student = { dateOfBirth: "2012-06-10", gender: "Female", heightCm: 138, weightKg: 30 }
    const a = assessStudentBmi(student, "2024-06-15")
    expect(a.ok).toBe(true)
    if (a.ok) {
      expect(a.method).toBe("who-5-19")
      expect(a.ageLabel).toBe("12 y") // age AT the measurement date
      expect(a.zScore).not.toBeNull()
    }
    // today the same child is older — a different assessment date changes the age
    const b = assessStudentBmi(student, new Date())
    expect(b.ok).toBe(true)
    if (b.ok && a.ok) expect(b.ageMonths).toBeGreaterThan(a.ageMonths)
  })
})

describe("T-BMI-4 · cross-surface consistency", () => {
  it("report cell (table/exports/prints) equals the assessment + presentation", async () => {
    const { bmiReportFields, assessStudentBmi, presentBmi } = await import("../src/lib/psams/bmi")
    for (const s of [
      { dateOfBirth: "2012-06-10", gender: "Female", heightCm: 148, weightKg: 38 }, // junior
      { dateOfBirth: "2000-01-01", gender: "Male", heightCm: 180, weightKg: 80 }, // adult
      { dateOfBirth: "2013-09-02", gender: "Other", heightCm: 155, weightKg: 41 }, // unclassified
    ]) {
      const fields = bmiReportFields(s)
      const view = presentBmi(assessStudentBmi(s, new Date()))
      expect(fields.value).toBe(view.value)
      if (fields.classification === "—") {
        expect(view.label).not.toMatch(/^(Thinness|Overweight|Obesity|Severe)/)
      } else {
        expect(fields.classification).toBe(view.label)
      }
    }
  })

  it("desktop write path mirrors the web capture rule (source contract)", async () => {
    // tauri-api.ts cannot execute in the sandbox (Tauri shell), but the SAME
    // change-detection rule must exist there — asserted at source level.
    const src = readFileSync(path.join(__dirname, "..", "src", "lib", "psams", "tauri-api.ts"), "utf8")
    expect(src).toContain('"heightCm" in overlay && overlay.heightCm !== current.heightCm')
    expect(src).toContain('"weightKg" in overlay && overlay.weightKg !== current.weightKg')
    expect(src).toContain("upsertMeasurement")
  })
})

describe("T-BMI-5 · offline source contract", () => {
  it("BMI domain + WHO data are pure, bundled modules — no network code", () => {
    const root = path.join(__dirname, "..", "src", "lib", "psams")
    for (const file of ["bmi.ts", "who2007-bmi-data.ts"]) {
      const src = readFileSync(path.join(root, file), "utf8")
      // actual network APIs — comments mentioning URLs are documentation
      for (const banned of ["fetch(", "XMLHttpRequest", "WebSocket", "axios", "new URL("]) {
        expect(src.includes(banned), `${file} must not contain ${banned}`).toBe(false)
      }
    }
    // the data module is self-contained (no imports at all)
    const data = readFileSync(path.join(root, "who2007-bmi-data.ts"), "utf8")
    expect(data).not.toMatch(/^import /m)
    // and carries the provenance metadata
    expect(data).toContain("WHO 2007")
    expect(data).toContain("cdn.who.int")
  })
})
