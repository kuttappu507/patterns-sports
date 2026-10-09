import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeFeeStatus } from "@/lib/psams/domain"
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
      const status = computeFeeStatus(s, s.payments)
      return {
        student: s,
        paidMonths: status.paidMonths,
        pendingMonths: status.pendingMonths,
        overdueMonths: status.overdueMonths,
        dueAmount: status.dueAmount,
        isDefaulter: status.isDefaulter,
        lastPayment: s.payments.length ? s.payments[s.payments.length - 1] : null,
      }
    })
    .filter((st) => st.isDefaulter)

  // Worst defaulters first
  statuses.sort((a, b) => b.overdueMonths.length - a.overdueMonths.length || b.dueAmount - a.dueAmount)

  return NextResponse.json(statuses)
}
