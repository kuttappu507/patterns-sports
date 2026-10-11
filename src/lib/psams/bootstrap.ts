import { createClient } from "@libsql/client"
import fs from "node:fs"
import path from "node:path"
import { planLedgerBackfill } from "@/lib/psams/ledger"

// ============================================================
// PS-AMS :: boot-time database bootstrap (web / preview server).
//
// The SQLite database file is intentionally NOT committed (it is
// git-ignored), so a fresh checkout, a reset sandbox or a new
// deployment would otherwise boot with NO tables and NO data —
// which looked like "demo data is not coming / connection not
// there". This module self-heals that at server start:
//
//   1. ensure the database directory exists
//   2. apply the idempotent DDL (CREATE TABLE IF NOT EXISTS …,
//      mirrors src-tauri/resources/schema.sql)
//   3. seed the demo academy ONCE if the database is empty
//
// It never throws into the boot path — a failure is logged and
// the API routes surface their own errors afterwards.
// ============================================================

/** Idempotent schema DDL — keep in sync with src-tauri/resources/schema.sql. */
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS Student (
  id               TEXT PRIMARY KEY,
  admissionNo      TEXT NOT NULL UNIQUE,
  registrationDate TEXT NOT NULL,
  fullName         TEXT NOT NULL,
  dateOfBirth      TEXT NOT NULL,
  parentName       TEXT NOT NULL,
  mobile           TEXT NOT NULL,
  emergencyContact TEXT,
  address          TEXT,
  schoolName       TEXT,
  classGrade       TEXT,
  division         TEXT,
  bloodGroup       TEXT,
  gender           TEXT NOT NULL DEFAULT '',
  heightCm         REAL,
  weightKg         REAL,
  standingReachCm  REAL,
  spikeReachCm     REAL,
  jumpReachCm      REAL,
  primarySport     TEXT NOT NULL DEFAULT 'Volleyball',
  playingPosition  TEXT,
  ageCategory      TEXT NOT NULL,
  trainingBatch    TEXT,
  monthlyFee       REAL NOT NULL DEFAULT 0,
  photoPath        TEXT,
  birthCertPath    TEXT,
  idCardPath       TEXT,
  status           TEXT NOT NULL DEFAULT 'Active',
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_fullName    ON Student(fullName);
CREATE INDEX IF NOT EXISTS idx_student_mobile      ON Student(mobile);
CREATE INDEX IF NOT EXISTS idx_student_ageCategory ON Student(ageCategory);
CREATE INDEX IF NOT EXISTS idx_student_status      ON Student(status);
CREATE INDEX IF NOT EXISTS idx_student_school      ON Student(schoolName);

CREATE TABLE IF NOT EXISTS Achievement (
  id              TEXT PRIMARY KEY,
  studentId       TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tournamentName  TEXT NOT NULL,
  eventDate       TEXT,
  level           TEXT NOT NULL DEFAULT 'School',
  medal           TEXT NOT NULL DEFAULT 'None',
  notes           TEXT,
  certificatePath TEXT,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_achievement_student ON Achievement(studentId);
CREATE INDEX IF NOT EXISTS idx_achievement_level   ON Achievement(level);

CREATE TABLE IF NOT EXISTS FeePayment (
  id          TEXT PRIMARY KEY,
  receiptNo   TEXT NOT NULL UNIQUE,
  studentId   TEXT NOT NULL REFERENCES Student(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  paymentDate TEXT NOT NULL,
  months      TEXT NOT NULL,
  amount      REAL NOT NULL,
  paymentMode TEXT NOT NULL DEFAULT 'Cash',
  notes       TEXT,
  collectedBy TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_student ON FeePayment(studentId);
CREATE INDEX IF NOT EXISTS idx_payment_date    ON FeePayment(paymentDate);
CREATE INDEX IF NOT EXISTS idx_payment_receipt ON FeePayment(receiptNo);

CREATE TABLE IF NOT EXISTS PaymentMonth (
  id        TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  month     TEXT NOT NULL,
  paymentId TEXT NOT NULL REFERENCES FeePayment(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (studentId, month)
);
CREATE INDEX IF NOT EXISTS idx_paymentmonth_month   ON PaymentMonth(month);
CREATE INDEX IF NOT EXISTS idx_paymentmonth_payment ON PaymentMonth(paymentId);

CREATE TABLE IF NOT EXISTS CommitteeMember (
  id               TEXT PRIMARY KEY,
  fullName         TEXT NOT NULL,
  role             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  responsibilities TEXT,
  photoPath        TEXT,
  displayOrder     INTEGER NOT NULL DEFAULT 0,
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_committee_role  ON CommitteeMember(role);
CREATE INDEX IF NOT EXISTS idx_committee_order ON CommitteeMember(displayOrder);

CREATE TABLE IF NOT EXISTS Attendance (
  id        TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  date      TEXT NOT NULL,
  batch     TEXT NOT NULL,
  status    TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (studentId, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date  ON Attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_batch ON Attendance(batch);

CREATE TABLE IF NOT EXISTS Setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** Resolve the SQLite file path exactly like src/lib/db.ts does for libsql. */
export function resolveDbFile(): string | null {
  const raw = process.env.DATABASE_URL ?? "file:../db/custom.db"
  if (!raw.startsWith("file:")) return null
  let p = raw.slice("file:".length)
  if (p.startsWith("../")) {
    // Prisma convention: relative to the schema file location (prisma/)
    p = path.resolve(process.cwd(), "prisma", p)
  } else if (p.startsWith(".")) {
    p = path.resolve(process.cwd(), p)
  }
  return p
}

let bootstrapped = false

/**
 * Reconcile the PaymentMonth allocation ledger with the receipts' JSON
 * months (PS-001). Idempotent — runs on every boot: legacy rows, rows the
 * demo seeder wrote directly, and crash-window rows (payment inserted,
 * allocations not yet) all get their allocation rows back, because the
 * JSON months column is the read source of truth during the transition.
 * Orphan allocation rows (their receipt is gone — FK cascades can be
 * skipped on connections where the pragma is off) are removed so they
 * can never block a fresh collect.
 */
export async function syncPaymentLedger(): Promise<{ added: number; orphans: number; clashes: number }> {
  const dbFile = resolveDbFile()
  if (!dbFile) return { added: 0, orphans: 0, clashes: 0 }
  const client = createClient({ url: `file:${dbFile}` })
  try {
    const payments = (
      await client.execute("SELECT id, studentId, months FROM FeePayment")
    ).rows as unknown as { id: string; studentId: string; months: string }[]
    const existing = (
      await client.execute("SELECT studentId, month FROM PaymentMonth")
    ).rows as unknown as { studentId: string; month: string }[]
    const { allocations, clashes } = planLedgerBackfill(payments, existing)
    for (const a of allocations) {
      await client.execute({
        sql: "INSERT INTO PaymentMonth (id, studentId, month, paymentId) VALUES (?, ?, ?, ?)",
        args: [a.id, a.studentId, a.month, a.paymentId],
      })
    }
    const orphan = await client.execute(
      "DELETE FROM PaymentMonth WHERE paymentId NOT IN (SELECT id FROM FeePayment)"
    )
    if (clashes.length > 0) {
      // Legacy double-receipted months are reported, never rewritten
      // (the audit rule: historical receipts are never merged or deleted).
      console.warn(
        `[PS-AMS] ledger reconciliation: ${clashes.length} legacy double-receipted month(s) detected — first receipt wins the ledger, receipts left untouched`
      )
    }
    return { added: allocations.length, orphans: orphan.rowsAffected, clashes: clashes.length }
  } finally {
    client.close()
  }
}

/**
 * Ensure the SQLite database exists with the full schema, and seed the
 * demo dataset the first time an empty database is seen.
 */
export async function bootstrapDatabase(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true

  try {
    const dbFile = resolveDbFile()
    if (!dbFile) {
      console.warn("[PS-AMS] bootstrap skipped — DATABASE_URL is not a sqlite file URL")
      return
    }
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })

    // ---- 1 + 2: idempotent DDL through a raw libsql connection ----
    const client = createClient({ url: `file:${dbFile}` })
    for (const stmt of SCHEMA_DDL.split(";")) {
      const sql = stmt.trim()
      if (sql) await client.execute(sql)
    }
    client.close()

    // ---- 3: auto-seed demo content once, only when truly empty ----
    const { db } = await import("@/lib/db")
    const { loadDemoDataset, DEMO_KEY, AUTO_SEED_KEY } = await import("@/lib/psams/demo-seed")

    const [studentCount, demoFlag, autoSeedFlag] = await Promise.all([
      db.student.count(),
      db.setting.findUnique({ where: { key: DEMO_KEY } }),
      db.setting.findUnique({ where: { key: AUTO_SEED_KEY } }),
    ])

    if (studentCount === 0 && !demoFlag?.value && !autoSeedFlag?.value) {
      const res = await loadDemoDataset(db)
      await db.setting.upsert({
        where: { key: AUTO_SEED_KEY },
        create: { key: AUTO_SEED_KEY, value: "1" },
        update: { value: "1" },
      })
      console.warn(
        `[PS-AMS] empty database — seeded demo academy (${res.students} players, ${res.committee} committee members)`
      )
    } else {
      console.warn(`[PS-AMS] database ready — ${studentCount} student record(s) present`)
    }

    // ---- 4: reconcile the billing allocation ledger (PS-001 backstop) ----
    const ledger = await syncPaymentLedger()
    if (ledger.added > 0 || ledger.orphans > 0) {
      console.warn(
        `[PS-AMS] ledger reconciled — ${ledger.added} allocation row(s) backfilled, ${ledger.orphans} orphan(s) removed`
      )
    }
  } catch (e) {
    console.error("[PS-AMS] database bootstrap failed:", e instanceof Error ? e.message : e)
  }
}
