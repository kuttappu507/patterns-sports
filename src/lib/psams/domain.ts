// ============================================================
// PS-AMS :: Domain logic — age, BMI, categories, billing months,
// numbering, formatting. Pure functions, shared client & server.
// ============================================================

import type { AcademySettings } from "./types"

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
  if (bmi < 16) return { label: "Severe underweight", color: "text-red-400" }
  if (bmi < 18.5) return { label: "Underweight", color: "text-amber-300" }
  if (bmi < 25) return { label: "Healthy", color: "text-emerald-400" }
  if (bmi < 30) return { label: "Overweight", color: "text-amber-300" }
  return { label: "Obese", color: "text-red-400" }
}

// ---------- Vertical jump / reach metrics ----------

export function jumpDelta(spikeReach?: number | null, standingReach?: number | null): number | null {
  if (!spikeReach || !standingReach) return null
  return spikeReach - standingReach
}

// ---------- Academy identity ----------

/** Official Google Maps location of the academy (shared across footer, settings & prints). */
export const ACADEMY_MAPS_URL = "https://maps.app.goo.gl/yUGoSNRdvcN4qKdu6"

/**
 * The academy's real address — the ONE shared letterhead default.
 * Used by the web settings API, the desktop settings backend and the demo
 * dataset, so an empty web preview and a fresh desktop install print the
 * same letterhead. Never duplicate this string elsewhere.
 */
export const ACADEMY_ADDRESS = "Markaz Colony, Karanthur, Kunnamangalam, Kozhikode, Kerala 673571"

/** Letterhead defaults for an empty database (both backends share this object). */
export const DEFAULT_SETTINGS: AcademySettings = {
  academyName: "Pattern Sports Academy",
  tagline: "Building Champions, One Serve at a Time",
  address: ACADEMY_ADDRESS,
  phone: "+91 98470 00000",
  email: "office@patternsportsacademy.in",
  defaultMonthlyFee: 500,
  receiptSignatory: "General Secretary",
}

// ---------- Sports science insights ----------
// Reference values a coach can act on. They are ESTIMATES computed from
// the athlete's recorded facts — not medical measurements.

/** Reference net heights (metres) per age category — used for spike clearance. */
export const NET_HEIGHT_M: Record<string, number> = {
  Mini: 2.0,
  "Sub-Junior": 2.15,
  Junior: 2.2,
  Youth: 2.35,
  Senior: 2.43,
}

/** How far the spike reach clears (or falls short of) the category net, in cm. */
export function spikeClearance(spikeReachCm?: number | null, ageCategory?: string | null): number | null {
  if (!spikeReachCm) return null
  const net = NET_HEIGHT_M[ageCategory || ""] ?? NET_HEIGHT_M.Senior
  return Math.round(spikeReachCm - net * 100)
}

/** Rate a vertical jump gain (spike reach − standing reach) in cm. */
export function verticalJumpRating(gain: number | null): { label: string; color: string } {
  if (gain === null) return { label: "—", color: "text-muted-foreground" }
  if (gain < 40) return { label: "Developing", color: "text-amber-600 dark:text-amber-300" }
  if (gain < 50) return { label: "Average", color: "text-sky-600 dark:text-sky-300" }
  if (gain < 60) return { label: "Good", color: "text-emerald-600 dark:text-emerald-300" }
  if (gain < 70) return { label: "Excellent", color: "text-emerald-600 dark:text-emerald-300" }
  return { label: "Elite", color: "text-cyan-600 dark:text-cyan-300" }
}

/** Standing-reach-to-height ratio — typically 1.28–1.33 for court athletes. */
export function reachRatio(standingReachCm?: number | null, heightCm?: number | null): number | null {
  if (!standingReachCm || !heightCm || heightCm <= 0) return null
  return standingReachCm / heightCm
}

/** Training age — whole months since registration (the coaching "experience" figure). */
export function trainingAge(registrationDate: string | Date, at: Date = new Date()): number | null {
  const d = new Date(registrationDate)
  if (isNaN(d.getTime())) return null
  const months = (at.getFullYear() - d.getFullYear()) * 12 + (at.getMonth() - d.getMonth())
  return Math.max(0, months)
}

