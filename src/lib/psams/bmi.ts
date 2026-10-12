// ============================================================
// PS-AMS :: Authoritative BMI assessment module (v1.8.0).
//
// SINGLE source of truth for every BMI number and label in the app —
// forms, profile, fitness card, reports, exports, prints. Nothing else
// may compute or classify BMI (no duplicate thresholds anywhere).
//
// Method (offline — all reference data bundled in who2007-bmi-data.ts):
//
//   1. BMI = weight(kg) / height(m)²   — full precision kept internally;
//      rounding to 1 decimal happens ONLY for display, classification
//      always uses the unrounded value.
//
//   2. Age ≥ 20y (≥ 229 months — see "Age boundaries"): WHO adult
//      screening bands, half-open intervals:
//        < 18.5 underweight · 18.5–<25 healthy · 25–<30 overweight · ≥30 obesity.
//
//   3. Ages 5–19 (60 ≤ months < 229): WHO 2007 BMI-for-age (BAZ) using the
//      official sex-specific LMS reference. Z-score per the LMS method with
//      WHO's restricted extension beyond ±3 SD — the exact algorithm WHO's
//      own anthro/anthroplus reference implementations use:
//        z = ((bmi/M)^L − 1)/(S·L)
//        beyond ±3 SD: z = ±3 + (bmi − SD±3)/(SD±3 ∓ SD±2)
//      L/M/S are linearly interpolated between trunc(months) and
//      trunc(months)+1 exactly like WHO AnthroPlus does.
//      Classification (WHO 5–19 cut-offs):
//        z < −3 severe thinness · −3 ≤ z < −2 thinness ·
//        −2 ≤ z ≤ +1 normal weight · +1 < z ≤ +2 overweight · z > +2 obesity.
//      Percentile = Φ(z) (standard normal CDF), shown where supported.
//
//   4. Under 5y (< 60 months): NO category is assigned — the WHO 0–5 Child
//      Growth Standards are not bundled; the BMI value is shown with an
//      explicit explanation. NEVER falls back to adult or 5–19 thresholds.
//
//   5. Age at the MEASUREMENT date (not today) drives reference selection,
//      so historical measurements keep their correct assessment forever.
//
// Validation references (verified 2026-10-12, see scripts/who-validate.py):
//   - WHO anthroplus 1.1.0 test fixtures reproduce exactly (girl 60.32mo
//     113.8cm/18.7kg → BAZ −0.58; 60.9117mo 113.6cm/20.5kg → BAZ +0.42)
//   - LMS values identical (≤5e-5) across WHO's two published distributions
//   - round-trip against WHO published −3…+3 SD columns ≤ 0.0005, and the
//     restricted method reproduces the published SD4neg column (≤ 0.0005)
// ============================================================

import {
  WHO2007_BMI_BOYS,
  WHO2007_BMI_GIRLS,
  WHO2007_BMI_DATA_VERSION,
  type WhoLms,
} from "./who2007-bmi-data"
import { parseLocalDate } from "./domain"

// ---------- reference metadata ----------

export const BMI_REFERENCE = {
  adult: {
    standard: "WHO adult BMI classification",
    version: "WHO adult BMI cut-offs (18.5 / 25 / 30), current WHO guidance",
  },
  pediatric: {
    standard: "WHO 2007 BMI-for-age (5–19 years)",
    version: WHO2007_BMI_DATA_VERSION,
  },
} as const

/**
 * Configurable plausibility bounds — values outside are refused as data
 * entry errors instead of producing a nonsensical assessment. Bounds are
 * generous on purpose (a legit athlete must never be rejected).
 */
export const BMI_PLAUSIBILITY = {
  weightKg: [2, 300] as const,
  heightCm: [40, 272] as const,
}

/** Mean month length used by WHO AnthroPlus to convert days → months. */
const DAYS_PER_MONTH = 30.4375 // 365.25 / 12

// ---------- input issues (typed — never silent) ----------

