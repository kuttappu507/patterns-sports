"use client"

// ============================================================
// PS-AMS :: Offline desktop backend (Tauri SQL + FS plugins)
// Mirrors the Next.js API routes 1:1 so the packaged Windows exe
// runs with zero HTTP server. Same signatures as api.ts.
// ============================================================

import Database from "@tauri-apps/plugin-sql"
import { writeFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { appDataDir, join } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import type {
  Achievement,
  AttendanceRecord,
  CommitteeMember,
  DashboardStats,
  FeePayment,
  FeePaymentWithStudent,
  Student,
  StudentFeeStatus,
  StudentWithRelations,
  AcademySettings,
} from "./types"
import {
  computeAge,
  computeFeeStatus,
  parsePaidMonths,
  sanitizeFileName,
  todayKey,
  nextAdmissionNo,
  nextReceiptNo,
} from "./domain"
import {
  DEMO_STUDENTS,
  DEMO_COMMITTEE,
  DEMO_SETTINGS,
  DEMO_ACHIEVEMENTS,
  demoDob,
  demoRegistrationDate,
  planDemoPayments,
  planDemoAttendance,
} from "./demo-data"

type DB = Database

let _db: DB | null = null
let _mediaBase: string | null = null

/** Open (once) the SQLite database and guarantee the schema exists. */
export async function getDb(): Promise<DB> {
  if (!_db) {
    // Resolve the authoritative absolute DB path from the Rust data layout:
    //  - installed: %APPDATA%/<identifier>/ps-ams.db (identical to the
    //    plugin's app-config-dir default, so existing installs keep data)
    //  - portable:  <exe dir>/PS-AMS-Data/ps-ams.db — keeps the DB beside
    //    the media tree so the exit-backup routine mirrors the real file.
    // The plugin's path_mapper honors absolute paths (PathBuf::push replaces
    // the base); the relative string stays the fallback for older builds.
    let conn = "sqlite:ps-ams.db"
    try {
      const paths = await invoke<{ database: string }>("data_paths")
      if (paths?.database) conn = `sqlite:${paths.database}`
    } catch {
      /* data_paths unavailable — plugin default location applies */
    }
    _db = await Database.load(conn)
    try {
      await _db.execute("PRAGMA foreign_keys = ON")
    } catch {
      /* older sqlite builds may reject pragma through sqlx — cascades handled manually */
    }
    await ensureSchema(_db)
  }
  return _db
}

async function ensureSchema(db: DB): Promise<void> {
  try {
    // Schema DDL is embedded in the Rust binary (include_str!) and served
    // by the `schema_sql` command — no runtime resource files needed, so
    // the portable exe works with zero sidecar assets.
    const sql = await invoke<string>("schema_sql")
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"))
    for (const stmt of statements) {
      try {
        await db.execute(stmt)
      } catch {
        /* statement already applied */
      }
    }
  } catch {
    /* schema command unavailable — assume the shell bootstrapped it */
  }
}

/** Boot the offline backend: DB + media directories. Called once at app start. */
export async function initBackend(): Promise<void> {
  await getDb()
  // Media root comes from the Rust data layout so portable builds
  // (portable.flag) get their media tree next to the exe.
  try {
    const paths = await invoke<{ app_data: string; database: string; media: string; backup: string }>("data_paths")
    _mediaBase = paths.media
  } catch {
    _mediaBase = await join(await appDataDir(), "media")
  }
  for (const sub of ["photos", "documents", "certificates"]) {
    try {
      await mkdir(await join(_mediaBase, sub), { recursive: true })
    } catch {
      /* already exists */
    }
  }
}

export function getMediaBase(): string | null {
  return _mediaBase
}

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Students ----------

export interface StudentFilters {
  q?: string
  category?: string
  status?: string
  school?: string
  position?: string
  batch?: string
  minAge?: number
  maxAge?: number
  minHeight?: number
}

export async function fetchStudents(filters: StudentFilters = {}): Promise<Student[]> {
  const db = await getDb()
  const where: string[] = []
  const params: unknown[] = []
  const q = filters.q?.trim()
  if (q) {
    params.push(`%${q}%`)
    const p = params.length
    where.push(`(fullName LIKE $${p} OR admissionNo LIKE $${p} OR mobile LIKE $${p} OR parentName LIKE $${p})`)
  }
  if (filters.category) {
    params.push(filters.category)
    where.push(`ageCategory = $${params.length}`)
  }
  if (filters.status) {
    params.push(filters.status)
    where.push(`status = $${params.length}`)
  }
  if (filters.school) {
    params.push(filters.school)
    where.push(`schoolName = $${params.length}`)
  }
  if (filters.position) {
    params.push(filters.position)
    where.push(`playingPosition = $${params.length}`)
  }
  if (filters.batch) {
    params.push(filters.batch)
    where.push(`trainingBatch = $${params.length}`)
  }
  if (filters.minHeight) {
    params.push(filters.minHeight)
    where.push(`heightCm >= $${params.length}`)
  }
  const rows = await db.select<Student[]>(
    `SELECT * FROM Student ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY fullName ASC`,
    params
  )
  return rows.filter((s) => {
    if (filters.minAge !== undefined || filters.maxAge !== undefined) {
      const age = computeAge(s.dateOfBirth)
      if (filters.minAge !== undefined && age < filters.minAge) return false
      if (filters.maxAge !== undefined && age > filters.maxAge) return false
    }
    return true
  })
}

async function getStudentRow(id: string): Promise<Student> {
  const db = await getDb()
  const rows = await db.select<Student[]>("SELECT * FROM Student WHERE id = $1", [id])
  if (!rows.length) throw new Error("Student not found")
  return rows[0]
}

export async function fetchStudent(id: string): Promise<StudentWithRelations> {
  const db = await getDb()
  const student = await getStudentRow(id)
  const achievements = await db.select<Achievement[]>(
    "SELECT * FROM Achievement WHERE studentId = $1 ORDER BY eventDate DESC, createdAt DESC",
    [id]
  )
  const payments = await db.select<FeePayment[]>(
    "SELECT * FROM FeePayment WHERE studentId = $1 ORDER BY paymentDate DESC",
    [id]
  )
  return { ...student, achievements, payments }
}

export type StudentInput = Partial<Omit<Student, "id" | "createdAt" | "updatedAt">> & {
  fullName: string
  dateOfBirth: string
  parentName: string
  mobile: string
  ageCategory: string
}

export async function createStudent(input: Partial<StudentInput>): Promise<Student> {
  const db = await getDb()
  for (const k of ["fullName", "dateOfBirth", "parentName", "mobile", "ageCategory"]) {
    if (!(input as Record<string, unknown>)[k]) throw new Error(`Missing required field: ${k}`)
  }
  const existing = await db.select<{ admissionNo: string }[]>("SELECT admissionNo FROM Student", [])
  const year = new Date().getFullYear()
  const admissionNo =
    (input as Partial<Student>).admissionNo ||
    nextAdmissionNo(existing.map((r) => r.admissionNo), year)
  const id = uuid()
  const nowIso = new Date().toISOString()
  await db.execute(
    `INSERT INTO Student (
      id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile,
      emergencyContact, address, schoolName, classGrade, division, bloodGroup,
      heightCm, weightKg, standingReachCm, spikeReachCm, jumpReachCm,
      primarySport, playingPosition, ageCategory, trainingBatch, monthlyFee,
      photoPath, birthCertPath, idCardPath, status, createdAt, updatedAt
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [
      id,
      admissionNo,
      input.registrationDate ? new Date(input.registrationDate).toISOString() : nowIso,
      String(input.fullName).trim(),
      new Date(input.dateOfBirth!).toISOString(),
      String(input.parentName).trim(),
      String(input.mobile).trim(),
      input.emergencyContact || null,
      input.address || null,
      input.schoolName || null,
      input.classGrade || null,
      input.division || null,
      input.bloodGroup || null,
      input.heightCm ?? null,
      input.weightKg ?? null,
      input.standingReachCm ?? null,
      input.spikeReachCm ?? null,
      input.jumpReachCm ?? null,
      input.primarySport || "Volleyball",
      input.playingPosition || null,
      input.ageCategory,
      input.trainingBatch || null,
      Number(input.monthlyFee ?? 0),
      input.photoPath || null,
      input.birthCertPath || null,
      input.idCardPath || null,
      input.status || "Active",
      nowIso,
      nowIso,
    ]
  )
  return getStudentRow(id)
}

export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<Student> {
  const db = await getDb()
  const sets: string[] = []
  const params: unknown[] = []
  const body = input as Record<string, unknown>
  const strFields = [
    "fullName", "parentName", "mobile", "emergencyContact", "address", "schoolName",
    "classGrade", "division", "bloodGroup", "primarySport", "playingPosition",
    "ageCategory", "trainingBatch", "photoPath", "birthCertPath", "idCardPath", "status",
  ]
  for (const f of strFields) {
    if (f in body) {
      params.push(body[f] === "" ? null : body[f])
      sets.push(`${f} = $${params.length}`)
    }
  }
  if ("dateOfBirth" in body) {
    params.push(new Date(String(body.dateOfBirth)).toISOString())
    sets.push(`dateOfBirth = $${params.length}`)
  }
  if ("registrationDate" in body && body.registrationDate) {
    params.push(new Date(String(body.registrationDate)).toISOString())
    sets.push(`registrationDate = $${params.length}`)
  }
  if ("monthlyFee" in body) {
    params.push(Number(body.monthlyFee ?? 0))
    sets.push(`monthlyFee = $${params.length}`)
  }
  for (const f of ["heightCm", "weightKg", "standingReachCm", "spikeReachCm", "jumpReachCm"]) {
    if (f in body) {
      params.push(body[f] === null || body[f] === "" ? null : Number(body[f]))
      sets.push(`${f} = $${params.length}`)
    }
  }
  params.push(new Date().toISOString())
  sets.push(`updatedAt = $${params.length}`)
  params.push(id)
  await db.execute(`UPDATE Student SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
  return getStudentRow(id)
}

export async function deleteStudent(id: string): Promise<void> {
  const db = await getDb()
  // explicit cascade (foreign_keys pragma is per-connection in sqlite)
  await db.execute("DELETE FROM Achievement WHERE studentId = $1", [id])
  await db.execute("DELETE FROM FeePayment WHERE studentId = $1", [id])
  await db.execute("DELETE FROM Attendance WHERE studentId = $1", [id])
  await db.execute("DELETE FROM Student WHERE id = $1", [id])
}

// ---------- Achievements ----------

export async function fetchAchievements(studentId: string): Promise<Achievement[]> {
  const db = await getDb()
  return db.select<Achievement[]>(
    "SELECT * FROM Achievement WHERE studentId = $1 ORDER BY eventDate DESC, createdAt DESC",
    [studentId]
  )
}

export async function createAchievement(
  studentId: string,
  input: Partial<Achievement> & { tournamentName: string }
): Promise<Achievement> {
  const db = await getDb()
  if (!input.tournamentName) throw new Error("Tournament name is required")
  const id = uuid()
  const nowIso = new Date().toISOString()
  await db.execute(
    `INSERT INTO Achievement (id, studentId, tournamentName, eventDate, level, medal, notes, certificatePath, createdAt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      studentId,
      String(input.tournamentName).trim(),
      input.eventDate ? new Date(input.eventDate).toISOString() : null,
      input.level || "School",
      input.medal || "None",
      input.notes || null,
      input.certificatePath || null,
      nowIso,
    ]
  )
  const rows = await db.select<Achievement[]>("SELECT * FROM Achievement WHERE id = $1", [id])
  return rows[0]
}

export async function deleteAchievement(id: string): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM Achievement WHERE id = $1", [id])
}

// ---------- Fees ----------

export async function fetchFeeStatuses(): Promise<StudentFeeStatus[]> {
  const db = await getDb()
  const students = await db.select<Student[]>(
    "SELECT * FROM Student WHERE status = 'Active' ORDER BY fullName ASC",
    []
  )
  const payments = await db.select<FeePayment[]>("SELECT * FROM FeePayment ORDER BY paymentDate ASC", [])
  const byStudent = new Map<string, FeePayment[]>()
  for (const p of payments) {
    const list = byStudent.get(p.studentId) ?? []
    list.push(p)
    byStudent.set(p.studentId, list)
  }
  return students.map((s) => {
    const pays = byStudent.get(s.id) ?? []
    const status = computeFeeStatus(s, pays)
    return {
      student: s,
      paidMonths: status.paidMonths,
      pendingMonths: status.pendingMonths,
      overdueMonths: status.overdueMonths,
      dueAmount: status.dueAmount,
      isDefaulter: status.isDefaulter,
      lastPayment: pays.length ? pays[pays.length - 1] : null,
    }
  })
}

export async function collectPayment(input: {
  studentId: string
  months: string[]
  amount: number
  paymentMode: string
  paymentDate?: string
  notes?: string
  collectedBy?: string
}): Promise<FeePaymentWithStudent> {
  const db = await getDb()
  if (!input.studentId || !Array.isArray(input.months) || input.months.length === 0) {
    throw new Error("studentId and at least one billing month are required")
  }
  if (!input.amount || Number(input.amount) <= 0) {
    throw new Error("Collected amount must be greater than zero")
  }
  const existing = await db.select<{ receiptNo: string }[]>("SELECT receiptNo FROM FeePayment", [])
  const now = new Date()
  const receiptNo = nextReceiptNo(existing.map((r) => r.receiptNo), now)
  const id = uuid()
  const paymentDate = (input.paymentDate ? new Date(input.paymentDate) : now).toISOString()
  const monthsJson = JSON.stringify(input.months)
  await db.execute(
    `INSERT INTO FeePayment (id, receiptNo, studentId, paymentDate, months, amount, paymentMode, notes, collectedBy, createdAt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      receiptNo,
      input.studentId,
      paymentDate,
      monthsJson,
      Number(input.amount),
      input.paymentMode || "Cash",
      input.notes || null,
      input.collectedBy || null,
      now.toISOString(),
    ]
  )
  const student = await getStudentRow(input.studentId)
  return {
    id,
    receiptNo,
    studentId: input.studentId,
    paymentDate,
    months: monthsJson,
    amount: Number(input.amount),
    paymentMode: input.paymentMode || "Cash",
    notes: input.notes || null,
    collectedBy: input.collectedBy || null,
    createdAt: now.toISOString(),
    studentName: student.fullName,
    admissionNo: student.admissionNo,
  }
}

export async function fetchPayments(
  params: { studentId?: string; month?: string; limit?: number } = {}
): Promise<FeePaymentWithStudent[]> {
  const db = await getDb()
  let rows = await db.select<FeePaymentWithStudent[]>(
    `SELECT p.*, s.fullName AS studentName, s.admissionNo
     FROM FeePayment p JOIN Student s ON s.id = p.studentId
     ORDER BY p.paymentDate DESC`,
    []
  )
  if (params.studentId) rows = rows.filter((p) => p.studentId === params.studentId)
  if (params.month) rows = rows.filter((p) => parsePaidMonths(p.months).includes(params.month!))
  if (params.limit) rows = rows.slice(0, params.limit)
  return rows
}

export async function fetchDefaulters(): Promise<StudentFeeStatus[]> {
  const statuses = await fetchFeeStatuses()
  return statuses
    .filter((st) => st.isDefaulter)
    .sort((a, b) => b.overdueMonths.length - a.overdueMonths.length || b.dueAmount - a.dueAmount)
}

// ---------- Dashboard ----------

export async function fetchDashboard(): Promise<DashboardStats> {
  const db = await getDb()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const students = await db.select<Student[]>("SELECT * FROM Student", [])
  const committee = await db.select<CommitteeMember[]>(
    "SELECT * FROM CommitteeMember ORDER BY displayOrder ASC",
    []
  )
  const attendanceToday = await db.select<AttendanceRecord[]>(
    "SELECT * FROM Attendance WHERE date = $1",
    [todayKey(now)]
  )

  const monthPayments = await fetchPayments()
  const monthPaymentsFiltered = monthPayments.filter((p) => new Date(p.paymentDate) >= monthStart)

  const allPayments = await db.select<FeePayment[]>("SELECT * FROM FeePayment ORDER BY paymentDate ASC", [])
  const byStudent = new Map<string, FeePayment[]>()
  for (const p of allPayments) {
    const list = byStudent.get(p.studentId) ?? []
    list.push(p)
    byStudent.set(p.studentId, list)
  }

  const active = students.filter((s) => s.status === "Active")
  const categories = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]
  const categoryBreakdown = categories.map((category) => ({
    category,
    count: active.filter((s) => s.ageCategory === category).length,
  }))

  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  let paidCount = 0
  let defaulterCount = 0
  let dueSoonCount = 0
  for (const s of active) {
    const st = computeFeeStatus(s, byStudent.get(s.id) ?? [], now)
    if (st.paidMonths.includes(currentKey)) paidCount++
    else if (st.overdueMonths.length > 1) defaulterCount++
    else dueSoonCount++
  }

  const monthRevenue = monthPaymentsFiltered.reduce((sum, p) => sum + p.amount, 0)
  const todayRevenue = monthPaymentsFiltered
    .filter((p) => new Date(p.paymentDate) >= dayStart)
    .reduce((sum, p) => sum + p.amount, 0)

  const present = attendanceToday.filter((a) => a.status === "Present").length
  const absent = attendanceToday.filter((a) => a.status === "Absent").length

  const recentPayments = monthPaymentsFiltered.slice(0, 6)

  const upcomingBirthdays = active
    .map((s) => {
      const dob = new Date(s.dateOfBirth)
      const thisYear = now.getFullYear()
      let next = new Date(thisYear, dob.getMonth(), dob.getDate())
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(thisYear + 1, dob.getMonth(), dob.getDate())
      }
      const daysAway = Math.round(
        (next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000
      )
      return { id: s.id, fullName: s.fullName, dateOfBirth: s.dateOfBirth, photoPath: s.photoPath, daysAway, age: computeAge(s.dateOfBirth, next) }
    })
    .filter((b) => b.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5)

  return {
    totalActive: active.length,
    categoryBreakdown,
    feeCycle: {
      paidCount,
      defaulterCount,
      dueSoonCount,
      collectionRate: active.length ? Math.round((paidCount / active.length) * 100) : 0,
    },
    monthRevenue,
    todayRevenue,
    attendanceToday: { present, absent, marked: attendanceToday.length, totalActive: active.length },
    recentPayments,
    upcomingBirthdays,
    committee,
  }
}

// ---------- Committee ----------

export async function fetchCommittee(): Promise<CommitteeMember[]> {
  const db = await getDb()
  return db.select<CommitteeMember[]>("SELECT * FROM CommitteeMember ORDER BY displayOrder ASC", [])
}

export async function saveCommitteeMember(
  input: Partial<CommitteeMember> & { fullName: string; role: string; phone: string }
): Promise<CommitteeMember> {
  const db = await getDb()
  if (!input.fullName || !input.role || !input.phone) {
    throw new Error("Name, designation and phone are required")
  }
  const nowIso = new Date().toISOString()
  if (input.id) {
    await db.execute(
      `UPDATE CommitteeMember SET fullName = $1, role = $2, phone = $3, responsibilities = $4, photoPath = $5, updatedAt = $6 WHERE id = $7`,
      [
        String(input.fullName).trim(),
        input.role,
        String(input.phone).trim(),
        input.responsibilities || null,
        input.photoPath || null,
        nowIso,
        input.id,
      ]
    )
    const rows = await db.select<CommitteeMember[]>("SELECT * FROM CommitteeMember WHERE id = $1", [input.id])
    return rows[0]
  }
  const maxRows = await db.select<{ m: number | null }[]>(
    "SELECT MAX(displayOrder) AS m FROM CommitteeMember",
    []
  )
  const id = uuid()
  await db.execute(
    `INSERT INTO CommitteeMember (id, fullName, role, phone, responsibilities, photoPath, displayOrder, createdAt, updatedAt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      String(input.fullName).trim(),
      input.role,
      String(input.phone).trim(),
      input.responsibilities || null,
      input.photoPath || null,
      (maxRows[0]?.m ?? -1) + 1,
      nowIso,
      nowIso,
    ]
  )
  const rows = await db.select<CommitteeMember[]>("SELECT * FROM CommitteeMember WHERE id = $1", [id])
  return rows[0]
}

export async function deleteCommitteeMember(id: string): Promise<void> {
  const db = await getDb()
  await db.execute("DELETE FROM CommitteeMember WHERE id = $1", [id])
}

export async function reorderCommittee(ids: string[]): Promise<void> {
  const db = await getDb()
  for (let idx = 0; idx < ids.length; idx++) {
    await db.execute("UPDATE CommitteeMember SET displayOrder = $1, updatedAt = $2 WHERE id = $3", [
      idx,
      new Date().toISOString(),
      ids[idx],
    ])
  }
}

// ---------- Attendance ----------

export async function fetchAttendance(date: string, batch?: string): Promise<AttendanceRecord[]> {
  const db = await getDb()
  if (batch) {
    return db.select<AttendanceRecord[]>("SELECT * FROM Attendance WHERE date = $1 AND batch = $2", [date, batch])
  }
  return db.select<AttendanceRecord[]>("SELECT * FROM Attendance WHERE date = $1", [date])
}

export async function markAttendance(
  records: { studentId: string; date: string; batch: string; status: string }[]
): Promise<void> {
  const db = await getDb()
  // validate the whole batch before writing — mirrors the web route
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  for (const r of records) {
    if (!r?.studentId) throw new Error("Each attendance record needs a student")
    if (!r?.date || !DATE_RE.test(r.date)) throw new Error("Attendance date must be in YYYY-MM-DD format")
    if (r?.status !== "Present" && r?.status !== "Absent") throw new Error("Attendance status must be Present or Absent")
  }
  for (const r of records) {
    await db.execute(
      `INSERT INTO Attendance (id, studentId, date, batch, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(studentId, date) DO UPDATE SET status = excluded.status, batch = excluded.batch`,
      [uuid(), r.studentId, r.date, r.batch, r.status]
    )
  }
}

// ---------- Settings / Backup ----------

const SETTINGS_DEFAULTS: AcademySettings = {
  academyName: "Pattern Sports Academy",
  tagline: "Building Champions, One Serve at a Time",
  address: "Municipal Stadium Road, Kerala, India",
  phone: "+91 98470 00000",
  email: "office@patternsportsacademy.in",
  defaultMonthlyFee: 500,
  receiptSignatory: "General Secretary",
}

export async function fetchSettings(): Promise<AcademySettings> {
  const db = await getDb()
  const rows = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM Setting", [])
  const map: Record<string, string> = {}
  rows.forEach((r) => (map[r.key] = r.value))
  return {
    academyName: map.academyName || SETTINGS_DEFAULTS.academyName,
    tagline: map.tagline || SETTINGS_DEFAULTS.tagline,
    address: map.address || SETTINGS_DEFAULTS.address,
    phone: map.phone || SETTINGS_DEFAULTS.phone,
    email: map.email || SETTINGS_DEFAULTS.email,
    defaultMonthlyFee: map.defaultMonthlyFee ? Number(map.defaultMonthlyFee) : SETTINGS_DEFAULTS.defaultMonthlyFee,
    receiptSignatory: map.receiptSignatory || SETTINGS_DEFAULTS.receiptSignatory,
  }
}

export async function saveSettings(settings: AcademySettings): Promise<AcademySettings> {
  const db = await getDb()
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue
    await db.execute(
      `INSERT INTO Setting (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
      [key, String(value)]
    )
  }
  return fetchSettings()
}

export async function exportBackup(): Promise<Blob> {
  const db = await getDb()
  const [students, achievements, payments, committee, attendance, settings] = await Promise.all([
    db.select<Student[]>("SELECT * FROM Student", []),
    db.select<Achievement[]>("SELECT * FROM Achievement", []),
    db.select<FeePayment[]>("SELECT * FROM FeePayment", []),
    db.select<CommitteeMember[]>("SELECT * FROM CommitteeMember", []),
    db.select<AttendanceRecord[]>("SELECT * FROM Attendance", []),
    db.select<{ key: string; value: string }[]>("SELECT key, value FROM Setting", []),
  ])
  const manifest = {
    app: "PS-AMS",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    counts: {
      students: students.length,
      achievements: achievements.length,
      payments: payments.length,
      committee: committee.length,
      attendance: attendance.length,
      settings: settings.length,
    },
  }
  const json = JSON.stringify(
    { manifest, students, achievements, payments, committee, attendance, settings },
    null,
    2
  )
  // Desktop: offer a native Save dialog as well (anchor downloads are unreliable in WebView2)
  try {
    const target = await saveDialog({
      defaultPath: `PS-AMS-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON backup", extensions: ["json"] }],
    })
    if (target) await writeTextFile(target, json)
  } catch {
    /* dialog unavailable — fall back to the returned blob */
  }
  return new Blob([json], { type: "application/json" })
}

// ---------- Media upload (disk-backed, relative paths only) ----------

export type UploadFolder = "photos" | "documents" | "certificates"

// Same allowlist as the web /api/upload route — images + PDF only.
const ALLOWED_UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"])

export async function uploadMedia(file: File, folder: UploadFolder): Promise<{ path: string }> {
  if (!_mediaBase) await initBackend()
  const safeName = sanitizeFileName(file.name)
  const ext = safeName.slice(safeName.lastIndexOf(".")).toLowerCase()
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    throw new Error("Unsupported file type — allowed: PNG, JPG, WEBP or PDF")
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const rel = `${folder}/${Date.now()}-${safeName}`
  const abs = await join(_mediaBase!, rel)
  try {
    await mkdir(await join(_mediaBase!, folder), { recursive: true })
  } catch {
    /* exists */
  }
  await writeFile(abs, bytes)
  return { path: rel }
}

// ---------- Demo data (Settings → Data Safety) ----------

const DEMO_KEY = "demoRecordIds"

export async function demoStatus(): Promise<{ loaded: boolean; students: number; committee: number }> {
  const db = await getDb()
  const [students, committee, flag] = await Promise.all([
    db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM Student", []),
    db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM CommitteeMember", []),
    db.select<{ value: string }[]>("SELECT value FROM Setting WHERE key = $1", [DEMO_KEY]),
  ])
  return { loaded: Boolean(flag[0]?.value), students: students[0]?.n ?? 0, committee: committee[0]?.n ?? 0 }
}

export async function loadDemoData(): Promise<{ students: number; committee: number }> {
  const db = await getDb()
  const flag = await db.select<{ value: string }[]>("SELECT value FROM Setting WHERE key = $1", [DEMO_KEY])
  if (flag[0]?.value) throw new Error("Demo data is already loaded — remove it first if you want a fresh copy.")

  const demoStudentIds: string[] = []
  const demoCommitteeIds: string[] = []
  const nowIso = new Date().toISOString()

  const committeeCount = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM CommitteeMember", [])
  if ((committeeCount[0]?.n ?? 0) === 0) {
    for (const c of DEMO_COMMITTEE) {
      const id = uuid()
      await db.execute(
        `INSERT INTO CommitteeMember (id, fullName, role, phone, responsibilities, photoPath, displayOrder, createdAt, updatedAt)
         VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$7)`,
        [id, c.fullName, c.role, c.phone, c.responsibilities, c.displayOrder, nowIso]
      )
      demoCommitteeIds.push(id)
    }
  }

  const usedAdmissionNos = (await db.select<{ admissionNo: string }[]>("SELECT admissionNo FROM Student", [])).map((r) => r.admissionNo)
  const usedReceiptNos = (await db.select<{ receiptNo: string }[]>("SELECT receiptNo FROM FeePayment", [])).map((r) => r.receiptNo)
  const year = new Date().getFullYear()
  const idByStudentName = new Map<string, string>()

  for (const s of DEMO_STUDENTS) {
    const admissionNo = nextAdmissionNo(usedAdmissionNos, year)
    usedAdmissionNos.push(admissionNo)
    const id = uuid()
    await db.execute(
      `INSERT INTO Student (
        id, admissionNo, registrationDate, fullName, dateOfBirth, parentName, mobile,
        emergencyContact, address, schoolName, classGrade, division, bloodGroup,
        heightCm, weightKg, standingReachCm, spikeReachCm, jumpReachCm,
        primarySport, playingPosition, ageCategory, trainingBatch, monthlyFee,
        photoPath, birthCertPath, idCardPath, status, createdAt, updatedAt
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NULL,NULL,NULL,'Active',$24,$24)`,
      [
        id,
        admissionNo,
        demoRegistrationDate(s).toISOString(),
        s.fullName,
        demoDob(s).toISOString(),
        s.parentName,
        s.mobile,
        s.emergencyContact || null,
        s.address,
        s.schoolName,
        s.classGrade,
        s.division,
        s.bloodGroup,
        s.heightCm ?? null,
        s.weightKg ?? null,
        s.standingReachCm ?? null,
        s.spikeReachCm ?? null,
        s.jumpReachCm ?? null,
        s.primarySport,
        s.playingPosition || null,
        s.ageCategory,
        s.trainingBatch,
        s.monthlyFee,
        nowIso,
      ]
    )
    demoStudentIds.push(id)
    idByStudentName.set(s.fullName, id)

    for (const p of planDemoPayments(s)) {
      const receiptNo = nextReceiptNo(usedReceiptNos, p.paymentDate)
      usedReceiptNos.push(receiptNo)
      await db.execute(
        `INSERT INTO FeePayment (id, receiptNo, studentId, paymentDate, months, amount, paymentMode, notes, collectedBy, createdAt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9)`,
        [uuid(), receiptNo, id, p.paymentDate.toISOString(), JSON.stringify(p.months), p.amount, p.paymentMode, "Front Desk", nowIso]
      )
    }

    for (const a of planDemoAttendance(s)) {
      await db.execute(
        `INSERT INTO Attendance (id, studentId, date, batch, status) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT(studentId, date) DO UPDATE SET status = excluded.status, batch = excluded.batch`,
        [uuid(), id, a.date, s.trainingBatch, a.status]
      )
    }
  }

  for (const a of DEMO_ACHIEVEMENTS) {
    const studentId = idByStudentName.get(a.student)
    if (!studentId) continue
    const eventDate = new Date()
    eventDate.setMonth(eventDate.getMonth() - a.eventDateMonthsAgo)
    await db.execute(
      `INSERT INTO Achievement (id, studentId, tournamentName, eventDate, level, medal, notes, certificatePath, createdAt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8)`,
      [uuid(), studentId, a.tournamentName, eventDate.toISOString(), a.level, a.medal, a.notes || null, nowIso]
    )
  }

  for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
    await db.execute(`INSERT INTO Setting (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [key, value])
  }
  const tracked = JSON.stringify({ students: demoStudentIds, committee: demoCommitteeIds })
  await db.execute(`INSERT INTO Setting (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`, [DEMO_KEY, tracked])

  return { students: demoStudentIds.length, committee: demoCommitteeIds.length }
}

export async function removeDemoData(): Promise<void> {
  const db = await getDb()
  const flag = await db.select<{ value: string }[]>("SELECT value FROM Setting WHERE key = $1", [DEMO_KEY])
  if (!flag[0]?.value) throw new Error("No demo data to remove.")
  const { students, committee } = JSON.parse(flag[0].value) as { students: string[]; committee: string[] }

  for (const id of students) {
    await db.execute("DELETE FROM FeePayment WHERE studentId = $1", [id])
    await db.execute("DELETE FROM Attendance WHERE studentId = $1", [id])
    await db.execute("DELETE FROM Achievement WHERE studentId = $1", [id])
    await db.execute("DELETE FROM Student WHERE id = $1", [id])
  }
  for (const id of committee) {
    await db.execute("DELETE FROM CommitteeMember WHERE id = $1", [id])
  }
  await db.execute("DELETE FROM Setting WHERE key = $1", [DEMO_KEY])
}
