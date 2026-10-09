import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/committee/reorder — persist new display order
export async function POST(req: NextRequest) {
  try {
    const { ids } = (await req.json()) as { ids: string[] }
    if (!Array.isArray(ids)) return NextResponse.json({ error: "ids array required" }, { status: 400 })
    await db.$transaction(
      ids.map((id, idx) => db.committeeMember.update({ where: { id }, data: { displayOrder: idx } }))
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to reorder committee"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
