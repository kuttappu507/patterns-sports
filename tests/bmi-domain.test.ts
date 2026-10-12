import { describe, expect, it } from "vitest"

// ===========================================================================
// BMI domain battery — v1.8.0 age-specific assessment.
//
// Pediatric expectations are INDEPENDENTLY VERIFIED against WHO's own
// reference material (not the implementation's own assumptions):
//   1. WHO anthroplus 1.1.0 R package test fixtures (WHO's expected z-scores)
//   2. The official WHO 2007 expanded-table SD columns (published BMI values
//      at exact z = −3…+3, downloaded from cdn.who.int 2026-10-12)
//   3. WHO percentile table consistency (P25 ↔ z = −0.6745)
// ===========================================================================

import {
  assessBmi,
  assessStudentBmi,
  ageInMonthsAt,
  ageMonthsLabel,
  bmiAtZ,
  bmiForAgeZScore,
  classifyAdultBmi,
  classifyBfaZ,
  computeBmi,
  interpolateLms,
  latestUsableMeasurement,
  localYMD,
  normalizeSex,
  weightBandFor,
  zToPercentile,
  ADULT_BMI_LABELS,
  WHO_BFA_LABELS,
  WHO_BFA_MAX_MONTHS_EXCLUSIVE,
  WHO_BFA_MIN_MONTHS,
  type MeasurementRow,
} from "../src/lib/psams/bmi"

// ---------- helpers ----------

const DAY = 86_400_000
function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY)
}
/** Weight that yields `bmi` for a 180 cm athlete. */
const w180 = (bmi: number) => Math.round(bmi * 3.24 * 1000) / 1000
const DOB_ADULT = "2000-01-01" // ~26 y at the 2026 measurement dates used below
const MEAS = "2026-07-15"

function adult(bmi: number) {
  return {
    weightKg: w180(bmi),
    heightCm: 180,
    dateOfBirth: DOB_ADULT,
    gender: "Male",
    measurementDate: MEAS,
  }
}

// ---------- formula ----------

describe("BMI formula (computeBmi)", () => {
  it("computes the known value with cm→m conversion", () => {
    // 70 kg, 175 cm → 70 / 1.75² = 22.857142857…
    const r = computeBmi(70, 175)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bmi).toBeCloseTo(22.8571428571, 10)
      expect(r.bmiRounded).toBeCloseTo(22.9, 10)
    }
  })

  it("keeps full precision and rounds only for display", () => {
    const r = computeBmi(80.87, 180)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.bmi).toBeCloseTo(24.9598765, 6)
      expect(r.bmiRounded).toBe(25)
    }
  })

  it("rejects zero, negative, NaN, Infinity and missing inputs with typed issues", () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const r = computeBmi(bad as number, 175)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.issues).toContain("invalid-weight")
    }
    for (const bad of [null, undefined]) {
      const r = computeBmi(bad as unknown as number, 175)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.issues).toContain("missing-weight")
    }
    for (const bad of [0, -170, NaN, Infinity]) {
      const r = computeBmi(70, bad as number)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.issues).toContain("invalid-height")
    }
    for (const bad of [null, undefined]) {
      const r = computeBmi(70, bad as unknown as number)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.issues).toContain("missing-height")
    }
  })

  it("refuses implausible (but not legitimate) measurements", () => {
    expect(computeBmi(1.5, 175).ok).toBe(false) // below 2 kg
    expect(computeBmi(70, 30).ok).toBe(false) // below 40 cm
    expect(computeBmi(95, 175).ok).toBe(true) // legit junior
    expect(computeBmi(120, 195).ok).toBe(true) // legit tall senior
    const r = computeBmi(1.5, 175)
    if (!r.ok) expect(r.issues).toEqual(["implausible-weight"])
  })
})

// ---------- age at measurement date ----------

