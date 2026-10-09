import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { parsePaidMonths } from "@/lib/psams/domain"

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
    return NextResponse.json(
      filtered.map((p) => ({ ...p, studentName: p.student.fullName, admissionNo: p.student.admissionNo }))
    )
  }

  const rows = await db.feePayment.findMany({
    where,
    include: { student: true },
    orderBy: { paymentDate: "desc" },
    ...(limit ? { take: limit } : {}),
  })
  return NextResponse.json(
    rows.map((p) => ({ ...p, studentName: p.student.fullName, admissionNo: p.student.admissionNo }))
  )
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

    const count = await db.feePayment.count()
    const now = new Date()
    const receiptNo = `RC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(count + 1).padStart(5, "0")}`

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
    return NextResponse.json({ ...payment, studentName: payment.student.fullName, admissionNo: payment.student.admissionNo }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record payment"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