export type BmiIssue =
  | "missing-weight"
  | "missing-height"
  | "invalid-weight"
  | "invalid-height"
  | "implausible-weight"
  | "implausible-height"
  | "missing-dob"
  | "invalid-dob"
  | "dob-after-measurement"
  | "missing-measurement-date"

export interface BmiFailure {
  ok: false
  issues: BmiIssue[]
  message: string
}

const ISSUE_TEXT: Record<BmiIssue, string> = {
  "missing-weight": "weight is missing",
  "missing-height": "height is missing",
  "invalid-weight": "weight must be a positive number",
  "invalid-height": "height must be a positive number",
  "implausible-weight": `weight is outside the plausible range ${BMI_PLAUSIBILITY.weightKg[0]}–${BMI_PLAUSIBILITY.weightKg[1]} kg`,
  "implausible-height": `height is outside the plausible range ${BMI_PLAUSIBILITY.heightCm[0]}–${BMI_PLAUSIBILITY.heightCm[1]} cm`,
  "missing-dob": "date of birth is missing",
  "invalid-dob": "date of birth is not a valid date",
  "dob-after-measurement": "date of birth is after the measurement date",
  "missing-measurement-date": "measurement date is missing",
}

function fail(issues: BmiIssue[]): BmiFailure {
  return {
    ok: false,
    issues,
    message: `BMI cannot be assessed — ${issues.map((i) => ISSUE_TEXT[i]).join("; ")}.`,
  }
}

// ---------- core measurement helpers ----------

/** Validate a body measurement number: finite, > 0, inside plausibility. */
function checkMeasurement(
  value: number | string | null | undefined,
  missing: BmiIssue,
  invalid: BmiIssue,
  implausible: BmiIssue,
  [lo, hi]: readonly [number, number]
): BmiIssue | null {
  if (value === null || value === undefined || value === "") return missing
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return invalid
  if (n < lo || n > hi) return implausible
  return null
}

export interface BmiValueOk {
  ok: true
  /** Full-precision BMI (kg/m²) — classification uses THIS, never the rounded value. */
  bmi: number
  /** Rounded display value (1 decimal). */
  bmiRounded: number
}

/**
 * BMI formula with unit conversion (height given in cm, matching the app's
 * storage units). Rejects missing, non-finite, zero/negative and implausible
 * inputs with typed issues — never returns NaN/Infinity.
 */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined
): BmiValueOk | BmiFailure {
  const w = checkMeasurement(weightKg, "missing-weight", "invalid-weight", "implausible-weight", BMI_PLAUSIBILITY.weightKg)
  const h = checkMeasurement(heightCm, "missing-height", "invalid-height", "implausible-height", BMI_PLAUSIBILITY.heightCm)
  const issues = [w, h].filter((i): i is BmiIssue => i !== null)
  if (issues.length > 0) return fail(issues)
  const metres = (heightCm as number) / 100
  const bmi = (weightKg as number) / (metres * metres)
  if (!Number.isFinite(bmi) || bmi <= 0) return fail(["invalid-weight", "invalid-height"])
  return { ok: true, bmi, bmiRounded: Math.round(bmi * 10) / 10 }
}

// ---------- age at a date ----------

export interface AgeAtOk {
  ok: true
  /** Exact age in months at the measurement date (days / 30.4375, WHO convention). */
  months: number
  /** Whole days between the dates. */
  days: number
}

/**
 * Exact age in months at the measurement date, from date of birth.
 * Calendar-day difference (no timezone/DST drift), months = days / 30.4375 —
 * the WHO AnthroPlus convention, so table lookups line up with WHO software.
 */
export function ageInMonthsAt(
  dateOfBirth: string | Date | null | undefined,
  measurementDate: string | Date
): AgeAtOk | BmiFailure {
  const issues: BmiIssue[] = []
  if (dateOfBirth === null || dateOfBirth === undefined || dateOfBirth === "") issues.push("missing-dob")
  if (measurementDate === null || measurementDate === undefined || measurementDate === "") {
    issues.push("missing-measurement-date")
  }
  if (issues.length > 0) return fail(issues)

  const dob = parseLocalDate(dateOfBirth as string | Date)
  const md = parseLocalDate(measurementDate)
  if (!dob) issues.push("invalid-dob")
  if (!md) issues.push("missing-measurement-date")
  if (issues.length > 0) return fail(issues)

  const dayMs = 86_400_000
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((utc(md as Date) - utc(dob as Date)) / dayMs)
  if (days < 0) return fail(["dob-after-measurement"])
  return { ok: true, months: days / DAYS_PER_MONTH, days }
}

