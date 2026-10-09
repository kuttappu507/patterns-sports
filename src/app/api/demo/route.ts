import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextAdmissionNo, nextReceiptNo } from "@/lib/psams/domain"
import {
  DEMO_STUDENTS,
  DEMO_COMMITTEE,
  DEMO_SETTINGS,
  DEMO_ACHIEVEMENTS,
  demoDob,
  demoRegistrationDate,
  planDemoPayments,
  planDemoAttendance,
} from "@/lib/psams/demo-data"

const DEMO_KEY = "demoRecordIds"

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

    const demoStudentIds: string[] = []
    const demoCommitteeIds: string[] = []

    // Committee — only when the showcase is empty, so we never duplicate a
    // real member with the same name.
    if ((await db.committeeMember.count()) === 0) {
      for (const c of DEMO_COMMITTEE) {
        const m = await db.committeeMember.create({ data: c })
        demoCommitteeIds.push(m.id)
      }
    }

    const usedAdmissionNos = (await db.student.findMany({ select: { admissionNo: true } })).map((r) => r.admissionNo)
    const usedReceiptNos = (await db.feePayment.findMany({ select: { receiptNo: true } })).map((r) => r.receiptNo)
    const year = new Date().getFullYear()
    const idByStudentName = new Map<string, string>()

    for (const s of DEMO_STUDENTS) {
      const admissionNo = nextAdmissionNo(usedAdmissionNos, year)
      usedAdmissionNos.push(admissionNo)
      const student = await db.student.create({
        data: {
          admissionNo,
          registrationDate: demoRegistrationDate(s),
          fullName: s.fullName,
          dateOfBirth: demoDob(s),
          parentName: s.parentName,
          mobile: s.mobile,
          emergencyContact: s.emergencyContact || null,
          address: s.address,
          schoolName: s.schoolName,
          classGrade: s.classGrade,
          division: s.division,
          bloodGroup: s.bloodGroup,
          heightCm: s.heightCm ?? null,
          weightKg: s.weightKg ?? null,
          standingReachCm: s.standingReachCm ?? null,
          spikeReachCm: s.spikeReachCm ?? null,
          jumpReachCm: s.jumpReachCm ?? null,
          primarySport: s.primarySport,
          playingPosition: s.playingPosition || null,
          ageCategory: s.ageCategory,
          trainingBatch: s.trainingBatch,
          monthlyFee: s.monthlyFee,
          status: "Active",
        },
      })
      demoStudentIds.push(student.id)
      idByStudentName.set(s.fullName, student.id)

      for (const p of planDemoPayments(s)) {
        const receiptNo = nextReceiptNo(usedReceiptNos, p.paymentDate)
        usedReceiptNos.push(receiptNo)
        await db.feePayment.create({
          data: {
            receiptNo,
            studentId: student.id,
            paymentDate: p.paymentDate,
            months: JSON.stringify(p.months),
            amount: p.amount,
            paymentMode: p.paymentMode,
            collectedBy: "Front Desk",
          },
        })
      }

      for (const a of planDemoAttendance(s)) {
        await db.attendance.create({
          data: {
            studentId: student.id,
            date: a.date,
            batch: s.trainingBatch,
            status: a.status,
          },
        })
      }
    }

    for (const a of DEMO_ACHIEVEMENTS) {
      const studentId = idByStudentName.get(a.student)
      if (!studentId) continue
      const eventDate = new Date()
      eventDate.setMonth(eventDate.getMonth() - a.eventDateMonthsAgo)
      await db.achievement.create({
        data: {
          studentId,
          tournamentName: a.tournamentName,
          eventDate,
          level: a.level,
          medal: a.medal,
          notes: a.notes || null,
        },
      })
    }

    for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    }

    const trackedValue = JSON.stringify({ students: demoStudentIds, committee: demoCommitteeIds })
    await db.setting.upsert({
      where: { key: DEMO_KEY },
      create: { key: DEMO_KEY, value: trackedValue },
      update: { value: trackedValue },
    })

    return NextResponse.json({ students: demoStudentIds.length, committee: demoCommitteeIds.length }, { status: 201 })
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
