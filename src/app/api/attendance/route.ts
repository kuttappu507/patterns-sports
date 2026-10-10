import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assertValidAttendanceRecords } from "@/lib/psams/domain"

// GET /api/attendance?date=YYYY-MM-DD&batch=Morning
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const date = sp.get("date")
  const batch = sp.get("batch")
  if (!date) return NextResponse.json({ error: "date required (YYYY-MM-DD)" }, { status: 400 })
  const where: Record<string, string> = { date }
  if (batch) where.batch = batch
  const rows = await db.attendance.findMany({ where })
  return NextResponse.json(rows)
}

// POST /api/attendance — bulk upsert (rapid toggle)
export async function POST(req: NextRequest) {
  try {
    const { records } = (await req.json()) as {
      records: { studentId: string; date: string; batch: string; status: string }[]
    }
    // Shared whole-batch validation (also enforced by the desktop backend) —
    // a bad record must not leave a half-saved register behind.
    try {
      assertValidAttendanceRecords(records)
    } catch (v) {
      return NextResponse.json({ error: v instanceof Error ? v.message : "Invalid attendance" }, { status: 400 })
    }
    await db.$transaction(
      records.map((r) =>
        db.attendance.upsert({
          where: { studentId_date: { studentId: r.studentId, date: r.date } },
          create: { studentId: r.studentId, date: r.date, batch: r.batch, status: r.status },
          update: { status: r.status, batch: r.batch },
        })
      )
    )
    return NextResponse.json({ ok: true, saved: records.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to mark attendance"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
