// ============================================================
// PS-AMS :: Demo dataset — one source of truth for both backends.
//  - scripts/seed.ts          → Prisma (web dev database)
//  - src/app/api/demo/route.ts → Prisma (web, user-triggered)
//  - src/lib/psams/tauri-api.ts → SQL plugin (desktop, user-triggered)
// Pure data + date math only — no database imports here.
// ============================================================

export interface DemoStudent {
  fullName: string
  /** months before today the student registered */
  registeredMonthsAgo: number
  dateOfBirth: { y: number; m: number; d: number }
  parentName: string
  mobile: string
  emergencyContact?: string
  address: string
  schoolName: string
  classGrade: string
  division: string
  bloodGroup: string
  heightCm?: number
  weightKg?: number
  standingReachCm?: number
  spikeReachCm?: number
  jumpReachCm?: number
  primarySport: string
  playingPosition?: string
  ageCategory: string
  trainingBatch: "Morning" | "Evening"
  monthlyFee: number
  /** billing months intentionally left unpaid (0 = fully paid through now) */
  backlogMonths: number
}

export interface DemoCommitteeMember {
  fullName: string
  role: string
  phone: string
  responsibilities: string
  displayOrder: number
}

export interface DemoAchievement {
  /** matches DemoStudent.fullName */
  student: string
  tournamentName: string
  eventDateMonthsAgo: number
  level: string
  medal: string
  notes?: string
}

export interface DemoPaymentPlan {
  months: string[]
  paymentDate: Date
  amount: number
  paymentMode: string
}

export const DEMO_COMMITTEE: DemoCommitteeMember[] = [
  { fullName: "Suresh Kumar Pillai", role: "President", phone: "+91 94470 12345", responsibilities: "Overall academy governance and external liaison", displayOrder: 0 },
  { fullName: "Anitha Raghavan", role: "General Secretary", phone: "+91 98470 22334", responsibilities: "Day-to-day administration, tournaments and records", displayOrder: 1 },
  { fullName: "Rajesh Menon", role: "Treasurer", phone: "+91 99461 55667", responsibilities: "Fee oversight, budgets and annual audit", displayOrder: 2 },
  { fullName: "Deepa Krishnan", role: "Executive Member", phone: "+91 94950 33445", responsibilities: "Coaching coordination and camp logistics", displayOrder: 3 },
  { fullName: "Vikram Shetty", role: "Executive Member", phone: "+91 96330 77889", responsibilities: "Equipment, ground maintenance and transport", displayOrder: 4 },
]

export const DEMO_SETTINGS: Record<string, string> = {
  academyName: "Pattern Sports Academy",
  tagline: "Building Champions, One Serve at a Time",
  address: "Markaz Colony, Karanthur, Kunnamangalam, Kozhikode, Kerala 673571",
  phone: "+91 484 220 1100",
  email: "office@patternsportsacademy.in",
  defaultMonthlyFee: "500",
  receiptSignatory: "Anitha Raghavan · General Secretary",
}