/** "12 y 4 m" style label for an age in months. */
export function ageMonthsLabel(months: number): string {
  const y = Math.floor(months / 12)
  const m = Math.round(months - y * 12)
  return m === 0 ? `${y} y` : `${y} y ${m} m`
}

// ---------- sex normalization ----------

/** "boys" | "girls" — the WHO reference sides. null = reference not applicable. */
export type WhoSex = "boys" | "girls"

export function normalizeSex(gender?: string | null): WhoSex | null {
  const g = String(gender ?? "")
    .trim()
    .toLowerCase()
  if (["male", "m", "boys", "boy", "1"].includes(g)) return "boys"
  if (["female", "f", "girls", "girl", "2"].includes(g)) return "girls"
  return null // "" | "Other" | anything unknown — handled explicitly, never guessed
}

// ---------- WHO 2007 LMS machinery ----------

const TABLES: Record<WhoSex, readonly WhoLms[]> = { boys: WHO2007_BMI_BOYS, girls: WHO2007_BMI_GIRLS }

const LAST_MONTH = TABLES.boys[TABLES.boys.length - 1][0] // 229

/** WHO AnthroPlus valid range for BMI-for-age: 60 ≤ months < 229. */
export const WHO_BFA_MIN_MONTHS = 60
export const WHO_BFA_MAX_MONTHS_EXCLUSIVE = LAST_MONTH // 229

function rowAt(sex: WhoSex, month: number): WhoLms | null {
  const rows = TABLES[sex]
  const idx = month - rows[0][0]
  return rows[idx] ?? null
}

export interface LmsTriple {
  l: number
  m: number
  s: number
}

/**
 * WHO AnthroPlus interpolation: linear blend of the LMS triplets at
 * trunc(months) and trunc(months)+1. (WHO's own zscore_indicator().)
 */
export function interpolateLms(sex: WhoSex, ageMonths: number): LmsTriple | null {
  const low = Math.trunc(ageMonths)
  const diff = ageMonths - low
  const a = rowAt(sex, low)
  const b = rowAt(sex, low + 1)
  if (!a || !b) return null
  const mix = (x: number, y: number) => x + diff * (y - x)
  return { l: mix(a[1], b[1]), m: mix(a[2], b[2]), s: mix(a[3], b[3]) }
}

/** BMI value at an exact z-score for interpolated L/M/S (LMS inverse). */
export function bmiAtZ(lms: LmsTriple, z: number): number {
  const { l, m, s } = lms
  if (Math.abs(l) < 1e-9) return m * Math.exp(s * z)
  return m * Math.pow(1 + l * s * z, 1 / l)
}

/**
 * WHO BMI-for-age z-score (BAZ) — plain LMS with WHO's restricted
 * adjustment beyond ±3 SD (identical to WHO anthro/anthroplus).
 * Returns null when the age is outside the bundled reference.
 */
export function bmiForAgeZScore(sex: WhoSex, ageMonths: number, bmi: number): { z: number; lms: LmsTriple } | null {
  if (!(ageMonths >= WHO_BFA_MIN_MONTHS && ageMonths < WHO_BFA_MAX_MONTHS_EXCLUSIVE)) return null
  const lms = interpolateLms(sex, ageMonths)
  if (!lms || !Number.isFinite(bmi) || bmi <= 0) return null
  const { l, m, s } = lms
  const sd = (k: number) =>
    Math.abs(l) < 1e-9 ? m * Math.exp(s * k) : m * Math.pow(1 + l * s * k, 1 / l)
  let z: number
  if (Math.abs(l) < 1e-9) {
    z = Math.log(bmi / m) / s
  } else {
    z = ((bmi / m) ** l - 1) / (s * l)
  }
  if (z > 3) {
    const sd3 = sd(3)
    z = 3 + (bmi - sd3) / (sd3 - sd(2))
  } else if (z < -3) {
    const sd3n = sd(-3)
    z = -3 + (bmi - sd3n) / (sd(-2) - sd3n)
  }
  return { z, lms }
}