describe("age at measurement date", () => {
  it("computes exact months via days/30.4375 (WHO convention)", () => {
    // 2020-01-01 → 2025-01-01 = 1827 days (leap days Feb 2020 AND Feb 2024)
    const r = ageInMonthsAt("2020-01-01", "2025-01-01")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.days).toBe(1827)
      expect(r.months).toBeCloseTo(1827 / 30.4375, 10)
    }
  })

  it("lands exactly on the same day-of-month across birthdays", () => {
    // 2011-05-14 → 2025-05-14 = 14 years with leap days 2012/16/20/24
    const r = ageInMonthsAt("2011-05-14", "2025-05-14")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.days).toBe(5114)
  })

  it("handles Date objects and ISO datetime strings", () => {
    const a = ageInMonthsAt(new Date(2020, 0, 1), new Date(2025, 0, 1))
    const b = ageInMonthsAt("2020-01-01T00:00:00.000Z", "2025-01-01")
    expect(a.ok && b.ok && Math.abs(a.months - b.months)).toBeLessThan(1 / 30.4375) // within a day
  })

  it("rejects missing/invalid DOB and DOB after the measurement date", () => {
    expect(ageInMonthsAt(null, MEAS).ok).toBe(false)
    expect(ageInMonthsAt("not-a-date", MEAS).ok).toBe(false)
    const r = ageInMonthsAt("2026-01-01", "2025-01-01")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues).toContain("dob-after-measurement")
  })

  it("labels ages", () => {
    expect(ageMonthsLabel(120)).toBe("10 y")
    expect(ageMonthsLabel(148.2)).toBe("12 y 4 m")
  })
})

// ---------- adult classification (20y+) ----------

describe("adult BMI classification — exact WHO cut-offs", () => {
  it("classifies the half-open boundaries correctly", () => {
    expect(classifyAdultBmi(18.4999)).toBe("underweight")
    expect(classifyAdultBmi(18.5)).toBe("healthy")
    expect(classifyAdultBmi(24.9999)).toBe("healthy")
    expect(classifyAdultBmi(25)).toBe("overweight")
    expect(classifyAdultBmi(29.9999)).toBe("overweight")
    expect(classifyAdultBmi(30)).toBe("obesity")
  })

  it("classifies using the UNROUNDED BMI, not the display value", () => {
    // 24.96 displays as "25.0" but stays healthy; 29.96 → "30.0" stays overweight
    const a = assessBmi(adult(24.96))
    expect(a.ok && a.classification).toBe(ADULT_BMI_LABELS.healthy)
    expect(a.ok && a.bmiRounded).toBe(25)
    const b = assessBmi(adult(29.96))
    expect(b.ok && b.classification).toBe(ADULT_BMI_LABELS.overweight)
    expect(b.ok && b.bmiRounded).toBe(30)
    const c = assessBmi(adult(17.96))
    expect(c.ok && c.classification).toBe(ADULT_BMI_LABELS.underweight)
    expect(c.ok && c.bmiRounded).toBe(18)
  })

  it("assesses adults through the full entry point", () => {
    const a = assessBmi(adult(22))
    expect(a.ok).toBe(true)
    if (a.ok) {
      expect(a.method).toBe("adult-20plus")
      expect(a.classificationKind).toBe("healthy")
      expect(a.zScore).toBeNull()
      expect(a.percentile).toBeNull()
      expect(a.flagged).toBe(false)
      expect(a.disclaimer).toMatch(/screening/i)
      expect(a.ageLabel).toBe("26 y 6 m")
    }
  })
})

// ---------- WHO 5–19 reference (independently verified) ----------

