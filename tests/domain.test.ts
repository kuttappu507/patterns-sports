import { describe, expect, it } from "vitest"
import {
  computeAge,
  computeFeeStatus,
  classifyFeeCycle,
  assertValidPayment,
  assertValidStudentInput,
  assertValidAttendanceRecords,
  assertValidUpload,
  ACADEMY_ADDRESS,
  DEFAULT_SETTINGS,
  hasPaidCurrentMonth,
  isSafeMediaPath,
  monthKey,
  monthsBetween,
  nextAdmissionNo,
  nextReceiptNo,
  parsePaidMonths,
  sanitizeFileName,
  phoneDigits,
  intOnly,
  decimalOnly,
  verticalJumpRating,
  spikeClearance,
  reachRatio,
  trainingAge,
  healthyWeightBand,
} from "../src/lib/psams/domain"
import { DEMO_SETTINGS } from "../src/lib/psams/demo-data"
import { toIntlPhone, waLink } from "../src/lib/psams/whatsapp"

// ---------------------------------------------------------------------------
// Fee ledger (billing starts the month AFTER registration; defaulter =
// overdue by MORE THAN one billing month)
// ---------------------------------------------------------------------------

describe("computeFeeStatus", () => {
  const student = { id: "s1", registrationDate: "2026-01-15", monthlyFee: 500 }

  it("treats the registration month as complimentary (billing starts next month)", () => {
    const now = new Date("2026-02-10")
    const st = computeFeeStatus(student, [], now)
    expect(st.pendingMonths).toEqual(["2026-02"])
    expect(st.overdueMonths).toEqual([]) // current month is not yet overdue
    expect(st.isDefaulter).toBe(false)
    expect(st.dueAmount).toBe(500)
  })

  it("accumulates unpaid months up to the current month", () => {
    const now = new Date("2026-04-10")
    const st = computeFeeStatus(student, [], now)
    expect(st.pendingMonths).toEqual(["2026-02", "2026-03", "2026-04"])
    expect(st.overdueMonths).toEqual(["2026-02", "2026-03"]) // current month excluded
    expect(st.dueAmount).toBe(1500)
  })

  it("flags defaulters only when overdue by MORE than one month", () => {
    const now = new Date("2026-04-10")

    // paid through March → only the current month is pending → not a defaulter
    const paidThroughMarch = computeFeeStatus(
      student,
      [{ months: '["2026-02","2026-03"]', paymentDate: "2026-03-05" }],
      now
    )
    expect(paidThroughMarch.pendingMonths).toEqual(["2026-04"])
    expect(paidThroughMarch.overdueMonths).toEqual([])
    expect(paidThroughMarch.isDefaulter).toBe(false)
    expect(paidThroughMarch.dueAmount).toBe(500)

    // paid only February → exactly ONE month (March) behind → not a defaulter
    const oneBehind = computeFeeStatus(
      student,
      [{ months: '["2026-02"]', paymentDate: "2026-02-05" }],
      now
    )
    expect(oneBehind.overdueMonths).toEqual(["2026-03"])
    expect(oneBehind.pendingMonths).toEqual(["2026-03", "2026-04"])
    expect(oneBehind.isDefaulter).toBe(false) // more-than-one rule
    expect(oneBehind.dueAmount).toBe(1000)

    // nothing paid at all → two+ months overdue → defaulter
    const broke = computeFeeStatus(student, [], now)
    expect(broke.overdueMonths).toEqual(["2026-02", "2026-03"])
    expect(broke.isDefaulter).toBe(true)
  })

  it("merges multi-month receipts into the paid set", () => {
    const now = new Date("2026-06-10")
    const st = computeFeeStatus(
      student,
      [{ months: '["2026-02","2026-03","2026-04"]', paymentDate: "2026-04-02" }],
      now
    )
    expect(st.paidMonths).toEqual(["2026-02", "2026-03", "2026-04"])
    expect(st.pendingMonths).toEqual(["2026-05", "2026-06"])
    expect(st.isDefaulter).toBe(false) // only May is overdue
  })

  it("reports the most recent payment", () => {
    const now = new Date("2026-04-10")
    const st = computeFeeStatus(
      student,
      [
        { months: '["2026-02"]', paymentDate: "2026-02-05" },
        { months: '["2026-03"]', paymentDate: "2026-03-06" },
      ],
      now
    )
    expect(st.lastPayment?.paymentDate).toBe("2026-03-06")
  })
})

