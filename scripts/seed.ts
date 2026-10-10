// PS-AMS demo data seeder — populates a realistic academy dataset.
// Uses the shared libsql-backed Prisma client from src/lib/db and the
// shared dataset from src/lib/psams/demo-data (same data the Settings →
// "Load demo data" action creates on both backends).
import { nextAdmissionNo, nextReceiptNo } from "../src/lib/psams/domain"
import {
  DEMO_STUDENTS,
  DEMO_COMMITTEE,
  DEMO_SETTINGS,
  DEMO_ACHIEVEMENTS,
  demoDob,
  demoRegistrationDate,
  planDemoPayments,
  planDemoAttendance,
} from "../src/lib/psams/demo-data"
import { db } from "../src/lib/db"

async function main() {
  console.log("Seeding PS-AMS demo data…")

  const existing = await db.student.count()
  if (existing > 0) {
    console.log(`Database already has ${existing} students — skipping seed. Use Settings → Demo Data inside the app instead.`)
    return
  }

  const usedAdmissionNos: string[] = []
  const usedReceiptNos: string[] = []
  const year = new Date().getFullYear()
  const idByStudentName = new Map<string, string>()
  const demoStudentIds: string[] = []
  const demoCommitteeIds: string[] = []

  for (const c of DEMO_COMMITTEE) {
    const m = await db.committeeMember.create({ data: c })
    demoCommitteeIds.push(m.id)
  }

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
        gender: s.gender,
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
    idByStudentName.set(s.fullName, student.id)
    demoStudentIds.push(student.id)

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

  // track the seeded records so Settings → Demo Data reflects this state
  // (and can remove them again) — same key the in-app loader uses
  const tracked = JSON.stringify({ students: demoStudentIds, committee: demoCommitteeIds })
  await db.setting.upsert({
    where: { key: "demoRecordIds" },
    create: { key: "demoRecordIds", value: tracked },
    update: { value: tracked },
  })

  console.log("Seed complete ✔ — 12 players, committee, fee history, achievements, attendance, academy profile.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