describe("WHO 2007 BMI-for-age — official fixtures", () => {
  it("reproduces the WHO anthroplus R package test values exactly", () => {
    // WHO's own test suite (anthroplus/tests/testthat/test-zscores.R):
    // girl, 60.32 months, 113.8 cm, 18.7 kg → zbfa = -0.58 (rounded to 2dp)
    const a = bmiForAgeZScore("girls", 60.32, 18.7 / (1.138 * 1.138))
    expect(a).not.toBeNull()
    expect(Math.round(a!.z * 100) / 100).toBe(-0.58)
    // girl, 60.911701 months, 113.6 cm, 20.5 kg → zbfa = +0.42
    const b = bmiForAgeZScore("girls", 60.911701, 20.5 / (1.136 * 1.136))
    expect(Math.round(b!.z * 100) / 100).toBe(0.42)
  })

  it("matches the published WHO SD columns (both sexes, sampled months)", () => {
    // Official expanded-table values (bmi-boys/girls-z-who-2007-exp.xlsx):
    // BMI at exactly z = -3 … +3 for the given month. The published columns
    // are rounded to 3 decimals → z must land within 0.02 of the target.
    const cases: Array<{ sex: "boys" | "girls"; month: number; z: number; bmi: number }> = [
      // Values below are the official WHO expanded-table columns
      // (bmi-boys/girls-z-who-2007-exp.xlsx, downloaded from cdn.who.int),
      // i.e. the BMI the WHO reference itself publishes at each z.
      { sex: "boys", month: 61, z: -3, bmi: 12.118 },
      { sex: "boys", month: 61, z: -2, bmi: 13.031 },
      { sex: "boys", month: 61, z: 0, bmi: 15.264 },
      { sex: "boys", month: 61, z: 1, bmi: 16.645 },
      { sex: "boys", month: 61, z: 2, bmi: 18.259 },
      { sex: "boys", month: 61, z: 3, bmi: 20.166 },
      { sex: "girls", month: 61, z: -3, bmi: 11.77 },
      { sex: "girls", month: 61, z: -2, bmi: 12.748 },
      { sex: "girls", month: 61, z: 0, bmi: 15.244 },
      { sex: "girls", month: 61, z: 1, bmi: 16.87 },
      { sex: "girls", month: 61, z: 2, bmi: 18.858 },
      { sex: "girls", month: 61, z: 3, bmi: 21.34 },
      { sex: "boys", month: 120, z: -3, bmi: 12.775 },
      { sex: "boys", month: 120, z: -2, bmi: 13.735 },
      { sex: "boys", month: 120, z: 1, bmi: 18.48 },
      { sex: "boys", month: 120, z: 2, bmi: 21.4 },
      { sex: "girls", month: 150, z: -2, bmi: 14.663 },
      { sex: "girls", month: 150, z: 1, bmi: 21.305 },
      { sex: "girls", month: 150, z: 2, bmi: 25.596 },
      { sex: "boys", month: 228, z: -2, bmi: 17.554 },
      { sex: "boys", month: 228, z: 1, bmi: 25.449 },
      { sex: "boys", month: 228, z: 2, bmi: 29.716 },
      { sex: "boys", month: 228, z: 3, bmi: 35.516 },
      { sex: "girls", month: 228, z: -2, bmi: 16.497 },
      { sex: "girls", month: 228, z: 1, bmi: 24.965 },
      { sex: "girls", month: 228, z: 2, bmi: 29.67 },
      { sex: "girls", month: 228, z: 3, bmi: 36.179 },
    ]
    for (const c of cases) {
      const res = bmiForAgeZScore(c.sex, c.month, c.bmi)
      expect(res, `${c.sex} m${c.month} z${c.z}`).not.toBeNull()
      expect(Math.abs(res!.z - c.z)).toBeLessThanOrEqual(0.02)
    }
  })

  it("matches the WHO percentile table (P25 ↔ z −0.6745, P01 = 0.1st ↔ z −3.0902)", () => {
    // Official perc expanded tables, month 100 columns (rounded to 3dp)
    const fixtures: Array<{ sex: "boys" | "girls"; p25: number; p01: number }> = [
      { sex: "boys", p25: 14.878, p01: 12.373 },
      { sex: "girls", p25: 14.687, p01: 11.862 },
    ]
    for (const f of fixtures) {
      const z25 = bmiForAgeZScore(f.sex, 100, f.p25)!.z
      const z01 = bmiForAgeZScore(f.sex, 100, f.p01)!.z
      expect(Math.abs(z25 - -0.6745)).toBeLessThanOrEqual(0.02)
      expect(Math.abs(z01 - -3.0902)).toBeLessThanOrEqual(0.02)
    }
  })

  it("round-trips z ↔ BMI exactly at full precision (both sexes, many months)", () => {
    for (const sex of ["boys", "girls"] as const) {
      for (const month of [60, 61, 73, 100, 121, 150, 180, 200, 228, 229 - 1]) {
        const lms = interpolateLms(sex, month)!
        for (const z of [-3, -2, -1, 0, 1, 2, 3]) {
          const bmi = bmiAtZ(lms, z)
          const back = bmiForAgeZScore(sex, month, bmi)!.z
          expect(Math.abs(back - z)).toBeLessThan(1e-9)
        }
      }
    }
  })

  it("uses the restricted WHO z-score beyond ±3 SD", () => {
    // Beyond +3: z = 3 + (y − SD3)/(SD3 − SD2) — verified against WHO's
    // published SD4neg column in scripts/who-validate.py. At exactly one
    // SD23-span past SD3 the z must be exactly 4.
    const lms = interpolateLms("boys", 61)!
    const sd2 = bmiAtZ(lms, 2)
    const sd3 = bmiAtZ(lms, 3)
    const at4 = sd3 + (sd3 - sd2) // one span beyond +3
    const z = bmiForAgeZScore("boys", 61, at4)!.z
    expect(Math.abs(z - 4)).toBeLessThan(1e-9)
  })
})

