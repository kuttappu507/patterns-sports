import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/achievements/:id
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.achievement.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete achievement"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
