import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mapApiError } from "@/lib/psams/api-error"

// GET /api/committee — ordered for dashboard showcase
export async function GET() {
  try {
    const rows = await db.committeeMember.findMany({ orderBy: { displayOrder: "asc" } })
    return NextResponse.json(rows)
  } catch (e) {
    return mapApiError(e, "Failed to load committee")
  }
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
        role: String(body.role).trim(),
        phone: String(body.phone).trim(),
        responsibilities: body.responsibilities || null,
        photoPath: body.photoPath || null,
        displayOrder: (max._max.displayOrder ?? -1) + 1,
      },
    })
    return NextResponse.json(member, { status: 201 })
  } catch (e) {
    return mapApiError(e, "Failed to add committee member")
  }
}
