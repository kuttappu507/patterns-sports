import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEFAULT_SETTINGS, ValidationError } from "@/lib/psams/domain"
import { mapApiError } from "@/lib/psams/api-error"
import type { AcademySettings } from "@/lib/psams/types"

// Empty-database letterhead defaults — the SAME shared constant the desktop
// backend and the demo dataset use, so web and desktop never print two
// different letterheads.
const DEFAULTS: AcademySettings = DEFAULT_SETTINGS

// PS-027 — the 7 AcademySettings keys are an allowlist. Anything else
// ("evilKey", nested objects, [object Object] strings) is rejected instead
// of upserted forever. Values are length-bounded strings; defaultMonthlyFee
// must be a finite, non-negative number (a NaN previously persisted as
// "NaN", made GET return null and broke every letterhead).
const SETTING_KEYS = [
  "academyName",
  "tagline",
  "address",
  "phone",
  "email",
  "defaultMonthlyFee",
  "receiptSignatory",
] as const satisfies readonly (keyof AcademySettings)[]

const SETTING_MAX_LEN: Record<(typeof SETTING_KEYS)[number], number> = {
  academyName: 80,
  tagline: 120,
  address: 240,
  phone: 24,
  email: 120,
  defaultMonthlyFee: 12,
  receiptSignatory: 80,
}

async function buildSettings(): Promise<AcademySettings> {
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
  return settings
}

export async function GET() {
  try {
    return NextResponse.json(await buildSettings())
  } catch (e) {
    return mapApiError(e, "Failed to load settings")
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const entries: [string, string][] = []
    for (const [key, raw] of Object.entries(body)) {
      if (!(SETTING_KEYS as readonly string[]).includes(key)) {
        throw new ValidationError(`Unknown setting: ${key}`)
      }
      if (raw === undefined) continue
      if (typeof raw === "object" || typeof raw === "boolean") {
        throw new ValidationError(`Invalid value for ${key}`)
      }
      const value = String(raw).trim()
      if (value.length > SETTING_MAX_LEN[key as (typeof SETTING_KEYS)[number]]) {
        throw new ValidationError(`${key} is too long (max ${SETTING_MAX_LEN[key as (typeof SETTING_KEYS)[number]]} characters)`)
      }
      if (key === "defaultMonthlyFee") {
        const fee = Number(value)
        if (!Number.isFinite(fee) || fee < 0) {
          throw new ValidationError("Default monthly fee must be a non-negative number")
        }
      }
      if (key === "academyName" && !value) {
        throw new ValidationError("Academy name cannot be empty")
      }
      entries.push([key, value])
    }
    // One transaction — a mid-loop failure previously saved half the
    // settings and still reported success (PS-027).
    await db.$transaction(
      entries.map(([key, value]) =>
        db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
      )
    )
    // Return the refetched settings — SAME contract as the desktop
    // saveSettings (PS-029 parity; matches the Promise<AcademySettings>
    // signature both api layers declare).
    return NextResponse.json(await buildSettings())
  } catch (e) {
    return mapApiError(e, "Failed to save settings")
  }
}