describe("hasPaidCurrentMonth", () => {
  it("checks the current billing key only", () => {
    const now = new Date("2026-04-10")
    expect(hasPaidCurrentMonth(["2026-03", "2026-04"], now)).toBe(true)
    expect(hasPaidCurrentMonth(["2026-03"], now)).toBe(false)
  })
})

describe("parsePaidMonths", () => {
  it("accepts a JSON array of strings", () => {
    expect(parsePaidMonths('["2026-01","2026-02"]')).toEqual(["2026-01", "2026-02"])
  })
  it("returns [] for garbage, non-arrays and non-string entries", () => {
    expect(parsePaidMonths("not json")).toEqual([])
    expect(parsePaidMonths('{"a":1}')).toEqual([])
    expect(parsePaidMonths("[1,2]")).toEqual([])
    expect(parsePaidMonths('["2026-01", 7]')).toEqual(["2026-01"])
  })
})

// ---------------------------------------------------------------------------
// Numbering — MAX(suffix) + 1, deletion-safe (never count()+1)
// ---------------------------------------------------------------------------

describe("nextAdmissionNo", () => {
  it("starts the sequence at 0001", () => {
    expect(nextAdmissionNo([], 2026)).toBe("PSA-2026-0001")
  })

  it("continues the global sequence across years", () => {
    expect(nextAdmissionNo(["PSA-2025-0009"], 2026)).toBe("PSA-2026-0010")
  })

  it("is deletion-safe: uses the max suffix, not the count", () => {
    // count() would produce 0004 — which already exists → collision
    const existing = ["PSA-2026-0001", "PSA-2026-0002", "PSA-2026-0004"]
    const next = nextAdmissionNo(existing, 2026)
    expect(next).toBe("PSA-2026-0005")
    expect(existing).not.toContain(next)
  })

  it("never returns a number that already exists", () => {
    const existing = ["PSA-2026-0001", "PSA-2026-0003", "LEGACY-0003"]
    const next = nextAdmissionNo(existing, 2026)
    expect(next).toBe("PSA-2026-0004")
    expect(existing).not.toContain(next)
  })
})

describe("nextReceiptNo", () => {
  it("uses the collection month with a 5-digit global counter", () => {
    expect(nextReceiptNo([], new Date("2026-09-15"))).toBe("RC-202609-00001")
  })

  it("does not reset the counter each month", () => {
    const existing = ["RC-202512-00007", "RC-202601-00012"]
    expect(nextReceiptNo(existing, new Date("2026-09-15"))).toBe("RC-202609-00013")
  })

  it("is deletion-safe: max suffix beats count()+1", () => {
    // count() = 2 → would mint 00003, which still exists
    const existing = ["RC-202609-00001", "RC-202609-00003"]
    const next = nextReceiptNo(existing, new Date("2026-09-30"))
    expect(next).toBe("RC-202609-00004")
    expect(existing).not.toContain(next)
  })
})

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

