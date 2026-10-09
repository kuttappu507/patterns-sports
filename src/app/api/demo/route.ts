import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadDemoDataset, DEMO_KEY } from "@/lib/psams/demo-seed"

// GET /api/demo — status for the Settings toggle: has the demo dataset been
// loaded, and how many students exist overall.
export async function GET() {
  const [flag, studentCount, committeeCount] = await Promise.all([
    db.setting.findUnique({ where: { key: DEMO_KEY } }),
    db.student.count(),
    db.committeeMember.count(),
  ])
  return NextResponse.json({
    loaded: Boolean(flag?.value),
    students: studentCount,
    committee: committeeCount,
  })
}

// POST /api/demo — load the demo dataset (works on an empty or populated
// database; sequences continue from the current maxima). The created record
// IDs are tracked in a Setting row so they can be removed again later.
export async function POST() {
  try {
    const existingFlag = await db.setting.findUnique({ where: { key: DEMO_KEY } })
    if (existingFlag?.value) {
      return NextResponse.json({ error: "Demo data is already loaded — remove it first if you want a fresh copy." }, { status: 409 })
    }
    const res = await loadDemoDataset(db)
    return NextResponse.json(res, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load demo data"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/demo — remove every record the demo loader created.
export async function DELETE() {
  try {
    const flag = await db.setting.findUnique({ where: { key: DEMO_KEY } })
    if (!flag?.value) {
      return NextResponse.json({ error: "No demo data to remove." }, { status: 404 })
    }
    const { students, committee } = JSON.parse(flag.value) as { students: string[]; committee: string[] }

    await db.feePayment.deleteMany({ where: { studentId: { in: students } } })
    await db.attendance.deleteMany({ where: { studentId: { in: students } } })
    await db.achievement.deleteMany({ where: { studentId: { in: students } } })
    await db.student.deleteMany({ where: { id: { in: students } } })
    if (committee.length) await db.committeeMember.deleteMany({ where: { id: { in: committee } } })
    await db.setting.delete({ where: { key: DEMO_KEY } })

    return NextResponse.json({ ok: true, removed: students.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to remove demo data"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
