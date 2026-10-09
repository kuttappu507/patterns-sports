import { describe, expect, it } from "vitest"
import {
  computeAge,
  computeFeeStatus,
  hasPaidCurrentMonth,
  isSafeMediaPath,
  monthKey,
  monthsBetween,
  nextAdmissionNo,
  nextReceiptNo,
  parsePaidMonths,
  sanitizeFileName,
} from "../src/lib/psams/domain"

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
