"use client"

// ============================================================
// PS-AMS :: Offline desktop backend (Tauri SQL + FS plugins)
// Mirrors the Next.js API routes 1:1 so the packaged Windows exe
// runs with zero HTTP server. Same signatures as api.ts.
// ============================================================

import Database from "@tauri-apps/plugin-sql"
import { writeFile, writeTextFile, mkdir, readTextFile } from "@tauri-apps/plugin-fs"
import { save as saveDialog } from "@tauri-apps/plugin-dialog"
import { appDataDir, join, resolveResource } from "@tauri-apps/api/path"
import type {
  Achievement,
  AttendanceRecord,
  CommitteeMember,
  DashboardStats,
  FeePayment,
  Student,
  StudentFeeStatus,
  AcademySettings,
} from "./types"
import { computeAge, computeFeeStatus, parsePaidMonths, sanitizeFileName, todayKey } from "./domain"

type DB = Database

let _db: DB | null = null
let _mediaBase: string | null = null

/** Open (once) the SQLite database and guarantee the schema exists. */
export async function getDb(): Promise<DB> {
  if (!_db) {
    _db = await Database.load("sqlite:ps-ams.db")
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
    const resPath = await resolveResource("resources/schema.sql")
    const sql = await readTextFile(resPath)
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
    /* schema file unavailable — assume the shell bootstrapped it */
  }
}

/** Boot the offline backend: DB + media directories. Called once at app start. */
export async function initBackend(): Promise<void> {
  await getDb()
  const dataDir = await appDataDir()
  _mediaBase = await join(dataDir, "media")
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

export async function fetchStudent(id: string): Promise<Student> {
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
  const countRows = await db.select<{ c: number }[]>("SELECT COUNT(*) AS c FROM Student", [])
  const year = new Date().getFullYear()
  const admissionNo =
    (input as Partial<Student>).admissionNo || `PSA-${year}-${String((countRows[0]?.c ?? 0) + 1).padStart(4, "0")}`
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
}): Promise<FeePayment> {
  const db = await getDb()
  if (!input.studentId || !Array.isArray(input.months) || input.months.length === 0) {
    throw new Error("studentId and at least one billing month are required")
  }
  if (!input.amount || Number(input.amount) <= 0) {
    throw new Error("Collected amount must be greater than zero")
  }
  const countRows = await db.select<{ c: number }[]>("SELECT COUNT(*) AS c FROM FeePayment", [])
  const now = new Date()
  const receiptNo = `RC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    (countRows[0]?.c ?? 0) + 1
  ).padStart(5, "0")}`
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
): Promise<(FeePayment & { studentName: string; admissionNo: string })[]> {
  const db = await getDb()
  let rows = await db.select<(FeePayment & { studentName: string; admissionNo: string })[]>(
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

export async function uploadMedia(file: File, folder: UploadFolder): Promise<{ path: string }> {
  if (!_mediaBase) await initBackend()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const rel = `${folder}/${Date.now()}-${sanitizeFileName(file.name)}`
  const abs = await join(_mediaBase!, rel)
  try {
    await mkdir(await join(_mediaBase!, folder), { recursive: true })
  } catch {
    /* exists */
  }
  await writeFile(abs, bytes)
  return { path: rel }
}