// ---------- WHO 5–19 classification & precedence ----------

describe("WHO 5–19 classification (cut-off precedence)", () => {
  it("classifies boundaries exactly per WHO definitions", () => {
    expect(classifyBfaZ(-3.0000001)).toBe("severe-thinness")
    expect(classifyBfaZ(-3)).toBe("thinness") // AT −3 is thinness, not severe
    expect(classifyBfaZ(-2.5)).toBe("thinness")
    expect(classifyBfaZ(-2)).toBe("normal-weight") // AT −2 is normal
    expect(classifyBfaZ(0)).toBe("normal-weight")
    expect(classifyBfaZ(1)).toBe("normal-weight") // AT +1 is normal
    expect(classifyBfaZ(1.5)).toBe("overweight")
    expect(classifyBfaZ(2)).toBe("overweight") // AT +2 is overweight
    expect(classifyBfaZ(2.0000001)).toBe("obesity")
  })

  it("severe thinness ⊂ thinness and obesity ⊂ overweight per the full assessment", () => {
    const lms = interpolateLms("boys", 100)!
    const mk = (z: number) => {
      const bmi = bmiAtZ(lms, z)
      const m2 = 1
      return assessBmi({
        weightKg: bmi * m2,
        heightCm: 100,
        dateOfBirth: "2017-10-01",
        gender: "Male",
        measurementDate: "2025-10-01", // ~96.7 months — inside range
      })
    }
    const severe = mk(-3.5)
    const thin = mk(-2.5)
    const obese = mk(2.5)
    const over = mk(1.5)
    expect(severe.ok && severe.classificationKind).toBe("severe-thinness")
    expect(thin.ok && thin.classificationKind).toBe("thinness")
    expect(obese.ok && obese.classificationKind).toBe("obesity")
    expect(over.ok && over.classificationKind).toBe("overweight")
    // subset checks on the labels
    expect(severe.ok && severe.classification).toBe(WHO_BFA_LABELS["severe-thinness"])
    expect(obese.ok && obese.classification).toBe(WHO_BFA_LABELS.obesity)
  })

  it("attaches z-score, percentile, age-at-measurement and reference metadata", () => {
    const a = assessBmi({
      weightKg: 41,
      heightCm: 155,
      dateOfBirth: "2013-09-02",
      gender: "Female",
      measurementDate: "2026-07-15", // ~154.4 months ≈ 12y10m
    })
    expect(a.ok).toBe(true)
    if (a.ok) {
      expect(a.method).toBe("who-5-19")
      expect(a.zScore).not.toBeNull()
      expect(a.percentile).not.toBeNull()
      expect(a.percentile!).toBeGreaterThanOrEqual(0)
      expect(a.percentile!).toBeLessThanOrEqual(100)
      expect(a.classification).not.toBeNull()
      expect(a.ageLabel).toMatch(/^12 y/)
      expect(a.reference.standard).toMatch(/WHO 2007/)
      expect(a.reference.version).toMatch(/WHO 2007/)
      expect(a.disclaimer).toMatch(/screening/i)
    }
  })

  it("flags biologically implausible |z| > 5 (WHO flag rule)", () => {
    const a = assessBmi({
      weightKg: 95,
      heightCm: 120,
      dateOfBirth: "2019-01-01",
      gender: "Male",
      measurementDate: "2025-01-05", // ~72 months
    })
    expect(a.ok && a.flagged).toBe(true)
    expect(a.ok && a.zScore!).toBeGreaterThan(5)
  })
})

// ---------- age boundaries ----------

