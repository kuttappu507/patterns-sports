import { NextResponse } from "next/server"
import { resolveDbFile } from "@/lib/psams/bootstrap"

// GET /api/data-info — where the web preview database actually lives, so the
// Settings screen can print the real file instead of a hardcoded guess.
// Loopback-only endpoint: returns a local file path, never credentials.
export async function GET() {
  const file = resolveDbFile()
  return NextResponse.json({
    mode: "web",
    database: file ?? process.env.DATABASE_URL ?? "in-memory (DATABASE_URL is not a sqlite file)",
  })
}
