import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

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

// DELETE /api/students/:id — cascades achievements, payments, attendance
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.student.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete student"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