describe("age boundaries between references", () => {
  it("under 5 y: BMI value without any category, explicit explanation, NO adult fallback", () => {
    // DOB 2020-01-01 measured 2025-01-05 → 1830 days = 60.13 months? No:
    // 2020-01-01 → 2025-01-05 = 1830 days → 60.13 months. Use 1825 days
    // (2025-01-01 minus one day… compute directly): DOB 2020-01-02,
    // measurement 2025-01-01 = 1825 days = 59.96 months < 60.
    const a = assessBmi({
      weightKg: 18,
      heightCm: 108,
      dateOfBirth: "2020-01-02",
      gender: "Male",
      measurementDate: "2025-01-01",
    })
    expect(a.ok).toBe(true)
    if (a.ok) {
      expect(a.method).toBe("under-5-unsupported")
      expect(a.classification).toBeNull()
      expect(a.classificationKind).toBeNull()
      expect(a.zScore).toBeNull()
      expect(a.disclaimer).toMatch(/under 5|not configured/i)
    }
  })

  it("the day before the 5th birthday is 59.99 WHO-months — unsupported until 60.0", () => {
    // 1827 days = the calendar 5th birthday = 60.02 WHO months (supported);
    // 1826 days (the day before) = 59.99 WHO months (unsupported — WHO
    // AnthroPlus reports NA there too; faithful to the reference).
    const onBirthday = ageInMonthsAt("2020-01-01", "2025-01-01")!
    expect(onBirthday.ok && onBirthday.months).toBeGreaterThanOrEqual(WHO_BFA_MIN_MONTHS)
    const dayBefore = ageInMonthsAt("2020-01-01", "2024-12-31")!
    expect(dayBefore.ok && dayBefore.months).toBeLessThan(WHO_BFA_MIN_MONTHS)
  })

  it("valid throughout 60.0 … < 229 months, adult from 229 (WHO exclusive upper bound)", () => {
    // 6970 days after 2007-01-01 = 2026-01-27 → 228.98 months → WHO 5–19
    const who = assessBmi({
      weightKg: 60,
      heightCm: 170,
      dateOfBirth: "2007-01-01",
      gender: "Male",
      measurementDate: localYMD(addDays(new Date(2007, 0, 1), 6970)),
    })
    expect(who.ok && who.method).toBe("who-5-19")
    // 6971 days → 229.01 months → adult bands
    const adultRes = assessBmi({
      weightKg: 60,
      heightCm: 170,
      dateOfBirth: "2007-01-01",
      gender: "Male",
      measurementDate: localYMD(addDays(new Date(2007, 0, 1), 6971)),
    })
    expect(adultRes.ok && adultRes.method).toBe("adult-20plus")
    // documented boundary constant
    expect(WHO_BFA_MAX_MONTHS_EXCLUSIVE).toBe(229)
  })

  it("historical measurements use the MEASUREMENT date, not today", () => {
    // Same athlete measured at 8 y and again at 15 y — each keeps its own age.
    const dob = "2011-05-14"
    const young = assessStudentBmi(
      { dateOfBirth: dob, gender: "Male", heightCm: 135, weightKg: 28 },
      "2019-05-14"
    )
    const older = assessStudentBmi(
      { dateOfBirth: dob, gender: "Male", heightCm: 170, weightKg: 58 },
      "2026-05-14"
    )
    expect(young.ok && young.method).toBe("who-5-19")
    expect(young.ok && young.ageLabel).toBe("8 y")
    expect(older.ok && older.ageLabel).toBe("15 y")
    // z-scores differ for the two historical points
    expect(young.ok && older.ok && young.zScore !== older.zScore).toBe(true)
  })
})

// ---------- sex handling: never a silent adult fallback ----------

describe("sex handling for minors", () => {
  it("missing or Other sex → BMI value with NO classification (no adult fallback)", () => {
    for (const gender of ["", "Other", "N/A", null]) {
      const a = assessBmi({
        weightKg: 41,
        heightCm: 155,
        dateOfBirth: "2013-09-02",
        gender,
        measurementDate: "2026-07-15",
      })
      expect(a.ok).toBe(true)
      if (a.ok) {
        expect(a.method).toBe("sex-unknown")
        expect(a.classification).toBeNull()
        expect(a.classificationKind).toBeNull()
        expect(a.zScore).toBeNull()
        expect(a.disclaimer).toMatch(/sex/i)
      }
    }
  })

  it("sex spellings normalize to the WHO reference sides", () => {
    expect(normalizeSex("Male")).toBe("boys")
    expect(normalizeSex("m")).toBe("boys")
    expect(normalizeSex(" MALE ")).toBe("boys")
    expect(normalizeSex("Female")).toBe("girls")
    expect(normalizeSex("F")).toBe("girls")
    expect(normalizeSex("girl")).toBe("girls")
    expect(normalizeSex("Other")).toBeNull()
    expect(normalizeSex("")).toBeNull()
  })

  it("every age 5–19 with known sex uses the WHO method — never adult bands", () => {
    // sweep the whole supported range
    const start = new Date(2007, 0, 1)
    for (let days = 1827; days < 6971; days += 37) {
      const md = localYMD(addDays(start, days))
      const a = assessBmi({
        weightKg: 45,
        heightCm: 158,
        dateOfBirth: "2007-01-01",
        gender: "Female",
        measurementDate: md,
      })
      expect(a.ok).toBe(true)
      if (a.ok) {
        expect(a.method).toBe("who-5-19")
        expect(a.classificationKind).not.toBe("healthy") // adult-only label
      }
    }
  })
})

