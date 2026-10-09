import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/backup — full JSON snapshot (portable backup of the active database)
export async function GET() {
  const [students, achievements, payments, committee, attendance, settings] = await Promise.all([
    db.student.findMany(),
    db.achievement.findMany(),
    db.feePayment.findMany(),
    db.committeeMember.findMany(),
    db.attendance.findMany(),
    db.setting.findMany(),
  ])

  const manifest = {
    app: "PS-AMS",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    counts: {
      students: students.length,
      achievements: achievements.length,
      payments: payments.length,
      committee: committee.length,
      attendance: attendance.length,
      settings: settings.length,
    },
  }

  return new NextResponse(
    JSON.stringify(
      { manifest, students, achievements, payments, committee, attendance, settings },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="PS-AMS-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    }
  )
}