/**
 * Standard-normal CDF Φ(z) → percentile 0–100. Abramowitz & Stegun 7.1.26
 * erfc form (absolute error < 1.5e-7 — far below the displayed precision).
 */
export function zToPercentile(z: number): number {
  // Φ(z) = 0.5 · erfc(−z/√2). The A&S 7.1.26 rational form approximates
  // erfc(x) for x ≥ 0; negative arguments use erfc(−x) = 2 − erfc(x).
  const x = -z / Math.SQRT2
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.5 * ax)
  const erfcPos =
    t *
    Math.exp(
      -ax * ax -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    )
  const erfc = x < 0 ? 2 - erfcPos : erfcPos
  const phi = 0.5 * erfc
  return Math.min(100, Math.max(0, phi * 100))
}

// ---------- classification ----------

/** Typed WHO adult bands (20y+), half-open — exactly per WHO cut-offs. */
export type AdultBmiKind = "underweight" | "healthy" | "overweight" | "obesity"

export function classifyAdultBmi(bmi: number): AdultBmiKind {
  if (bmi < 18.5) return "underweight"
  if (bmi < 25) return "healthy"
  if (bmi < 30) return "overweight"
  return "obesity"
}

export const ADULT_BMI_LABELS: Record<AdultBmiKind, string> = {
  underweight: "Underweight",
  healthy: "Healthy-weight range",
  overweight: "Overweight",
  obesity: "Obesity range",
}

/** Typed WHO 5–19y BMI-for-age bands (subset-correct, ε-guarded boundaries). */
export type WhoBfaKind = "severe-thinness" | "thinness" | "normal-weight" | "overweight" | "obesity"

export const WHO_BFA_LABELS: Record<WhoBfaKind, string> = {
  "severe-thinness": "Severe thinness",
  thinness: "Thinness",
  "normal-weight": "Normal weight",
  overweight: "Overweight",
  obesity: "Obesity",
}

const Z_EPS = 1e-9 // boundary values sit ON the cut-off, not beyond it

export function classifyBfaZ(z: number): WhoBfaKind {
  if (z < -3 - Z_EPS) return "severe-thinness"
  if (z < -2 - Z_EPS) return "thinness"
  if (z > 2 + Z_EPS) return "obesity"
  if (z > 1 + Z_EPS) return "overweight"
  return "normal-weight"
}

// ---------- the single assessment entry point ----------

export type BmiMethod = "who-5-19" | "adult-20plus" | "under-5-unsupported" | "sex-unknown"

export interface BmiAssessmentOk {
  ok: true
  /** Full-precision BMI (kg/m²). */
  bmi: number
  /** 1-decimal display value. */
  bmiRounded: number
  /** Which methodology produced this assessment. */
  method: BmiMethod
  /** Age at the MEASUREMENT date. */
  ageMonths: number
  ageLabel: string
  /** Human classification label, or null when not supported. */
  classification: string | null
  classificationKind: AdultBmiKind | WhoBfaKind | null
  /** BMI-for-age z-score (WHO 5–19 only). */
  zScore: number | null
  /** Percentile 0–100 derived from the z-score (WHO 5–19 only). */
  percentile: number | null
  /** WHO biologically-implausible flag (|z| > 5). */
  flagged: boolean
  reference: { standard: string; version: string }
  /** Screening disclaimer shown next to the result. */
  disclaimer: string
}

export type BmiAssessment = BmiAssessmentOk | BmiFailure

const SCREENING_NOTE =
  "BMI is a screening measure, not a diagnosis — in muscular athletes it can overestimate body fat."

/** Shared disclaimer text for printed/exported documents. */
export const BMI_SCREENING_NOTE = SCREENING_NOTE

