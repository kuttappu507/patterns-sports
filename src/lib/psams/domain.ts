// ============================================================
// PS-AMS :: Domain logic — age, BMI, categories, billing months,
// numbering, formatting. Pure functions, shared client & server.
// ============================================================

import { AGE_CATEGORIES } from "./types"

// ---------- Age & category ----------

/** Compute precise age in whole years from a date of birth (live, timezone-safe). */
export function computeAge(dateOfBirth: string | Date, at: Date = new Date()): number {
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return 0
  let age = at.getFullYear() - dob.getFullYear()
  const m = at.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < dob.getDate())) age--
  return Math.max(age, 0)
}

/** Detailed age like "14 yrs 3 mos". */
export function ageDetailed(dateOfBirth: string | Date, at: Date = new Date()): string {
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return "—"
  let years = at.getFullYear() - dob.getFullYear()
  let months = at.getMonth() - dob.getMonth()
  if (at.getDate() < dob.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years < 0) return "—"
  const y = `${years} yr${years === 1 ? "" : "s"}`
  const mo = `${months} mo${months === 1 ? "" : "s"}`
  return years > 0 ? `${y} ${mo}` : mo
}

/** Suggest an age category from an age. Mini ≤9 · Sub-Junior 10–12 · Junior 13–15 · Youth 16–18 · Senior 19+ */
export function suggestAgeCategory(age: number): string {
  if (age <= 9) return "Mini"
  if (age <= 12) return "Sub-Junior"
  if (age <= 15) return "Junior"
  if (age <= 18) return "Youth"
  return "Senior"
}

/** Category bracket label e.g. "Sub-Junior (10–12)" */
export function categoryBracket(category: string): string {
  switch (category) {
    case "Mini": return "Mini (U-10)"
    case "Sub-Junior": return "Sub-Junior (10–12)"
    case "Junior": return "Junior (13–15)"
    case "Youth": return "Youth (16–18)"
    case "Senior": return "Senior (19+)"
    default: return category
  }
}

// ---------- BMI ----------

export function computeBMI(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

export function bmiBand(bmi: number | null): { label: string; color: string } {
  if (bmi === null) return { label: "—", color: "text-muted-foreground" }
  if (bmi < 16) return { label: "Severe underweight", color: "text-red-600" }
  if (bmi < 18.5) return { label: "Underweight", color: "text-amber-600" }
  if (bmi < 25) return { label: "Healthy", color: "text-emerald-600" }
  if (bmi < 30) return { label: "Overweight", color: "text-amber-600" }
  return { label: "Obese", color: "text-red-600" }
}

// ---------- Vertical jump / reach metrics ----------

export function jumpDelta(spikeReach?: number | null, standingReach?: number | null): number | null {
  if (!spikeReach || !standingReach) return null
  return spikeReach - standingReach
}

// ---------- Billing months (YYYY-MM keys) ----------

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
}

/** All month keys between start and end inclusive (end defaults to current month). */
export function monthsBetween(start: Date, end: Date = new Date()): string[] {
  const keys: string[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    keys.push(monthKey(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return keys
}

/** Parse the JSON months column safely. */
export function parsePaidMonths(monthsJson: string): string[] {
  try {
    const arr = JSON.parse(monthsJson)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

export interface PaymentLite {
  months: string
  paymentDate: string | Date
}

/**
 * Compute the fee status of a student: billing starts the month AFTER the
 * registration month (joining month is complimentary), up to current month.
 */
export function computeFeeStatus(
  student: {
    id: string
    registrationDate: string | Date
    monthlyFee: number
    status?: string
  },
  payments: PaymentLite[],
  now: Date = new Date()
) {
  const reg = new Date(student.registrationDate)
  const billingStart = new Date(reg.getFullYear(), reg.getMonth() + 1, 1)
  const paidMonths = new Set<string>()
  let lastPayment: PaymentLite | null = null
  for (const p of payments) {
    for (const m of parsePaidMonths(p.months)) paidMonths.add(m)
    if (!lastPayment || new Date(p.paymentDate) > new Date(lastPayment.paymentDate)) lastPayment = p
  }
  const allBillable = monthsBetween(billingStart, now).filter((k) => !paidMonths.has(k))
  const currentKey = monthKey(now)
  const pendingMonths = allBillable
  const overdueMonths = pendingMonths.filter((k) => k < currentKey)
  const dueAmount = pendingMonths.length * (student.monthlyFee || 0)
  // "Overdue by more than one month" => at least 2 unpaid cycles behind
  const isDefaulter = overdueMonths.length > 1
  return {
    paidMonths: Array.from(paidMonths).sort(),
    pendingMonths,
    overdueMonths,
    dueAmount,
    isDefaulter,
    lastPayment,
  }
}

/** True when the student has settled the CURRENT billing month. */
export function hasPaidCurrentMonth(paidMonths: string[], now: Date = new Date()): boolean {
  return paidMonths.includes(monthKey(now))
}

// ---------- Numbering ----------

export async function nextAdmissionNo(existingCount: number, year: number = new Date().getFullYear()): Promise<string> {
  return `PSA-${year}-${String(existingCount + 1).padStart(4, "0")}`
}

export function nextReceiptNo(seq: number, date: Date = new Date()): string {
  return `RC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${String(seq).padStart(5, "0")}`
}

// ---------- Formatting ----------

export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return "₹0"
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return "—"
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return "—"
  return (
    dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  )
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ---------- Sanitization (media file names) ----------

export function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-80)
}

/** Guard against path traversal — only allow `folder/filename.ext` relative paths. */
export function isSafeMediaPath(p: string): boolean {
  return /^(photos|documents|certificates)\/[a-zA-Z0-9._-]+$/.test(p)
}

export const CATEGORY_COLORS: Record<string, string> = {
  Mini: "bg-sky-100 text-sky-700 border-sky-200",
  "Sub-Junior": "bg-violet-100 text-violet-700 border-violet-200",
  Junior: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Youth: "bg-amber-100 text-amber-700 border-amber-200",
  Senior: "bg-rose-100 text-rose-700 border-rose-200",
}

export const MEDAL_ICONS: Record<string, string> = {
  Gold: "🥇",
  Silver: "🥈",
  Bronze: "🥉",
  Participation: "🎖️",
  None: "•",
}