export const DEMO_STUDENTS: DemoStudent[] = [
  { fullName: "Aravind R Menon", registeredMonthsAgo: 8, dateOfBirth: { y: 2011, m: 5, d: 14 }, parentName: "Ramesh Menon", mobile: "9847012001", emergencyContact: "9847012002", address: "Kaloor, Ernakulam", schoolName: "Bhavans Vidya Mandir", classGrade: "9", division: "A", bloodGroup: "O+", heightCm: 168, weightKg: 52, standingReachCm: 216, spikeReachCm: 248, jumpReachCm: 270, primarySport: "Volleyball", playingPosition: "Attacker / Spiker", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, backlogMonths: 0 },
  { fullName: "Nandhana Suresh", registeredMonthsAgo: 8, dateOfBirth: { y: 2013, m: 9, d: 2 }, parentName: "Suresh Babu", mobile: "9847012003", address: "Kadavanthra, Ernakulam", schoolName: "Rajagiri Christu Jayanthi", classGrade: "7", division: "B", bloodGroup: "A+", heightCm: 155, weightKg: 41, standingReachCm: 198, spikeReachCm: 228, jumpReachCm: 252, primarySport: "Volleyball", playingPosition: "Setter", ageCategory: "Sub-Junior", trainingBatch: "Evening", monthlyFee: 500, backlogMonths: 0 },
  { fullName: "Muhammed Sinan", registeredMonthsAgo: 7, dateOfBirth: { y: 2009, m: 12, d: 21 }, parentName: "Abdul Nazar", mobile: "9847012004", emergencyContact: "9946012004", address: "Aluva", schoolName: "Chinmaya Vidyalaya", classGrade: "11", division: "C", bloodGroup: "B+", heightCm: 178, weightKg: 63, standingReachCm: 228, spikeReachCm: 262, jumpReachCm: 285, primarySport: "Volleyball", playingPosition: "Blocker", ageCategory: "Youth", trainingBatch: "Morning", monthlyFee: 600, backlogMonths: 1 },
  { fullName: "Diya Krishnan", registeredMonthsAgo: 6, dateOfBirth: { y: 2017, m: 3, d: 18 }, parentName: "Krishnan Unni", mobile: "9847012005", address: "Tripunithura", schoolName: "Bhavans Vidya Mandir", classGrade: "3", division: "A", bloodGroup: "AB+", heightCm: 124, weightKg: 23, primarySport: "Badminton", playingPosition: "Singles", ageCategory: "Mini", trainingBatch: "Morning", monthlyFee: 400, backlogMonths: 0 },
  { fullName: "Joel Thomas", registeredMonthsAgo: 6, dateOfBirth: { y: 2006, m: 7, d: 8 }, parentName: "Thomas Varghese", mobile: "9847012006", address: "Edappally", schoolName: "St. Alberts HSS", classGrade: "12", division: "B", bloodGroup: "O-", heightCm: 185, weightKg: 71, standingReachCm: 238, spikeReachCm: 272, jumpReachCm: 296, primarySport: "Volleyball", playingPosition: "Universal", ageCategory: "Senior", trainingBatch: "Evening", monthlyFee: 700, backlogMonths: 2 },
  { fullName: "Sneha Prakash", registeredMonthsAgo: 5, dateOfBirth: { y: 2012, m: 1, d: 25 }, parentName: "Prakash Nair", mobile: "9847012007", address: "Vyttila", schoolName: "Nirmala Public School", classGrade: "8", division: "A", bloodGroup: "B-", heightCm: 158, weightKg: 44, standingReachCm: 202, spikeReachCm: 234, primarySport: "Volleyball", playingPosition: "Libero", ageCategory: "Sub-Junior", trainingBatch: "Morning", monthlyFee: 500, backlogMonths: 3 },
  { fullName: "Adithya Raj", registeredMonthsAgo: 5, dateOfBirth: { y: 2010, m: 10, d: 11 }, parentName: "Rajesh Kumar", mobile: "9847012008", address: "Palarivattom", schoolName: "Bhavans Vidya Mandir", classGrade: "10", division: "B", bloodGroup: "A-", heightCm: 172, weightKg: 58, standingReachCm: 222, spikeReachCm: 256, jumpReachCm: 278, primarySport: "Basketball", playingPosition: "Power Forward", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, backlogMonths: 0 },
  { fullName: "Fathima Rasheed", registeredMonthsAgo: 4, dateOfBirth: { y: 2014, m: 6, d: 30 }, parentName: "Rasheed KP", mobile: "9847012009", emergencyContact: "9744012009", address: "Mattancherry", schoolName: "Crescent Public School", classGrade: "6", division: "C", bloodGroup: "O+", heightCm: 147, weightKg: 36, primarySport: "Athletics", playingPosition: "Sprint", ageCategory: "Sub-Junior", trainingBatch: "Morning", monthlyFee: 450, backlogMonths: 1 },
  { fullName: "Karthik S Nair", registeredMonthsAgo: 3, dateOfBirth: { y: 2008, m: 2, d: 9 }, parentName: "Santhosh Nair", mobile: "9847012010", address: "Kakkanad", schoolName: "Rajagiri Christu Jayanthi", classGrade: "12", division: "A", bloodGroup: "AB-", heightCm: 181, weightKg: 66, standingReachCm: 232, spikeReachCm: 266, jumpReachCm: 288, primarySport: "Volleyball", playingPosition: "Setter", ageCategory: "Youth", trainingBatch: "Evening", monthlyFee: 600, backlogMonths: 0 },
  { fullName: "Lakshmi Warrier", registeredMonthsAgo: 2, dateOfBirth: { y: 2016, m: 11, d: 5 }, parentName: "Ajith Warrier", mobile: "9847012011", address: "Fort Kochi", schoolName: "Sacred Heart CMI", classGrade: "4", division: "B", bloodGroup: "A+", heightCm: 132, weightKg: 27, primarySport: "Badminton", playingPosition: "Doubles", ageCategory: "Mini", trainingBatch: "Morning", monthlyFee: 400, backlogMonths: 2 },
  { fullName: "Reuben Jacob", registeredMonthsAgo: 2, dateOfBirth: { y: 2007, m: 4, d: 27 }, parentName: "Jacob Cherian", mobile: "9847012012", address: "Thrikkakara", schoolName: "Bhavans Vidya Mandir", classGrade: "11", division: "B", bloodGroup: "B+", heightCm: 176, weightKg: 61, standingReachCm: 226, spikeReachCm: 259, primarySport: "Volleyball", playingPosition: "Attacker / Spiker", ageCategory: "Junior", trainingBatch: "Evening", monthlyFee: 600, backlogMonths: 0 },
  { fullName: "Ananya Sasi", registeredMonthsAgo: 1, dateOfBirth: { y: 2011, m: 8, d: 16 }, parentName: "Sasi Kumar", mobile: "9847012013", address: "Maradu", schoolName: "Nirmala Public School", classGrade: "9", division: "C", bloodGroup: "O+", heightCm: 162, weightKg: 47, standingReachCm: 208, spikeReachCm: 240, jumpReachCm: 262, primarySport: "Volleyball", playingPosition: "Blocker", ageCategory: "Junior", trainingBatch: "Morning", monthlyFee: 600, backlogMonths: 0 },
]