export interface BmiAssessInput {
  weightKg: number | null | undefined
  heightCm: number | null | undefined
  dateOfBirth: string | Date | null | undefined
  /** Recorded sex — "Male"/"Female" (case-insensitive); "" / "Other" = not classifiable. */
  gender?: string | null
  /** The date the height/weight was measured (defaults to today). */
  measurementDate?: string | Date
}

/**
 * Assess one athlete measurement with the age-appropriate WHO reference.
 * Age is taken at the measurement date (never "current age"), so historical
 * measurements stay valid. Minors are NEVER classified with adult bands.
 */
export function assessBmi(input: BmiAssessInput): BmiAssessment {
  const measurementDate = input.measurementDate ?? new Date()
  const age = ageInMonthsAt(input.dateOfBirth, measurementDate)
  if (!age.ok) return age
  const bmiRes = computeBmi(input.weightKg, input.heightCm)
  if (!bmiRes.ok) return bmiRes

  const base = {
    bmi: bmiRes.bmi,
    bmiRounded: bmiRes.bmiRounded,
    ageMonths: age.months,
    ageLabel: ageMonthsLabel(age.months),
  }

  // Under 5y — no bundled reference, no category, explicit explanation.
  if (age.months < WHO_BFA_MIN_MONTHS) {
    return {
      ...base,
      ok: true,
      method: "under-5-unsupported",
      classification: null,
      classificationKind: null,
      zScore: null,
      percentile: null,
      flagged: false,
      reference: { standard: "— (no WHO 0–5 reference bundled)", version: "—" },
      disclaimer:
        "The athlete is under 5 years old. WHO's Child Growth Standards (0–5 y) are not configured, so the BMI value is shown without a growth category — it must not be judged with adult or 5–19-year thresholds. " +
        SCREENING_NOTE,
    }
  }

  const sex = normalizeSex(input.gender)

  // WHO 5–19 BMI-for-age — the reference ends at 229 months (WHO AnthroPlus
  // exclusive upper bound), i.e. adult classification starts there.
  if (age.months < WHO_BFA_MAX_MONTHS_EXCLUSIVE) {
    if (sex === null) {
      return {
        ...base,
        ok: true,
        method: "sex-unknown",
        classification: null,
        classificationKind: null,
        zScore: null,
        percentile: null,
        flagged: false,
        reference: { standard: BMI_REFERENCE.pediatric.standard, version: BMI_REFERENCE.pediatric.version },
        disclaimer:
          "BMI-for-age is sex-specific — record the athlete's sex (Male/Female) on the profile to get the WHO 5–19-year classification. " +
          SCREENING_NOTE,
      }
    }
    const res = bmiForAgeZScore(sex, age.months, bmiRes.bmi)
    if (!res) {
      // Unreachable by construction (range-checked above) — kept as a safe
      // guard so a data problem can never silently produce an adult band.
      return {
        ...base,
        ok: true,
        method: "sex-unknown",
        classification: null,
        classificationKind: null,
        zScore: null,
        percentile: null,
        flagged: false,
        reference: { standard: BMI_REFERENCE.pediatric.standard, version: BMI_REFERENCE.pediatric.version },
        disclaimer: "The WHO reference data for this age is unavailable. " + SCREENING_NOTE,
      }
    }
    const kind = classifyBfaZ(res.z)
    return {
      ...base,
      ok: true,
      method: "who-5-19",
      classification: WHO_BFA_LABELS[kind],
      classificationKind: kind,
      zScore: res.z,
      percentile: zToPercentile(res.z),
      flagged: Math.abs(res.z) > 5,
      reference: { standard: `${BMI_REFERENCE.pediatric.standard} — ${sex === "boys" ? "boys" : "girls"}`, version: BMI_REFERENCE.pediatric.version },
      disclaimer: `Age-specific WHO 2007 BMI-for-age (${sex === "boys" ? "boys" : "girls"}, 5–19 y). ` + SCREENING_NOTE,
    }
  }

  // 229 months (~19 y 1 m) and older — WHO adult screening bands.
  const kind = classifyAdultBmi(bmiRes.bmi)
  return {
    ...base,
    ok: true,
    method: "adult-20plus",
    classification: ADULT_BMI_LABELS[kind],
    classificationKind: kind,
    zScore: null,
    percentile: null,
    flagged: false,
    reference: { standard: BMI_REFERENCE.adult.standard, version: BMI_REFERENCE.adult.version },
    disclaimer: "Adult WHO BMI screening bands (applied from 19 y 1 m, where the WHO 5–19-year reference ends). " + SCREENING_NOTE,
  }
}

