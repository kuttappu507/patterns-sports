// ============================================================
// PS-AMS :: Shared domain types
// ============================================================

export const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"] as const
export type AgeCategory = (typeof AGE_CATEGORIES)[number]

export const PAYMENT_MODES = ["Cash", "UPI / GPay", "Bank Transfer"] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const MEDAL_OPTIONS = ["Gold", "Silver", "Bronze", "Participation", "None"] as const
export const SELECTION_LEVELS = ["School", "District", "State", "National"] as const

export const COMMITTEE_ROLES = [
  "President",
  "General Secretary",
  "Treasurer",
  "Executive Member",
] as const

export const TRAINING_BATCHES = ["Morning", "Evening"] as const

export const SPORT_POSITIONS: Record<string, string[]> = {
  Volleyball: ["Setter", "Attacker / Spiker", "Libero", "Blocker", "Universal"],
  Basketball: ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"],
  Football: ["Goalkeeper", "Defender", "Midfielder", "Winger", "Striker"],
  Athletics: ["Sprint", "Middle Distance", "Long Distance", "Jumps", "Throws"],
  Kabaddi: ["Raider", "Defender", "All-Rounder"],
  Badminton: ["Singles", "Doubles", "Mixed Doubles"],
  Cricket: ["Batter", "Bowler", "All-Rounder", "Wicket-Keeper"],
  "Table Tennis": ["Attacker", "Defender", "All-Rounder"],
}

export const SPORTS = Object.keys(SPORT_POSITIONS)

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const

// ---- API entity shapes (dates serialize as ISO strings over the wire) ----

export interface Student {
  id: string
  admissionNo: string
  registrationDate: string
  fullName: string
  dateOfBirth: string
  parentName: string
  mobile: string
  emergencyContact?: string | null
  address?: string | null
  schoolName?: string | null
  classGrade?: string | null
  division?: string | null
  bloodGroup?: string | null
  heightCm?: number | null
  weightKg?: number | null
  standingReachCm?: number | null
  spikeReachCm?: number | null
  jumpReachCm?: number | null
  primarySport: string
  playingPosition?: string | null
  ageCategory: AgeCategory | string
  trainingBatch?: string | null
  monthlyFee: number
  photoPath?: string | null
  birthCertPath?: string | null
  idCardPath?: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface Achievement {
  id: string
  studentId: string
  tournamentName: string
  eventDate?: string | null
  level: string
  medal: string
  notes?: string | null
  certificatePath?: string | null
  createdAt: string
}

export interface FeePayment {
  id: string
  receiptNo: string
  studentId: string
  student?: Student
  paymentDate: string
  months: string // JSON string[] of "YYYY-MM" (multi-month settle)
  amount: number
  paymentMode: string
  notes?: string | null
  collectedBy?: string | null
  createdAt: string
}

export interface CommitteeMember {
  id: string
  fullName: string
  role: string
  phone: string
  responsibilities?: string | null
  photoPath?: string | null
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface AttendanceRecord {
  id: string
  studentId: string
  date: string
  batch: string
  status: "Present" | "Absent" | string
}

export interface AcademySettings {
  academyName: string
  tagline: string
  address: string
  phone: string
  email: string
  defaultMonthlyFee: number
  receiptSignatory: string
}

export interface StudentFeeStatus {
  student: Student
  paidMonths: string[]
  pendingMonths: string[]
  overdueMonths: string[] // pending months strictly before current month
  dueAmount: number
  isDefaulter: boolean // overdue by more than one month
  lastPayment?: FeePayment | null
}

export interface DashboardStats {
  totalActive: number
  categoryBreakdown: { category: string; count: number }[]
  feeCycle: {
    paidCount: number
    defaulterCount: number
    dueSoonCount: number
    collectionRate: number
  }
  monthRevenue: number
  todayRevenue: number
  attendanceToday: { present: number; absent: number; marked: number; totalActive: number }
  recentPayments: (FeePayment & { studentName: string; admissionNo: string })[]
  upcomingBirthdays: { id: string; fullName: string; dateOfBirth: string; photoPath?: string | null; daysAway: number }[]
  committee: CommitteeMember[]
}

// ---- Print payloads ----

export type PrintKind =
  | "profile-a4"
  | "receipt-a5"
  | "receipt-thermal"
  | "defaulters"
  | "report"
  | "attendance-sheet"

export interface PrintPayload {
  kind: PrintKind
  title?: string
  data?: unknown
}