export const DEMO_ACHIEVEMENTS: DemoAchievement[] = [
  { student: "Aravind R Menon", tournamentName: "Kerala State Inter-School Volleyball Championship", eventDateMonthsAgo: 3, level: "State", medal: "Silver", notes: "Represented the academy squad" },
  { student: "Aravind R Menon", tournamentName: "Ernakulam District Youth League", eventDateMonthsAgo: 8, level: "District", medal: "Bronze" },
  { student: "Joel Thomas", tournamentName: "Kerala State Inter-School Volleyball Championship", eventDateMonthsAgo: 3, level: "State", medal: "Gold", notes: "Captained the academy squad" },
  { student: "Joel Thomas", tournamentName: "Ernakulam District Youth League", eventDateMonthsAgo: 8, level: "District", medal: "Bronze" },
  { student: "Nandhana Suresh", tournamentName: "Kerala State Sub-Junior Volleyball Championship", eventDateMonthsAgo: 3, level: "State", medal: "Silver", notes: "Best setter of the tournament" },
  { student: "Nandhana Suresh", tournamentName: "Ernakulam District Youth League", eventDateMonthsAgo: 8, level: "District", medal: "Bronze" },
  { student: "Karthik S Nair", tournamentName: "Kerala State Youth Volleyball Championship", eventDateMonthsAgo: 3, level: "State", medal: "Silver", notes: "Represented the academy squad" },
  { student: "Karthik S Nair", tournamentName: "Ernakulam District Youth League", eventDateMonthsAgo: 8, level: "District", medal: "Bronze" },
]

const PAYMENT_MODES = ["Cash", "UPI / GPay", "Bank Transfer"]

export function demoDob(s: DemoStudent): Date {
  return new Date(s.dateOfBirth.y, s.dateOfBirth.m - 1, s.dateOfBirth.d)
}

export function demoRegistrationDate(s: DemoStudent): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - s.registeredMonthsAgo, 12)
}

/** YYYY-MM key for a date. */
export function demoMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/**
 * Billing plan for a demo student: every month from the month after
 * registration up to (now - backlogMonths), split into receipts of at
 * most three months. Produces a healthy mix of fully-paid students,
 * current-month dues and 1–3 month defaulters across the roster.
 */
export function planDemoPayments(s: DemoStudent): DemoPaymentPlan[] {
  const now = new Date()
  const reg = demoRegistrationDate(s)
  const start = new Date(reg.getFullYear(), reg.getMonth() + 1, 1)
  const lastPaid = new Date(now.getFullYear(), now.getMonth() - s.backlogMonths, 1)

  const months: string[] = []
  for (const cur = new Date(start); cur <= lastPaid; cur.setMonth(cur.getMonth() + 1)) {
    months.push(demoMonthKey(cur))
  }

  const plans: DemoPaymentPlan[] = []
  for (let i = 0; i < months.length; i += 3) {
    const chunk = months.slice(i, i + 3)
    if (!chunk.length) continue
    const [y, m] = chunk[chunk.length - 1].split("-").map(Number)
    plans.push({
      months: chunk,
      paymentDate: new Date(y, m - 1, 12),
      amount: chunk.length * s.monthlyFee,
      paymentMode: PAYMENT_MODES[(i / 3) % PAYMENT_MODES.length],
    })
  }
  return plans
}

/** Attendance rows for the last `days` non-Sunday days, ~85% present (deterministic). */
export function planDemoAttendance(s: DemoStudent, days = 3): { date: string; status: "Present" | "Absent" }[] {
  const now = new Date()
  const rows: { date: string; status: "Present" | "Absent" }[] = []
  let seed = s.fullName.length * 7 + 3 // deterministic pseudo-random per student
  let taken = 0
  for (let back = 0; back < 10 && taken < days; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
    if (day.getDay() === 0) continue // skip Sundays
    seed = (seed * 31 + 7) % 100
    rows.push({
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
      status: seed > 15 ? "Present" : "Absent",
    })
    taken++
  }
  return rows
}
