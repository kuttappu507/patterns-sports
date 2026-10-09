import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

// PUT /api/committee/:id
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    for (const f of ["fullName", "role", "phone", "responsibilities", "photoPath"]) {
      if (f in body) data[f] = body[f] === "" ? null : body[f]
    }
    if ("fullName" in body) data.fullName = String(body.fullName).trim()
    const member = await db.committeeMember.update({ where: { id }, data })
    return NextResponse.json(member)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update committee member"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/committee/:id
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.committeeMember.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete committee member"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
