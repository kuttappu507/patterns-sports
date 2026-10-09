import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/students/:id/achievements
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const rows = await db.achievement.findMany({
    where: { studentId: id },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(rows)
}

// POST /api/students/:id/achievements
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    if (!body.tournamentName) {
      return NextResponse.json({ error: "Tournament name is required" }, { status: 400 })
    }
    const achievement = await db.achievement.create({
      data: {
        studentId: id,
        tournamentName: String(body.tournamentName).trim(),
        eventDate: body.eventDate ? new Date(body.eventDate) : null,
        level: body.level || "School",
        medal: body.medal || "None",
        notes: body.notes || null,
        certificatePath: body.certificatePath || null,
      },
    })
    return NextResponse.json(achievement, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add achievement"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
