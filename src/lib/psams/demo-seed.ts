import type { PrismaClient } from "@prisma/client"
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

// ============================================================
// PS-AMS :: shared demo-dataset loader.
// Used by BOTH the manual "Load demo data" API route (Settings →
// Demo Data) and the boot-time auto-seed for empty databases, so
// a fresh install or a wiped preview database always boots with
// meaningful content.
// ============================================================

export const DEMO_KEY = "demoRecordIds"
export const AUTO_SEED_KEY = "autoSeedDone"

/**
 * Create the full demo dataset (players, committee, fee history,
 * attendance, achievements, academy profile) on the given Prisma
 * client. Idempotency and admission/receipt numbering continue from
 * the current maxima, so it is safe on a populated database too.
 */
export async function loadDemoDataset(db: PrismaClient): Promise<{ students: number; committee: number }> {
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

  // Academy profile — fill ONLY the keys the user has never saved. Loading
  // demo players must never overwrite a real academy name, phone or address
  // (removing the demo players would not bring the old profile back).
  const existingSettings = new Set((await db.setting.findMany({ select: { key: true } })).map((r) => r.key))
  for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
    if (existingSettings.has(key)) continue
    await db.setting.create({ data: { key, value } })
  }

  const trackedValue = JSON.stringify({ students: demoStudentIds, committee: demoCommitteeIds })
  await db.setting.upsert({
    where: { key: DEMO_KEY },
    create: { key: DEMO_KEY, value: trackedValue },
    update: { value: trackedValue },
  })

  // Demo receipts bypass the collect API (no ledger dual-write) — reconcile
  // the PaymentMonth ledger immediately (PS-001; idempotent, cheap).
  try {
    const { syncPaymentLedger } = await import("@/lib/psams/bootstrap")
    const ledger = await syncPaymentLedger()
    if (ledger.added > 0) {
      console.warn(`[PS-AMS] demo ledger reconciled — ${ledger.added} allocation row(s) backfilled`)
    }
  } catch (e) {
    console.warn("[PS-AMS] demo ledger sync skipped:", e instanceof Error ? e.message : e)
  }

  return { students: demoStudentIds.length, committee: demoCommitteeIds.length }
}
