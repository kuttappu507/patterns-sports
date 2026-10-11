import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mapApiError } from "@/lib/psams/api-error"

type Ctx = { params: Promise<{ id: string }> }

// PUT /api/committee/:id — the MERGED record must keep the identity fields
// (PS-029: the desktop update path requires fullName/role/phone; the web
// route previously accepted blanks and 500-ed on the NOT NULL — PS-032).
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const current = await db.committeeMember.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Committee member not found" }, { status: 404 })

    const data: Record<string, unknown> = {}
    for (const f of ["responsibilities", "photoPath"]) {
      if (f in body) data[f] = body[f] === "" ? null : body[f]
    }
    for (const f of ["fullName", "role", "phone"]) {
      if (f in body) data[f] = String(body[f] ?? "").trim()
    }
    // Same rejects as the desktop update path — identity fields must stay
    // present AFTER the patch is merged.
    const merged = { ...current, ...data }
    if (!String(merged.fullName ?? "").trim() || !String(merged.role ?? "").trim() || !String(merged.phone ?? "").trim()) {
      return NextResponse.json({ error: "Name, designation and phone are required" }, { status: 400 })
    }

    const member = await db.committeeMember.update({ where: { id }, data })
    return NextResponse.json(member)
  } catch (e) {
    return mapApiError(e, "Failed to update committee member")
  }
}

// DELETE /api/committee/:id
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  try {
    await db.committeeMember.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return mapApiError(e, "Failed to delete committee member")
  }
}
