import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeFeeStatus } from "@/lib/psams/domain"
import { toWirePayment, toWireStudent } from "@/lib/psams/serialize"
import type { StudentFeeStatus } from "@/lib/psams/types"

// GET /api/fees/defaulters — students overdue by MORE THAN ONE month
export async function GET() {
  const students = await db.student.findMany({
    where: { status: "Active" },
    include: { payments: { orderBy: { paymentDate: "asc" } } },
    orderBy: { fullName: "asc" },
  })

  const statuses: StudentFeeStatus[] = students
    .map((s) => {
      const { payments, ...raw } = s
      const status = computeFeeStatus(raw, payments)
      return {
        student: toWireStudent(raw),
        paidMonths: status.paidMonths,
        pendingMonths: status.pendingMonths,
        overdueMonths: status.overdueMonths,
        dueAmount: status.dueAmount,
        isDefaulter: status.isDefaulter,
        lastPayment: payments.length ? toWirePayment(payments[payments.length - 1]) : null,
      }
    })
    .filter((st) => st.isDefaulter)

  // Worst defaulters first
  statuses.sort((a, b) => b.overdueMonths.length - a.overdueMonths.length || b.dueAmount - a.dueAmount)

  return NextResponse.json(statuses)
}
