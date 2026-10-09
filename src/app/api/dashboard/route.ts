import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeAge, computeFeeStatus, monthKey } from "@/lib/psams/domain"

// GET /api/dashboard — executive snapshot
export async function GET() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [students, payments, committee, attendanceToday] = await Promise.all([
    db.student.findMany({ include: { payments: { orderBy: { paymentDate: "asc" } } } }),
    db.feePayment.findMany({ where: { paymentDate: { gte: monthStart } }, include: { student: true }, orderBy: { paymentDate: "desc" } }),
    db.committeeMember.findMany({ orderBy: { displayOrder: "asc" } }),
    db.attendance.findMany({ where: { date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` } }),
  ])

  const active = students.filter((s) => s.status === "Active")

  const categories = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]
  const categoryBreakdown = categories.map((category) => ({
    category,
    count: active.filter((s) => s.ageCategory === category).length,
  }))

  // Current billing cycle: who has settled the current month
  const currentKey = monthKey(now)
  let paidCount = 0
  let defaulterCount = 0
  let dueSoonCount = 0
  for (const s of active) {
    const st = computeFeeStatus(s, s.payments, now)
    if (st.paidMonths.includes(currentKey)) paidCount++
    else if (st.overdueMonths.length > 1) defaulterCount++
    else dueSoonCount++
  }

  const monthRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
  const todayRevenue = payments.filter((p) => new Date(p.paymentDate) >= dayStart).reduce((sum, p) => sum + p.amount, 0)

  const present = attendanceToday.filter((a) => a.status === "Present").length
  const absent = attendanceToday.filter((a) => a.status === "Absent").length

  // Recent payments (latest 6)
  const recentPayments = payments.slice(0, 6).map((p) => ({
    ...p,
    studentName: p.student.fullName,
    admissionNo: p.student.admissionNo,
  }))

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays = active
    .map((s) => {
      const dob = new Date(s.dateOfBirth)
      const thisYear = now.getFullYear()
      let next = new Date(thisYear, dob.getMonth(), dob.getDate())
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(thisYear + 1, dob.getMonth(), dob.getDate())
      }
      const daysAway = Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
      return { id: s.id, fullName: s.fullName, dateOfBirth: s.dateOfBirth.toISOString(), photoPath: s.photoPath, daysAway, age: computeAge(s.dateOfBirth, next) }
    })
    .filter((b) => b.daysAway <= 30)
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, 5)

  return NextResponse.json({
    totalActive: active.length,
    categoryBreakdown,
    feeCycle: {
      paidCount,
      defaulterCount,
      dueSoonCount,
      collectionRate: active.length ? Math.round((paidCount / active.length) * 100) : 0,
    },
    monthRevenue,
    todayRevenue,
    attendanceToday: { present, absent, marked: attendanceToday.length, totalActive: active.length },
    recentPayments,
    upcomingBirthdays,
    committee,
  })
}
