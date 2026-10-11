import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadDemoDataset, DEMO_KEY } from "@/lib/psams/demo-seed"
import { mapApiError } from "@/lib/psams/api-error"

// GET /api/demo — status for the Settings toggle: has the demo dataset been
// loaded, and how many students exist overall.
export async function GET() {
  try {
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
  } catch (e) {
    return mapApiError(e, "Failed to read demo status")
  }
}

// POST /api/demo — load the demo dataset (works on an empty or populated
// database; sequences continue from the current maxima). The created record
// IDs are tracked in a Setting row so they can be removed again later.
//
// PS-021 — the WHOLE load runs inside ONE interactive transaction and the
// tracking flag is written inside it (loadDemoDataset's final upsert): a
// mid-load failure used to leave dozens of fake students/payments
// permanently mixed into a real academy's ledger with a 404-ing DELETE.
// Now any failure rolls back to zero rows and no flag.
export async function POST() {
  try {
    const res = await db.$transaction(async (tx) => {
      // Re-check INSIDE the transaction — two concurrent loads can no longer
      // both pass an outside check (SQLite serializes writers; the loser
      // errors or finds the winner's committed flag).
      const existingFlag = await tx.setting.findUnique({ where: { key: DEMO_KEY } })
      if (existingFlag?.value) return null
      return loadDemoDataset(tx)
    })
    if (res === null) {
      return NextResponse.json(
        { error: "Demo data is already loaded — remove it first if you want a fresh copy." },
        { status: 409 }
      )
    }
    return NextResponse.json(res, { status: 201 })
  } catch (e) {
    // A concurrent loader may have won the race and committed — after the
    // rollback, report 409 instead of a scary 500 when that is the case.
    const flag = await db.setting
      .findUnique({ where: { key: DEMO_KEY } })
      .catch(() => null)
    if (flag?.value) {
      return NextResponse.json(
        { error: "Demo data is already loaded — remove it first if you want a fresh copy." },
        { status: 409 }
      )
    }
    return mapApiError(e, "Failed to load demo data")
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

    await db.$transaction([
      db.feePayment.deleteMany({ where: { studentId: { in: students } } }),
      db.paymentMonth.deleteMany({ where: { studentId: { in: students } } }),
      db.attendance.deleteMany({ where: { studentId: { in: students } } }),
      db.achievement.deleteMany({ where: { studentId: { in: students } } }),
      db.student.deleteMany({ where: { id: { in: students } } }),
      ...(committee.length ? [db.committeeMember.deleteMany({ where: { id: { in: committee } } })] : []),
      db.setting.delete({ where: { key: DEMO_KEY } }),
    ])

    return NextResponse.json({ ok: true, removed: students.length })
  } catch (e) {
    return mapApiError(e, "Failed to remove demo data")
  }
}
