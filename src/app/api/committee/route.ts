import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/committee — ordered for dashboard showcase
export async function GET() {
  const rows = await db.committeeMember.findMany({ orderBy: { displayOrder: "asc" } })
  return NextResponse.json(rows)
}

// POST /api/committee
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.fullName || !body.role || !body.phone) {
      return NextResponse.json({ error: "Name, designation and phone are required" }, { status: 400 })
    }
    const max = await db.committeeMember.aggregate({ _max: { displayOrder: true } })
    const member = await db.committeeMember.create({
      data: {
        fullName: String(body.fullName).trim(),
        role: body.role,
        phone: String(body.phone).trim(),
        responsibilities: body.responsibilities || null,
        photoPath: body.photoPath || null,
        displayOrder: (max._max.displayOrder ?? -1) + 1,
      },
    })
    return NextResponse.json(member, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add committee member"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
