import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { computeAge, nextAdmissionNo, assertValidStudentInput } from "@/lib/psams/domain"

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
}

// GET /api/students — list with smart search & multi-parameter filters
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get("q")?.trim()
  const category = sp.get("category")
  const status = sp.get("status")
  const school = sp.get("school")
  const position = sp.get("position")
  const batch = sp.get("batch")
  const minAge = sp.get("minAge") ? Number(sp.get("minAge")) : undefined
  const maxAge = sp.get("maxAge") ? Number(sp.get("maxAge")) : undefined
  const minHeight = sp.get("minHeight") ? Number(sp.get("minHeight")) : undefined

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { admissionNo: { contains: q } },
      { mobile: { contains: q } },
      { parentName: { contains: q } },
    ]
  }
  if (category) where.ageCategory = category
  if (status) where.status = status
  if (school) where.schoolName = school
  if (position) where.playingPosition = position
  if (batch) where.trainingBatch = batch
  if (minHeight) where.heightCm = { gte: minHeight }

  const rows = await db.student.findMany({ where, orderBy: { fullName: "asc" } })

  const filtered = rows.filter((s) => {
    if (minAge !== undefined || maxAge !== undefined) {
      const age = computeAge(s.dateOfBirth)
      if (minAge !== undefined && age < minAge) return false
      if (maxAge !== undefined && age > maxAge) return false
    }
    return true
  })

  return NextResponse.json(filtered)
}

// POST /api/students — register a new student (auto admission number)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Shared sanity guards (also enforced by the desktop createStudent):
    // required fields, future-DOB guard, mobile digits, non-negative fee.
    try {
      assertValidStudentInput(body as Record<string, unknown>)
    } catch (v) {
      return NextResponse.json({ error: v instanceof Error ? v.message : "Invalid student" }, { status: 400 })
    }
    const year = new Date().getFullYear()
    // Sequence continues after the highest existing suffix (deletion-safe);
    // retry on the unique-index race if two concurrent requests tie.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const existing = await db.student.findMany({ select: { admissionNo: true } })
      const admissionNo = body.admissionNo || nextAdmissionNo(existing.map((r) => r.admissionNo), year)
      try {
        const student = await db.student.create({
          data: {
            admissionNo,
            registrationDate: body.registrationDate ? new Date(body.registrationDate) : new Date(),
            fullName: String(body.fullName).trim(),
            dateOfBirth: new Date(body.dateOfBirth),
            parentName: String(body.parentName).trim(),
            mobile: String(body.mobile).trim(),
            emergencyContact: body.emergencyContact || null,
            address: body.address || null,
            schoolName: body.schoolName || null,
            classGrade: body.classGrade || null,
            division: body.division || null,
            bloodGroup: body.bloodGroup || null,
            gender: body.gender || "",
            heightCm: body.heightCm ?? null,
            weightKg: body.weightKg ?? null,
            standingReachCm: body.standingReachCm ?? null,
            spikeReachCm: body.spikeReachCm ?? null,
            jumpReachCm: body.jumpReachCm ?? null,
            primarySport: body.primarySport || "Volleyball",
            playingPosition: body.playingPosition || null,
            ageCategory: body.ageCategory,
            trainingBatch: body.trainingBatch || null,
            monthlyFee: Number(body.monthlyFee ?? 0),
            photoPath: body.photoPath || null,
            birthCertPath: body.birthCertPath || null,
            idCardPath: body.idCardPath || null,
            status: body.status || "Active",
          },
        })
        return NextResponse.json(student, { status: 201 })
      } catch (e) {
        const raced = attempt < 3 && !body.admissionNo && isUniqueViolation(e)
        if (!raced) throw e
      }
    }
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create student"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
