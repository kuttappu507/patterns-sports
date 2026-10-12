import { NextRequest, NextResponse } from "next/server"
import { rm } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"
import { isSafeMediaPath, assertValidStudentInput } from "@/lib/psams/domain"
import { localYMD } from "@/lib/psams/bmi"
import { mapApiError } from "@/lib/psams/api-error"

type Ctx = { params: Promise<{ id: string }> }

const MEDIA_ROOT = path.join(process.cwd(), "media")

// GET /api/students/:id
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const student = await db.student.findUnique({
      where: { id },
      include: {
        achievements: { orderBy: { eventDate: "desc" } },
        payments: { orderBy: { paymentDate: "desc" } },
        measurements: { orderBy: { date: "desc" } },
      },
    })
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })
    return NextResponse.json(student)
  } catch (e) {
    return mapApiError(e, "Failed to load student")
  }
}

// PUT /api/students/:id — partial patch, but the MERGED record (current row +
// patch) is validated with the same shared guard the create path uses
// (PS-017): the edit screen previously persisted garbage mobile (breaking
// WhatsApp targeting), negative/NaN fee, future DOB or a blank name (which
// 500-ed on the NOT NULL). An unknown id now answers 404, not 500.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const current = await db.student.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Student not found" }, { status: 404 })

    const data: Record<string, unknown> = {}
    const strFields = [
      "fullName", "parentName", "mobile", "emergencyContact", "address", "schoolName",
      "classGrade", "division", "bloodGroup", "primarySport", "playingPosition",
      "ageCategory", "trainingBatch", "photoPath", "birthCertPath", "idCardPath", "status",
    ]
    for (const f of strFields) if (f in body) data[f] = body[f] === "" ? null : body[f]
    for (const f of ["fullName", "parentName", "mobile"]) {
      if (f in data && data[f] != null) data[f] = String(data[f]).trim()
    }
    if ("gender" in body) data.gender = String(body.gender ?? "")
    if ("dateOfBirth" in body) data.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null
    if ("registrationDate" in body && body.registrationDate) data.registrationDate = new Date(body.registrationDate)
    if ("monthlyFee" in body) data.monthlyFee = Number(body.monthlyFee ?? 0)
    for (const f of ["heightCm", "weightKg", "standingReachCm", "spikeReachCm", "jumpReachCm"]) {
      if (f in body) data[f] = body[f] === null || body[f] === "" ? null : Number(body[f])
    }

    // PS-017 — validate the record AS IT WILL EXIST after the patch.
    // Legacy rows that pre-date validation are checked too: the edit form
    // shows every field, so a rejected legacy value can be fixed in place.
    assertValidStudentInput({ ...current, ...data })

    const student = await db.student.update({ where: { id }, data })

    // v1.8.0 — dated measurement history: when the save CHANGED height or
    // weight, the day's measurement row lands in Measurement (one per day,
    // upsert). Historical BMI is then recomputed from raw values + date —
    // never stored, never stale.
    const heightChanged = "heightCm" in data && data.heightCm !== current.heightCm
    const weightChanged = "weightKg" in data && data.weightKg !== current.weightKg
    if ((heightChanged || weightChanged) && (student.heightCm != null || student.weightKg != null)) {
      await db.measurement.upsert({
        where: { studentId_date: { studentId: id, date: localYMD(new Date()) } },
        create: {
          studentId: id,
          date: localYMD(new Date()),
          heightCm: student.heightCm,
          weightKg: student.weightKg,
          source: "edit",
        },
        update: { heightCm: student.heightCm, weightKg: student.weightKg, source: "edit" },
      })
    }

    return NextResponse.json(student)
  } catch (e) {
    return mapApiError(e, "Failed to update student")
  }
}

// DELETE /api/students/:id — hard-deletes ONLY students with no financial
// history (PS-005 / §6 Q2a). Receipts are the academy's audit trail: a
// student with any FeePayment row must be archived (status Alumni) instead
// of deleted, and the database-level FK is ON DELETE RESTRICT for fresh
// databases. Student-owned media files are unlinked after a successful
// delete (best-effort — a stray file must never fail the delete).
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const student = await db.student.findUnique({
      where: { id },
      include: { _count: { select: { payments: true } } },
    })
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })
    if (student._count.payments > 0) {
      return NextResponse.json(
        {
          error: `This student has ${student._count.payments} fee receipt(s) — financial history must be preserved. Set the student's status to Alumni instead of deleting.`,
        },
        { status: 409 }
      )
    }
    await db.student.delete({ where: { id } })
    // Media cleanup AFTER the row is gone; path guard keeps it inside media/.
    const media = [student.photoPath, student.birthCertPath, student.idCardPath].filter(
      (p): p is string => Boolean(p) && isSafeMediaPath(p as string)
    )
    for (const rel of media) {
      try {
        await rm(path.join(MEDIA_ROOT, rel), { force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return mapApiError(e, "Failed to delete student")
  }
}
