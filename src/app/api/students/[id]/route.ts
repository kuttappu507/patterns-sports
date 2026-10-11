import { NextRequest, NextResponse } from "next/server"
import { rm } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"
import { isSafeMediaPath } from "@/lib/psams/domain"

type Ctx = { params: Promise<{ id: string }> }

const MEDIA_ROOT = path.join(process.cwd(), "media")

// GET /api/students/:id
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const student = await db.student.findUnique({
    where: { id },
    include: { achievements: { orderBy: { eventDate: "desc" } }, payments: { orderBy: { paymentDate: "desc" } } },
  })
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 })
  return NextResponse.json(student)
}

// PUT /api/students/:id
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    const strFields = [
      "fullName", "parentName", "mobile", "emergencyContact", "address", "schoolName",
      "classGrade", "division", "bloodGroup", "primarySport", "playingPosition",
      "ageCategory", "trainingBatch", "photoPath", "birthCertPath", "idCardPath", "status",
    ]
    for (const f of strFields) if (f in body) data[f] = body[f] === "" ? null : body[f]
    if ("gender" in body) data.gender = String(body.gender ?? "")
    if ("dateOfBirth" in body) data.dateOfBirth = new Date(body.dateOfBirth)
    if ("registrationDate" in body && body.registrationDate) data.registrationDate = new Date(body.registrationDate)
    if ("monthlyFee" in body) data.monthlyFee = Number(body.monthlyFee ?? 0)
    for (const f of ["heightCm", "weightKg", "standingReachCm", "spikeReachCm", "jumpReachCm"]) {
      if (f in body) data[f] = body[f] === null || body[f] === "" ? null : Number(body[f])
    }

    const student = await db.student.update({ where: { id }, data })
    return NextResponse.json(student)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update student"
    return NextResponse.json({ error: msg }, { status: 500 })
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
    const msg = e instanceof Error ? e.message : "Failed to delete student"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
