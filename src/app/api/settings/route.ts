import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEFAULT_SETTINGS } from "@/lib/psams/domain"
import type { AcademySettings } from "@/lib/psams/types"

// Empty-database letterhead defaults — the SAME shared constant the desktop
// backend and the demo dataset use, so web and desktop never print two
// different letterheads.
const DEFAULTS: AcademySettings = DEFAULT_SETTINGS

export async function GET() {
  const rows = await db.setting.findMany()
  const map: Record<string, string> = {}
  rows.forEach((r) => (map[r.key] = r.value))
  const settings: AcademySettings = {
    academyName: map.academyName || DEFAULTS.academyName,
    tagline: map.tagline || DEFAULTS.tagline,
    address: map.address || DEFAULTS.address,
    phone: map.phone || DEFAULTS.phone,
    email: map.email || DEFAULTS.email,
    defaultMonthlyFee: map.defaultMonthlyFee ? Number(map.defaultMonthlyFee) : DEFAULTS.defaultMonthlyFee,
    receiptSignatory: map.receiptSignatory || DEFAULTS.receiptSignatory,
  }
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AcademySettings>
    const entries = Object.entries(body).filter(([, v]) => v !== undefined)
    for (const [key, value] of entries) {
      await db.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    }
    return NextResponse.json({ ok: true, saved: entries.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save settings"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