/** Healthy weight band (kg) for a height on the adult BMI 18.5–24.9 scale. */
export function healthyWeightBand(heightCm?: number | null): [number, number] | null {
  if (!heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return [Math.round(18.5 * m * m), Math.round(24.9 * m * m)]
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

/** Current billing-cycle bucket — the ONE classification used by both backends. */
export type FeeCycleBucket = "paid" | "due" | "defaulter"

/**
 * Classify a student for the Dashboard fee cards and the Fees page so both
 * screens ALWAYS agree (previously each screen had its own inline rule and
 * they contradicted each other):
 *
 *   defaulter — overdue by MORE than one billing month, even when the
 *               current month itself is already settled (same rule as
 *               `computeFeeStatus().isDefaulter` — do not change it here)
 *   due       — anything still unpaid for the current cycle (the current
 *               month, or exactly one older month behind)
 *   paid      — nothing pending at all. A player registered this month owes
 *               nothing (joining month is complimentary) and is NOT "due".
 */
export function classifyFeeCycle(st: { pendingMonths: string[]; overdueMonths: string[] }): FeeCycleBucket {
  if (st.overdueMonths.length > 1) return "defaulter"
  if (st.pendingMonths.length > 0) return "due"
  return "paid"
}

// ---------- Shared write-path validation (web routes AND desktop backend enforce the same rejects) ----------

/** Strict "YYYY-MM" billing-month key. */
export const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Indian mobile: 10 digits, optional leading 0 or 91 prefix. */
export const MOBILE_DIGITS_RE = /^(\d{10}|0\d{10}|91\d{10})$/

/**
 * Sanity guards for a student record — mirrored by the web POST /api/students
 * route and the desktop createStudent. Throws with a user-facing message.
 */
export function assertValidStudentInput(input: Record<string, unknown>): void {
  const required = ["fullName", "dateOfBirth", "parentName", "mobile", "ageCategory"] as const
  for (const k of required) {
    if (!input[k]) throw new Error(`Missing required field: ${k}`)
  }
  const dob = new Date(String(input.dateOfBirth))
  if (Number.isNaN(dob.getTime()) || dob > new Date()) {
    throw new Error("Date of birth is invalid or in the future")
  }
  if (!MOBILE_DIGITS_RE.test(String(input.mobile).replace(/\D/g, ""))) {
    throw new Error("Mobile number must be 10 digits (country code / leading 0 accepted)")
  }
  const fee = Number(input.monthlyFee ?? 0)
  if (!Number.isFinite(fee) || fee < 0) {
    throw new Error("Monthly fee cannot be negative")
  }
}

/**
 * Guards the payment write path on BOTH backends. Rejects:
 *   - months that are not strict "YYYY-MM" keys (desktop previously accepted any string)
 *   - duplicate months inside one request
 *   - a month that is ALREADY settled — no double receipting
 *   - any amount other than months.length × monthlyFee
 *     (a discount field would be a deliberate feature; it does not exist)
 * `alreadyPaidMonths` comes from computeFeeStatus().paidMonths on the live
 * student row — recompute it server-side, never trust the client.
 */
export function assertValidPayment(
  months: unknown[],
  amount: number,
  monthlyFee: number,
  alreadyPaidMonths: string[] = []
): void {
  if (!Array.isArray(months) || months.length === 0) {
    throw new Error("studentId and at least one billing month are required")
  }
  if (!months.every((m) => typeof m === "string" && MONTH_KEY_RE.test(m))) {
    throw new Error("Billing months must be in YYYY-MM format")
  }
  if (new Set(months as string[]).size !== months.length) {
    throw new Error("Duplicate billing months in one payment are not allowed")
  }
  const paid = new Set(alreadyPaidMonths)
  const already = (months as string[]).filter((m) => paid.has(m))
  if (already.length > 0) {
    throw new Error(`Month already settled — a receipt exists for ${already.map(monthLabel).join(", ")}`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Collected amount must be greater than zero")
  }
  const expected = months.length * (monthlyFee || 0)
  if (expected <= 0) {
    throw new Error("This student has no monthly fee to collect")
  }
  if (amount !== expected) {
    throw new Error(
      `Amount must match the selected months — ${months.length} month${months.length === 1 ? "" : "s"} × ${formatINR(monthlyFee)} = ${formatINR(expected)}`
    )
  }
}

const ATT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Whole-batch attendance validation — a bad record must abort the entire register save. */
export function assertValidAttendanceRecords(
  records: { studentId?: string; date?: string; batch?: string; status?: string }[]
): void {
  if (!Array.isArray(records)) throw new Error("records array required")
  for (const r of records) {
    if (!r?.studentId) throw new Error("Each attendance record needs a student")
    if (!r?.date || !ATT_DATE_RE.test(r.date)) throw new Error("Attendance date must be in YYYY-MM-DD format")
    if (r?.status !== "Present" && r?.status !== "Absent") throw new Error("Attendance status must be Present or Absent")
  }
}

/** Upload allowlist — identical to the web /api/upload route (images + PDF, ≤ 10 MB). */
export const ALLOWED_UPLOAD_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"])
export const ALLOWED_UPLOAD_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"])
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Same rejects on both runtimes: size cap, extension allowlist AND MIME check
 * (the desktop previously checked the extension only, with no size cap).
 */
export function assertValidUpload(file: { name: string; type?: string; size: number }): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the 10 MB limit")
  }
  const safe = sanitizeFileName(file.name || "upload")
  const dot = safe.lastIndexOf(".")
  const ext = dot >= 0 ? safe.slice(dot).toLowerCase() : ""
  if (!ALLOWED_UPLOAD_EXT.has(ext) || (file.type && !ALLOWED_UPLOAD_MIME.has(file.type))) {
    throw new Error("Unsupported file type — allowed: PNG, JPG, WEBP or PDF")
  }
}

// ---------- Numbering ----------

/**
 * Highest numeric suffix across the given id strings (e.g. "PSA-2026-0007" → 7).
 * Non-numeric suffixes are ignored. Used so sequences never reuse a number
 * that still exists — unlike `count() + 1`, which breaks after deletions.
 */
function maxSuffix(values: string[]): number {
  let max = 0
  for (const v of values) {
    const tail = Number(v.split("-").pop())
    if (Number.isFinite(tail)) max = Math.max(max, tail)
  }
  return max
}

/**
 * Next free admission number: `PSA-<year>-NNNN` continuing the GLOBAL
 * sequence after the highest suffix among existing numbers (any year),
 * with a collision guard for exotic mixed-format datasets.
 */
export function nextAdmissionNo(existing: string[], year: number = new Date().getFullYear()): string {
  const used = new Set(existing)
  let seq = maxSuffix(existing) + 1
  let candidate = `PSA-${year}-${String(seq).padStart(4, "0")}`
  while (used.has(candidate)) {
    seq += 1
    candidate = `PSA-${year}-${String(seq).padStart(4, "0")}`
  }
  return candidate
}

/**
 * Next free receipt number: `RC-<YYYYMM>-NNNNN`, a global running sequence
 * (the month segment is the collection month, the counter never resets).
 * Deletion-safe for the same reason as nextAdmissionNo.
 */
export function nextReceiptNo(existing: string[], date: Date = new Date()): string {
  const used = new Set(existing)
  const prefix = `RC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`
  let seq = maxSuffix(existing) + 1
  let candidate = `${prefix}-${String(seq).padStart(5, "0")}`
  while (used.has(candidate)) {
    seq += 1
    candidate = `${prefix}-${String(seq).padStart(5, "0")}`
  }
  return candidate
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
  Mini: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-300 dark:border-sky-400/25",
  "Sub-Junior": "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/25",
  Junior: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/25",
  Youth: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:bg-yellow-300/10 dark:text-yellow-300 dark:border-yellow-400/25",
  Senior: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-300 dark:border-slate-400/25",
}

/** Bar gradient per age category (dashboard distribution chart) — mapped to the Watermelon Sorbet palette. */
export const CATEGORY_GRADIENTS: Record<string, string> = {
  Mini: "from-sky-400 to-sky-300",
  "Sub-Junior": "from-rose-400 to-rose-300",
  Junior: "from-emerald-400 to-emerald-300",
  Youth: "from-yellow-400 to-yellow-300",
  Senior: "from-slate-500 to-slate-400",
}

export const MEDAL_ICONS: Record<string, string> = {
  Gold: "🥇",
  Silver: "🥈",
  Bronze: "🥉",
  Participation: "🎖️",
  None: "•",
}
