import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { parsePaidMonths, nextReceiptNo } from "@/lib/psams/domain"
import { toWirePayment, type FeePaymentRow } from "@/lib/psams/serialize"

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
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
    const all = await db.feePayment.findMany({ where: studentId ? { studentId } : {}, include: { student: true }, orderBy: { paymentDate: "desc" } })
    const filtered = all.filter((p) => parsePaidMonths(p.months).includes(month))
    return NextResponse.json(filtered.map(toWirePaymentWithStudent))
  }

  const rows = await db.feePayment.findMany({
    where,
    include: { student: true },
    orderBy: { paymentDate: "desc" },
    ...(limit ? { take: limit } : {}),
  })
  return NextResponse.json(rows.map(toWirePaymentWithStudent))
}

// POST /api/payments — collect a fee payment (multi-month settle)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { studentId, months, amount, paymentMode } = body
    if (!studentId || !Array.isArray(months) || months.length === 0) {
      return NextResponse.json({ error: "studentId and at least one billing month are required" }, { status: 400 })
    }
    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "Collected amount must be greater than zero" }, { status: 400 })
    }

    const now = new Date()
    // Global running sequence after the highest existing suffix (deletion-safe);
    // retry on the unique-index race if two concurrent requests tie.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const existing = await db.feePayment.findMany({ select: { receiptNo: true } })
      const receiptNo = nextReceiptNo(existing.map((r) => r.receiptNo), now)
      try {
        const payment = await db.feePayment.create({
          data: {
            receiptNo,
            studentId,
            paymentDate: body.paymentDate ? new Date(body.paymentDate) : now,
            months: JSON.stringify(months),
            amount: Number(amount),
            paymentMode: paymentMode || "Cash",
            notes: body.notes || null,
            collectedBy: body.collectedBy || null,
          },
          include: { student: true },
        })
        return NextResponse.json(toWirePaymentWithStudent(payment), { status: 201 })
      } catch (e) {
        if (!(attempt < 3 && isUniqueViolation(e))) throw e
      }
    }
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record payment"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
