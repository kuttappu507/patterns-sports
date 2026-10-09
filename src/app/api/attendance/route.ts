import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ATT_STATUSES = new Set(["Present", "Absent"])

export async function POST(req: NextRequest) {
  try {
    const { records } = (await req.json()) as {
      records: { studentId: string; date: string; batch: string; status: string }[]
    }
    if (!Array.isArray(records)) return NextResponse.json({ error: "records array required" }, { status: 400 })
    // validate the whole batch BEFORE writing anything — a bad record must not
    // leave a half-saved register behind
    for (const r of records) {
      if (!r?.studentId || typeof r.studentId !== "string") {
        return NextResponse.json({ error: "Each record needs a studentId" }, { status: 400 })
      }
      if (!r?.date || !DATE_RE.test(r.date)) {
        return NextResponse.json({ error: "Attendance date must be in YYYY-MM-DD format" }, { status: 400 })
      }
      if (!r?.status || !ATT_STATUSES.has(r.status)) {
        return NextResponse.json({ error: "Attendance status must be Present or Absent" }, { status: 400 })
      }
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
