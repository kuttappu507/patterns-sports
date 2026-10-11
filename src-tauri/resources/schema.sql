-- ============================================================
-- PS-AMS :: SQLite schema (Tauri SQL plugin / raw SQLite)
-- Mirrors prisma/schema.prisma — keep both files in sync.
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------- Students ----------
CREATE TABLE IF NOT EXISTS Student (
  id               TEXT PRIMARY KEY,
  admissionNo      TEXT NOT NULL UNIQUE,
  registrationDate TEXT NOT NULL,                -- ISO-8601
  fullName         TEXT NOT NULL,
  dateOfBirth      TEXT NOT NULL,                -- ISO-8601
  parentName       TEXT NOT NULL,
  mobile           TEXT NOT NULL,
  emergencyContact TEXT,
  address          TEXT,
  schoolName       TEXT,
  classGrade       TEXT,
  division         TEXT,
  bloodGroup       TEXT,
  gender           TEXT NOT NULL DEFAULT '',     -- Male|Female|Other (blank = unspecified)
  heightCm         REAL,
  weightKg         REAL,
  standingReachCm  REAL,
  spikeReachCm     REAL,
  jumpReachCm      REAL,
  primarySport     TEXT NOT NULL DEFAULT 'Volleyball',
  playingPosition  TEXT,
  ageCategory      TEXT NOT NULL,                -- Mini|Sub-Junior|Junior|Youth|Senior
  trainingBatch    TEXT,                          -- Morning|Evening
  monthlyFee       REAL NOT NULL DEFAULT 0,
  photoPath        TEXT,                          -- RELATIVE media path only
  birthCertPath    TEXT,
  idCardPath       TEXT,
  status           TEXT NOT NULL DEFAULT 'Active',-- Active|Inactive|Alumni
  createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_fullName    ON Student(fullName);
CREATE INDEX IF NOT EXISTS idx_student_mobile      ON Student(mobile);
CREATE INDEX IF NOT EXISTS idx_student_ageCategory ON Student(ageCategory);
CREATE INDEX IF NOT EXISTS idx_student_status      ON Student(status);
CREATE INDEX IF NOT EXISTS idx_student_school      ON Student(schoolName);

-- ---------- Achievements ----------
CREATE TABLE IF NOT EXISTS Achievement (
  id              TEXT PRIMARY KEY,
  studentId       TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tournamentName  TEXT NOT NULL,
  eventDate       TEXT,
  level           TEXT NOT NULL DEFAULT 'School',   -- School|District|State|National
  medal           TEXT NOT NULL DEFAULT 'None',     -- Gold|Silver|Bronze|Participation|None
  notes           TEXT,
  certificatePath TEXT,                             -- RELATIVE media path only
  createdAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_achievement_student ON Achievement(studentId);
CREATE INDEX IF NOT EXISTS idx_achievement_level   ON Achievement(level);

-- ---------- Fee payments (receipts) ----------
-- FeePayment → Student is ON DELETE RESTRICT (financial audit trail must
-- survive the student row; the app refuses deletes with receipts and points
-- at the Alumni status instead). Existing databases pick this up via the
-- FK-rebuild migration shipped with the 3C migration runner — until then the
-- application-layer guard is the operative protection on legacy files.
CREATE TABLE IF NOT EXISTS FeePayment (
  id          TEXT PRIMARY KEY,
  receiptNo   TEXT NOT NULL UNIQUE,
  studentId   TEXT NOT NULL REFERENCES Student(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  paymentDate TEXT NOT NULL,                     -- ISO-8601
  months      TEXT NOT NULL,                     -- JSON array of "YYYY-MM" billing periods
  amount      REAL NOT NULL,
  paymentMode TEXT NOT NULL DEFAULT 'Cash',      -- Cash|UPI / GPay|Bank Transfer
  notes       TEXT,
  collectedBy TEXT,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payment_student ON FeePayment(studentId);
CREATE INDEX IF NOT EXISTS idx_payment_date    ON FeePayment(paymentDate);
CREATE INDEX IF NOT EXISTS idx_payment_receipt ON FeePayment(receiptNo);

-- ---------- Billing allocation ledger (one row per settled student+month) ----------
-- UNIQUE(studentId, month) turns a concurrent double-collect into a
-- constraint error (HTTP 409) instead of a second receipt. The JSON months
-- column on FeePayment stays in sync during the transition release.
CREATE TABLE IF NOT EXISTS PaymentMonth (
  id        TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  month     TEXT NOT NULL,                       -- "YYYY-MM"
  paymentId TEXT NOT NULL REFERENCES FeePayment(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (studentId, month)
);
CREATE INDEX IF NOT EXISTS idx_paymentmonth_month   ON PaymentMonth(month);
CREATE INDEX IF NOT EXISTS idx_paymentmonth_payment ON PaymentMonth(paymentId);

-- ---------- Executive committee ----------
CREATE TABLE IF NOT EXISTS CommitteeMember (
  id              TEXT PRIMARY KEY,
  fullName        TEXT NOT NULL,
  role            TEXT NOT NULL,                 -- President|General Secretary|Treasurer|Executive Member
  phone           TEXT NOT NULL,
  responsibilities TEXT,
  photoPath       TEXT,                          -- RELATIVE media path only
  displayOrder    INTEGER NOT NULL DEFAULT 0,
  createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_committee_role  ON CommitteeMember(role);
CREATE INDEX IF NOT EXISTS idx_committee_order ON CommitteeMember(displayOrder);

-- ---------- Attendance (one record per student per session day) ----------
CREATE TABLE IF NOT EXISTS Attendance (
  id        TEXT PRIMARY KEY,
  studentId TEXT NOT NULL REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE,
  date      TEXT NOT NULL,                       -- "YYYY-MM-DD"
  batch     TEXT NOT NULL,                       -- training batch or age category label
  status    TEXT NOT NULL,                       -- Present|Absent
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (studentId, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date  ON Attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_batch ON Attendance(batch);

-- ---------- Settings (academy profile etc.) ----------
CREATE TABLE IF NOT EXISTS Setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