describe("computeAge", () => {
  it("counts full years only (birthday not yet reached)", () => {
    const dob = "2000-06-15"
    expect(computeAge(dob, new Date("2026-06-14"))).toBe(25)
    expect(computeAge(dob, new Date("2026-06-15"))).toBe(26)
    expect(computeAge(dob, new Date("2026-07-01"))).toBe(26)
  })

  it("returns 0 for invalid or future dates", () => {
    expect(computeAge("not-a-date", new Date("2026-01-01"))).toBe(0)
    expect(computeAge("2030-01-01", new Date("2026-01-01"))).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Media path safety
// ---------------------------------------------------------------------------

describe("isSafeMediaPath", () => {
  it("accepts plain folder/file paths", () => {
    expect(isSafeMediaPath("photos/john_doe.jpg")).toBe(true)
    expect(isSafeMediaPath("documents/report-2026.pdf")).toBe(true)
    expect(isSafeMediaPath("certificates/birth.cert.png")).toBe(true)
  })

  it("rejects traversal, absolute and nested paths", () => {
    expect(isSafeMediaPath("../secrets.txt")).toBe(false)
    expect(isSafeMediaPath("photos/../../etc/passwd")).toBe(false)
    expect(isSafeMediaPath("/etc/passwd")).toBe(false)
    expect(isSafeMediaPath("photos/sub/dir.jpg")).toBe(false)
    expect(isSafeMediaPath("photos/")).toBe(false)
    expect(isSafeMediaPath("other/x.jpg")).toBe(false)
    expect(isSafeMediaPath("photos/evil$name.jpg")).toBe(false)
  })
})

describe("sanitizeFileName", () => {
  it("keeps only filename-safe characters (no separators)", () => {
    const out = sanitizeFileName("My Photo (1).JPG")
    expect(out).not.toMatch(/[/\\ ]/)
    expect(out).toMatch(/^[\w.-]+$/)
    expect(out).toContain("1")
    expect(out.endsWith(".JPG")).toBe(true)
  })

  it("strips path traversal characters entirely", () => {
    const out = sanitizeFileName("../../etc/passwd")
    expect(out).not.toContain("/")
    expect(out).not.toContain(" ")
  })

  it("caps length at 80 characters (tail preserved)", () => {
    const out = sanitizeFileName(`${"a".repeat(200)}.png`)
    expect(out.length).toBeLessThanOrEqual(80)
    expect(out.endsWith(".png")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

describe("monthKey / monthsBetween", () => {
  it("formats YYYY-MM", () => {
    expect(monthKey(new Date("2026-09-05"))).toBe("2026-09")
  })

  it("includes both endpoints", () => {
    expect(monthsBetween(new Date("2026-01-15"), new Date("2026-03-02"))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ])
  })
})

// ---------------------------------------------------------------------------
// Sports-science insights (Athletic Lab) — estimates derived from facts
// ---------------------------------------------------------------------------

describe("sports science helpers", () => {
  it("rates a vertical jump gain on the coaching ladder", () => {
    expect(verticalJumpRating(null).label).toBe("—")
    expect(verticalJumpRating(35).label).toBe("Developing")
    expect(verticalJumpRating(45).label).toBe("Average")
    expect(verticalJumpRating(55).label).toBe("Good")
    expect(verticalJumpRating(65).label).toBe("Excellent")
    expect(verticalJumpRating(75).label).toBe("Elite")
  })

  it("computes spike clearance against the category net height", () => {
    // Sub-Junior reference net = 2.15 m → 215 cm
    expect(spikeClearance(228, "Sub-Junior")).toBe(13)
    expect(spikeClearance(200, "Junior")).toBe(-20) // falls short
    expect(spikeClearance(null, "Senior")).toBeNull()
    // unknown category falls back to the Senior net (2.43 m)
    expect(spikeClearance(250, "Unknown")).toBe(7)
  })

  it("computes reach-to-height ratio only with both facts", () => {
    expect(reachRatio(216, 168)).toBeCloseTo(1.2857, 3)
    expect(reachRatio(216, null)).toBeNull()
    expect(reachRatio(null, 168)).toBeNull()
  })

  it("computes training age in whole months since registration", () => {
    expect(trainingAge("2026-01-15", new Date("2026-07-10"))).toBe(6)
    expect(trainingAge("bad-date", new Date("2026-07-10"))).toBeNull()
  })

  it("derives the healthy weight band (BMI 18.5–24.9) for a height", () => {
    const [lo, hi] = healthyWeightBand(170)!
    expect(lo).toBe(53)
    expect(hi).toBe(72)
    expect(healthyWeightBand(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// WhatsApp deep links
// ---------------------------------------------------------------------------

describe("whatsapp helpers", () => {
  it("normalises Indian mobiles to international wa.me targets", () => {
    expect(toIntlPhone("9847012001")).toBe("919847012001")
    expect(toIntlPhone("+91 98470 12001")).toBe("919847012001")
    expect(toIntlPhone("919847012001")).toBe("919847012001")
    expect(toIntlPhone("")).toBe("")
  })

  it("builds a wa.me link with an encoded pre-filled message", () => {
    const link = waLink("919847012001", "Fee Receipt\nThank you!")
    expect(link.startsWith("https://wa.me/919847012001?text=")).toBe(true)
    expect(link).toContain("Fee%20Receipt")
  })
})

// ---------------------------------------------------------------------------
// v1.6.1 — ONE fee-cycle classification for Dashboard AND Fees (they used to
// disagree: paid-this-month counted as settled even with older arrears, and a
// brand-new joiner was counted as "due")
// ---------------------------------------------------------------------------

describe("classifyFeeCycle", () => {
  const reg = { id: "s1", registrationDate: "2026-01-15", monthlyFee: 500 }

  it("counts a player who paid this month but owes two older months as a DEFAULTER", () => {
    const now = new Date("2026-04-10")
    const st = computeFeeStatus(reg, [{ months: '["2026-04"]', paymentDate: "2026-04-02" }], now)
    // settled: 2026-04 · still owed: 2026-02, 2026-03
    expect(st.paidMonths).toContain("2026-04")
    expect(st.overdueMonths).toEqual(["2026-02", "2026-03"])
    expect(classifyFeeCycle(st)).toBe("defaulter")
  })

  it("counts a new joiner with nothing pending as PAID — neither due nor overdue", () => {
    const now = new Date("2026-02-10")
    const st = computeFeeStatus({ ...reg, registrationDate: "2026-02-05" }, [], now)
    expect(st.pendingMonths).toEqual([]) // joining month is complimentary
    expect(st.overdueMonths).toEqual([])
    const bucket = classifyFeeCycle(st)
    expect(bucket).toBe("paid")
    expect(bucket).not.toBe("due")
    expect(bucket).not.toBe("defaulter")
  })

  it("counts a fully settled player as PAID", () => {
    const now = new Date("2026-04-10")
    const st = computeFeeStatus(reg, [{ months: '["2026-02","2026-03","2026-04"]', paymentDate: "2026-04-01" }], now)
    expect(classifyFeeCycle(st)).toBe("paid")
  })

  it("counts only the current month unpaid as DUE (not a defaulter)", () => {
    const now = new Date("2026-03-10")
    const st = computeFeeStatus(reg, [], now)
    expect(st.overdueMonths).toEqual(["2026-02"]) // one month behind → not a defaulter
    expect(st.pendingMonths).toEqual(["2026-02", "2026-03"])
    expect(classifyFeeCycle(st)).toBe("due")
  })

  it("counts exactly one older month behind as DUE (the defaulter rule is > 1)", () => {
    const now = new Date("2026-04-10")
    const st = computeFeeStatus(reg, [{ months: '["2026-02"]', paymentDate: "2026-02-11" }], now)
    expect(st.overdueMonths).toEqual(["2026-03"])
    expect(st.isDefaulter).toBe(false)
    expect(classifyFeeCycle(st)).toBe("due")
  })

  it("agrees with computeFeeStatus().isDefaulter on every bucket boundary", () => {
    const now = new Date("2026-05-10")
    const scenarios: string[][] = [
      '["2026-05"]', '["2026-04","2026-05"]', '["2026-02"]', '["2026-02","2026-03"]', '["2026-02","2026-03","2026-04"]',
    ].map((m) => JSON.parse(m))
    for (const months of scenarios) {
      const st = computeFeeStatus(reg, [{ months: JSON.stringify(months), paymentDate: "2026-05-01" }], now)
      expect(classifyFeeCycle(st) === "defaulter").toBe(st.isDefaulter)
    }
  })
})

// ---------------------------------------------------------------------------
// v1.6.1 — shared write-path validators (web routes AND desktop backend)
// ---------------------------------------------------------------------------

describe("assertValidPayment", () => {
  it("rejects a token amount that does not cover the selected months", () => {
    expect(() => assertValidPayment(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"], 1, 500)).toThrow(
      /Amount must match/
    )
  })

  it("rejects a month that already has a receipt (no double receipting)", () => {
    expect(() => assertValidPayment(["2026-01"], 500, 500, ["2026-01"])).toThrow(/already settled/)
  })

  it("rejects malformed month keys and duplicates", () => {
    expect(() => assertValidPayment(["01-2026"], 500, 500)).toThrow(/YYYY-MM/)
    expect(() => assertValidPayment(["2026-13"], 500, 500)).toThrow(/YYYY-MM/)
    expect(() => assertValidPayment(["2026-01", "2026-01"], 1000, 500)).toThrow(/Duplicate/)
  })

  it("accepts the exact months.length × monthlyFee amount", () => {
    expect(() => assertValidPayment(["2026-01", "2026-02"], 1000, 500, [])).not.toThrow()
  })

  it("rejects zero/negative amounts and zero-fee students", () => {
    expect(() => assertValidPayment(["2026-01"], 0, 500)).toThrow(/greater than zero/)
    expect(() => assertValidPayment(["2026-01"], -500, 500)).toThrow(/greater than zero/)
    expect(() => assertValidPayment(["2026-01"], 500, 0)).toThrow(/no monthly fee/)
  })
})

describe("assertValidStudentInput", () => {
  const base = { fullName: "Test Player", dateOfBirth: "2012-05-01", parentName: "Parent", mobile: "9847012345", ageCategory: "Junior" }

  it("accepts a clean record", () => {
    expect(() => assertValidStudentInput(base)).not.toThrow()
  })

  it("rejects a future date of birth", () => {
    expect(() => assertValidStudentInput({ ...base, dateOfBirth: "2999-01-01" })).toThrow(/future/)
  })

  it("rejects a bad mobile number", () => {
    expect(() => assertValidStudentInput({ ...base, mobile: "12345" })).toThrow(/10 digits/)
  })

  it("rejects a negative monthly fee", () => {
    expect(() => assertValidStudentInput({ ...base, monthlyFee: -1 })).toThrow(/cannot be negative/)
  })

  it("rejects missing required fields", () => {
    expect(() => assertValidStudentInput({ ...base, mobile: undefined })).toThrow(/Missing required field: mobile/)
  })
})

describe("assertValidAttendanceRecords", () => {
  const rec = { studentId: "s1", date: "2026-05-01", batch: "Morning", status: "Present" }

  it("accepts a clean batch", () => {
    expect(() => assertValidAttendanceRecords([rec])).not.toThrow()
  })

  it("rejects a bad date or status in ANY record", () => {
    expect(() => assertValidAttendanceRecords([rec, { ...rec, date: "05/01/2026" }])).toThrow(/YYYY-MM-DD/)
    expect(() => assertValidAttendanceRecords([{ ...rec, status: "Late" }])).toThrow(/Present or Absent/)
  })
})

describe("assertValidUpload", () => {
  it("enforces the 10 MB cap on both runtimes", () => {
    expect(() => assertValidUpload({ name: "photo.png", type: "image/png", size: 11 * 1024 * 1024 })).toThrow(/10 MB/)
  })

  it("enforces the extension AND MIME allowlist (desktop used to skip MIME)", () => {
    expect(() => assertValidUpload({ name: "evil.html", type: "text/html", size: 10 })).toThrow(/Unsupported file type/)
    // a png that claims to be an HTML file is rejected on MIME alone
    expect(() => assertValidUpload({ name: "photo.png", type: "text/html", size: 10 })).toThrow(/Unsupported file type/)
    expect(() => assertValidUpload({ name: "archive.zip", type: "application/zip", size: 10 })).toThrow(/Unsupported file type/)
    expect(() => assertValidUpload({ name: "doc.pdf", type: "application/pdf", size: 1024 })).not.toThrow()
    expect(() => assertValidUpload({ name: "pic.webp", type: "image/webp", size: 1024 })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// v1.6.1 — ONE letterhead default (web, desktop and demo must never diverge)
// ---------------------------------------------------------------------------

describe("academy letterhead defaults", () => {
  it("DEFAULT_SETTINGS uses the shared ACADEMY_ADDRESS", () => {
    expect(DEFAULT_SETTINGS.address).toBe(ACADEMY_ADDRESS)
    expect(ACADEMY_ADDRESS).toContain("Kozhikode")
  })

  it("the demo dataset letterhead matches the empty-database default", () => {
    expect(DEMO_SETTINGS.address).toBe(ACADEMY_ADDRESS)
  })
})

// ---------------------------------------------------------------------------
// v1.6.2 — input-field sanitizers (10-digit phones, digits-only numbers)
// ---------------------------------------------------------------------------

describe("phoneDigits", () => {
  it("keeps at most 10 digits", () => {
    expect(phoneDigits("9876543210")).toBe("9876543210")
    expect(phoneDigits("98765432101234")).toBe("9876543210")
    expect(phoneDigits("98765")).toBe("98765")
  })

  it("collapses +91 / 0 prefixes from a paste into the bare 10-digit number", () => {
    expect(phoneDigits("+91 98765 43210")).toBe("9876543210")
    expect(phoneDigits("09876543210")).toBe("9876543210")
    expect(phoneDigits("919876543210")).toBe("9876543210")
  })

  it("strips every non-digit character", () => {
    expect(phoneDigits("98-76a5b.c4321")).toBe("987654321")
    expect(phoneDigits("")).toBe("")
  })
})

describe("intOnly", () => {
  it("keeps digits only and respects the cap", () => {
    expect(intOnly("12ab34", 6)).toBe("1234")
    expect(intOnly("123456789", 3)).toBe("123")
    expect(intOnly("500", 5)).toBe("500")
    expect(intOnly("", 5)).toBe("")
  })
})

describe("decimalOnly", () => {
  it("allows one decimal point with two fraction digits", () => {
    expect(decimalOnly("45.5", 3)).toBe("45.5")
    expect(decimalOnly("45.579", 3)).toBe("45.57")
    expect(decimalOnly("4..5", 3)).toBe("4.5")
  })

  it("strips letters and symbols", () => {
    expect(decimalOnly("ab4c5", 3)).toBe("45")
    expect(decimalOnly("-12", 3)).toBe("12")
  })
})