// ---------- healthy weight band, age-aware ----------

/**
 * Weight range that keeps the athlete inside the reference's healthy zone:
 *  - WHO 5–19y: weight between the thinness (−2 SD) and overweight (+1 SD)
 *    BMI-for-age thresholds for their exact age and sex (WHO cut-offs).
 *  - 20y+: the classic adult BMI 18.5–24.9 band.
 *  - Under 5y / unknown sex: null (unsupported — never guessed).
 */
export function weightBandFor(input: {
  heightCm: number | null | undefined
  dateOfBirth: string | Date | null | undefined
  gender?: string | null
  measurementDate?: string | Date
}): { lo: number; hi: number; note: string } | null {
  const age = ageInMonthsAt(input.dateOfBirth, input.measurementDate ?? new Date())
  if (!age.ok) return null
  const heightCm = Number(input.heightCm)
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null

  if (age.months >= WHO_BFA_MAX_MONTHS_EXCLUSIVE) {
    const m2 = (heightCm / 100) ** 2
    return {
      lo: Math.round(18.5 * m2),
      hi: Math.round(24.9 * m2),
      note: "adult BMI 18.5–24.9 scale",
    }
  }
  if (age.months < WHO_BFA_MIN_MONTHS) return null
  const sex = normalizeSex(input.gender)
  if (sex === null) return null
  const lms = interpolateLms(sex, age.months)
  if (!lms) return null
  const m2 = (heightCm / 100) ** 2
  return {
    lo: Math.round(bmiAtZ(lms, -2) * m2),
    hi: Math.round(bmiAtZ(lms, 1) * m2),
    note: "BMI-for-age −2 SD to +1 SD (WHO 2007)",
  }
}

// ---------- measurement-history helpers ----------

export interface MeasurementRow {
  date: string // "YYYY-MM-DD" local measurement date
  heightCm?: number | null
  weightKg?: number | null
  source?: string | null
}

/**
 * The most recent measurement row that carries BOTH height and weight —
 * the row the "current" assessment is computed from. Falls back to the
 * student's own fields when no usable history row exists.
 */
export function latestUsableMeasurement(rows: MeasurementRow[]): MeasurementRow | null {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return sorted.find((r) => r.heightCm != null && r.weightKg != null) ?? null
}

/** "YYYY-MM-DD" of a Date in LOCAL time (no UTC off-by-one). */
export function localYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Assessment for a Student-shaped record at an explicit measurement date. */
export function assessStudentBmi(
  student: {
    dateOfBirth: string | Date
    gender?: string | null
    heightCm?: number | null
    weightKg?: number | null
  },
  measurementDate: string | Date
): BmiAssessment {
  return assessBmi({
    weightKg: student.weightKg,
    heightCm: student.heightCm,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    measurementDate,
  })
}

// ---------- presentation (one shared UI mapping for every surface) ----------

export interface BmiPresentation {
  /** Display value, 1 decimal — "17.3" — or "—" when not computable. */
  value: string
  /** Classification label or a short reason when unsupported. */
  label: string
  /** Tailwind text colour for the value. */
  color: string
  /** Longer note: method, z/percentile, reference — safe to show as subline. */
  hint: string
}

