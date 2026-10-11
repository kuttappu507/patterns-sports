import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { monthLabel, parsePaidMonths, nextReceiptNo, computeFeeStatus, assertValidPayment } from "@/lib/psams/domain"
import { toWirePayment, type FeePaymentRow } from "@/lib/psams/serialize"

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
}

/** Which unique index fired — "receiptNo" (retry) vs the ledger's (studentId, month) (409). */
function uniqueTarget(e: unknown): string {
  const meta = (e as { meta?: { target?: unknown } })?.meta?.target
  return Array.isArray(meta) ? meta.join(",") : String(meta ?? "")
}

/** Transient SQLite contention (pool/busy/transaction conflict) — worth a re-run. */
function isRetryable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2034" || e.code === "P2024")) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /database is locked|database table is locked|busy/i.test(msg)
}

/** Prisma row (+included student) → wire FeePaymentWithStudent. */
function toWirePaymentWithStudent(
  p: Omit<FeePaymentRow, "student"> & { student: { fullName: string; admissionNo: string } }
) {
  const { student, ...rest } = p
  return {
    ...toWirePayment(rest),
    studentName: student.fullName,
    admissionNo: student.admissionNo,
  }
}
function wirePayment(payment: PaymentWithStudent) {
  return toWirePaymentWithStudent(payment as unknown as Omit<FeePaymentRow, "student"> & { student: { fullName: string; admissionNo: string } })
}

// GET /api/payments?studentId=&month=&limit=
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const studentId = sp.get("studentId") || undefined
  const month = sp.get("month") || undefined
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined

  const where: Record<string, unknown> = {}
  if (studentId) where.studentId = studentId
  if (month) {
    // payments whose JSON months array contains the given "YYYY-MM"
    const all = await db.feePayment.findMany({ where: studentId ? { studentId } : {}, include: { student: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] })
    const filtered = all.filter((p) => parsePaidMonths(p.months).includes(month))
    return NextResponse.json(filtered.map(toWirePaymentWithStudent))
  }

  const rows = await db.feePayment.findMany({
    where,
    include: { student: true },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    ...(limit ? { take: limit } : {}),
  })
  return NextResponse.json(rows.map(toWirePaymentWithStudent))
}

type PaymentWithStudent = Prisma.FeePaymentGetPayload<{ include: { student: { select: { fullName: true; admissionNo: true } } } }>

type CollectOutcome =
  | { kind: "not_found" }
  | { kind: "invalid"; message: string }
  | { kind: "clash"; months: string[] }
  | { kind: "ok"; payment: PaymentWithStudent }

/**
 * POST /api/payments — collect a fee payment (multi-month settle).
 *
 * Read + validate + insert now run inside ONE interactive transaction and
 * every settled month gets a PaymentMonth allocation row whose
 * UNIQUE(studentId, month) is enforced by SQLite itself (PS-001): two
 * concurrent collects can no longer both book the month — the loser's
 * insert raises a constraint violation that surfaces as 409 instead of a
 * second receipt. The receipt-number retry re-enters the WHOLE transaction,
 * so it re-validates against fresh data (it can never complete a payment
 * that raced away).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { studentId, months, amount } = body
    if (!studentId || !Array.isArray(months) || months.length === 0) {
      return NextResponse.json({ error: "studentId and at least one billing month are required" }, { status: 400 })
    }
    const amountNum = Number(amount)
    const now = new Date()

    const collectOnce = (): Promise<CollectOutcome> =>
      db.$transaction(async (tx) => {
        // Recompute the settled months from the LEDGER — never trust the client.
        const student = await tx.student.findUnique({
          where: { id: studentId },
          include: { payments: { orderBy: { paymentDate: "asc" } } },
        })
        if (!student) return { kind: "not_found" } as CollectOutcome

        // Ledger pre-check FIRST: a settled month is a CONFLICT with an
        // existing receipt (409), not a malformed request. This classifies
        // both the sequential double-submit and the losing side of a race.
        // The UNIQUE(studentId, month) index remains the real backstop.
        const clashes = await tx.paymentMonth.findMany({
          where: { studentId, month: { in: months as string[] } },
          select: { month: true },
        })
        if (clashes.length > 0) {
          return { kind: "clash", months: clashes.map((c) => c.month) } as CollectOutcome
        }

        try {
          assertValidPayment(months, amountNum, student.monthlyFee, computeFeeStatus(student, student.payments).paidMonths, {
            registrationDate: student.registrationDate,
            paymentDate: body.paymentDate,
            paymentMode: body.paymentMode,
            now,
          })
        } catch (v) {
          return { kind: "invalid", message: v instanceof Error ? v.message : "Invalid payment" } as CollectOutcome
        }

        // Global running sequence after the highest existing suffix (deletion-safe).
        const existing = await tx.feePayment.findMany({ select: { receiptNo: true } })
        const receiptNo = nextReceiptNo(existing.map((r) => r.receiptNo), now)
        const payment = await tx.feePayment.create({
          data: {
            receiptNo,
            studentId,
            paymentDate: body.paymentDate ? new Date(body.paymentDate) : now,
            months: JSON.stringify(months),
            amount: amountNum,
            paymentMode: body.paymentMode || "Cash",
            notes: body.notes || null,
            collectedBy: body.collectedBy || null,
          },
          include: { student: true },
        })
        // One allocation row per settled month — UNIQUE(studentId, month) makes
        // a concurrent double-book physically impossible.
        await tx.paymentMonth.createMany({
          data: (months as string[]).map((m) => ({ studentId, month: m, paymentId: payment.id })),
        })
        return { kind: "ok", payment } as CollectOutcome
      })

    // Retry ONLY the receipt-number race (re-validates on every attempt —
    // never a blind retry) and transient SQLite contention. A ledger clash
    // is a definitive 409, not something to re-run.
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      let outcome: CollectOutcome
      try {
        outcome = await collectOnce()
      } catch (e) {
        lastError = e
        if (isUniqueViolation(e) && !/month/i.test(uniqueTarget(e)) && attempt < 3) continue
        if (!isUniqueViolation(e) && isRetryable(e) && attempt < 3) continue
        throw e
      }
      if (outcome.kind === "not_found") {
        return NextResponse.json({ error: "Student not found" }, { status: 404 })
      }
      if (outcome.kind === "invalid") {
        return NextResponse.json({ error: outcome.message }, { status: 400 })
      }
      if (outcome.kind === "clash") {
        return NextResponse.json(
          { error: `Month already settled — a receipt exists for ${outcome.months.map(monthLabel).join(", ")}` },
          { status: 409 }
        )
      }
      return NextResponse.json(wirePayment(outcome.payment), { status: 201 })
    }
    void lastError
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 })
  } catch (e) {
    // Ledger race backstop (unique index on PaymentMonth) → definitive 409.
    if (isUniqueViolation(e) && /month/i.test(uniqueTarget(e))) {
      return NextResponse.json({ error: "Month already settled — a receipt exists for this month" }, { status: 409 })
    }
    const msg = e instanceof Error ? e.message : "Failed to record payment"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