// ---------- percentile ----------

describe("percentile derivation", () => {
  it("maps the standard normal correctly", () => {
    expect(Math.abs(zToPercentile(0) - 50)).toBeLessThan(1e-4)
    expect(Math.abs(zToPercentile(1.959964) - 97.5)).toBeLessThan(1e-3)
    expect(Math.abs(zToPercentile(-1.281552) - 10)).toBeLessThan(1e-3)
    expect(Math.abs(zToPercentile(2.326348) - 99)).toBeLessThan(1e-3)
  })

  it("is monotonic and clamped", () => {
    expect(zToPercentile(-4)).toBeGreaterThanOrEqual(0)
    expect(zToPercentile(6)).toBeLessThanOrEqual(100)
    let prev = -1
    for (let z = -3; z <= 3; z += 0.5) {
      expect(zToPercentile(z)).toBeGreaterThan(prev)
      prev = zToPercentile(z)
    }
  })
})

// ---------- weight band ----------

describe("age-aware healthy weight band", () => {
  it("adults get the classic 18.5–24.9 band", () => {
    const b = weightBandFor({ heightCm: 180, dateOfBirth: DOB_ADULT, gender: "Male", measurementDate: MEAS })
    expect(b).not.toBeNull()
    expect(b!.lo).toBe(60)
    expect(b!.hi).toBe(81)
    expect(b!.note).toMatch(/adult/)
  })

  it("juniors get the WHO −2…+1 SD band and the endpoints verify as BAZ −2/+1", () => {
    const md = "2026-07-15"
    const b = weightBandFor({ heightCm: 155, dateOfBirth: "2013-09-02", gender: "Female", measurementDate: md })
    expect(b).not.toBeNull()
    expect(b!.lo).toBeLessThan(b!.hi)
    expect(b!.note).toMatch(/WHO 2007/)
    // verify: weight at band edges → BAZ −2 / +1 for that age & sex
    const age = ageInMonthsAt("2013-09-02", md)
    expect(age.ok).toBe(true)
    if (age.ok) {
      const loBmi = b!.lo / (1.55 * 1.55)
      const hiBmi = b!.hi / (1.55 * 1.55)
      const zLo = bmiForAgeZScore("girls", age.months, loBmi)!.z
      const zHi = bmiForAgeZScore("girls", age.months, hiBmi)!.z
      expect(Math.abs(zLo - -2)).toBeLessThanOrEqual(0.15) // band rounded to whole kg
      expect(Math.abs(zHi - 1)).toBeLessThanOrEqual(0.15)
    }
  })

  it("returns null for unsupported cases (under-5, unknown sex, missing height)", () => {
    expect(weightBandFor({ heightCm: 108, dateOfBirth: "2020-01-02", gender: "Male", measurementDate: "2025-01-01" })).toBeNull()
    expect(weightBandFor({ heightCm: 155, dateOfBirth: "2013-09-02", gender: "Other", measurementDate: "2026-07-15" })).toBeNull()
    expect(weightBandFor({ heightCm: null, dateOfBirth: "2013-09-02", gender: "Female", measurementDate: "2026-07-15" })).toBeNull()
  })
})

// ---------- measurement history helpers ----------

describe("latest usable measurement", () => {
  it("picks the newest row with BOTH height and weight", () => {
    const rows: MeasurementRow[] = [
      { date: "2026-01-10", heightCm: 150, weightKg: 40 },
      { date: "2026-03-01", heightCm: 152, weightKg: null }, // incomplete — skipped
      { date: "2026-02-01", heightCm: 151, weightKg: 41 },
    ]
    expect(latestUsableMeasurement(rows)!.date).toBe("2026-02-01")
  })

  it("returns null when no complete row exists", () => {
    expect(latestUsableMeasurement([{ date: "2026-03-01", heightCm: 152, weightKg: null }])).toBeNull()
    expect(latestUsableMeasurement([])).toBeNull()
  })
})