const KIND_COLORS: Record<string, string> = {
  underweight: "text-amber-300",
  healthy: "text-emerald-400",
  "healthy-weight": "text-emerald-400",
  overweight: "text-amber-300",
  obesity: "text-red-400",
  "severe-thinness": "text-red-400",
  thinness: "text-amber-300",
  "normal-weight": "text-emerald-400",
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

/**
 * One shared mapping from an assessment to what every screen renders —
 * forms, profile card, reports, exports and prints all show the same
 * value + label + hint, so the app can never disagree with itself.
 */
export function presentBmi(a: BmiAssessment): BmiPresentation {
  if (!a.ok) {
    // short, friendly reasons for the common form states
    if (a.issues.every((i) => i === "missing-weight" || i === "missing-height")) {
      return { value: "—", label: "enter height & weight", color: "text-muted-foreground", hint: a.message }
    }
    if (a.issues.includes("missing-dob") || a.issues.includes("invalid-dob") || a.issues.includes("missing-measurement-date")) {
      return { value: "—", label: "add date of birth", color: "text-muted-foreground", hint: a.message }
    }
    return { value: "—", label: "check measurements", color: "text-muted-foreground", hint: a.message }
  }

  const value = fmt1(a.bmi)
  if (a.method === "who-5-19" && a.classification && a.classificationKind) {
    const pct = a.percentile != null ? formatPercentile(a.percentile) : null
    const z = a.zScore != null ? fmt1(a.zScore) : null
    return {
      value,
      label: a.classification,
      color: KIND_COLORS[a.classificationKind] ?? "text-muted-foreground",
      hint: `WHO 5–19 BMI-for-age · BAZ ${z} · ${pct} percentile · age ${a.ageLabel}${a.flagged ? " · IMPLAUSIBLE (|z|>5)" : ""}`,
    }
  }
  if (a.method === "adult-20plus" && a.classification && a.classificationKind) {
    return {
      value,
      label: a.classification,
      color: KIND_COLORS[a.classificationKind] ?? "text-muted-foreground",
      hint: `Adult WHO bands · age ${a.ageLabel}`,
    }
  }
  return {
    value,
    label: "no category",
    color: "text-muted-foreground",
    hint: a.disclaimer,
  }
}

/** "28th" / "50th" / "62nd" — 0–99 percentile with an ordinal suffix. */
export function formatPercentile(p: number): string {
  const v = Math.round(p)
  if (v <= 0) return "<1st"
  if (v >= 100) return ">99th"
  const rem10 = v % 10
  const rem100 = v % 100
  const suffix =
    rem10 === 1 && rem100 !== 11 ? "st" : rem10 === 2 && rem100 !== 12 ? "nd" : rem10 === 3 && rem100 !== 13 ? "rd" : "th"
  return `${v}${suffix}`
}

/**
 * Flat report/export fields for one student (assessment at today's date —
 * report tables show the CURRENT recorded values). Used by the reports
 * table, Excel, PDF and print roster so every document shows the same
 * age-specific result.
 */
export function bmiReportFields(student: {
  dateOfBirth: string | Date
  gender?: string | null
  heightCm?: number | null
  weightKg?: number | null
}): { value: string; classification: string; combined: string } {
  const a = assessStudentBmi(student, new Date())
  if (!a.ok) return { value: "—", classification: "—", combined: "—" }
  const value = fmt1(a.bmi)
  const classification = a.classification ?? "—"
  return { value, classification, combined: classification === "—" ? value : `${value} (${classification})` }
}

/**
 * The complete assessment for an athlete's CURRENT state, preferring the
 * latest dated measurement row over the (overwritten) Student fields.
 * Every surface uses this so the displayed measurement date and values
 * always come from the same source.
 */
export function assessCurrentBmi(
  student: {
    dateOfBirth: string | Date
    gender?: string | null
    heightCm?: number | null
    weightKg?: number | null
  },
  history: MeasurementRow[]
): BmiAssessment {
  const latest = latestUsableMeasurement(history)
  if (latest) {
    return assessBmi({
      weightKg: latest.weightKg,
      heightCm: latest.heightCm,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      measurementDate: latest.date,
    })
  }
  return assessBmi({
    weightKg: student.weightKg,
    heightCm: student.heightCm,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    measurementDate: new Date(),
  })
}
