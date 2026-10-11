import { NextResponse } from "next/server"
import { resolveDbFile } from "@/lib/psams/bootstrap"

// GET /api/data-info — where the web preview database actually lives, so the
// Settings screen can print the real file instead of a hardcoded guess.
//
// PS-013: for file-backed SQLite the resolved local path IS the point of this
// endpoint (it never contains credentials). For anything else — hosted
// libsql, remote URLs — the connection string may embed a username/password,
// so a fixed non-sensitive string is returned instead. The raw connection
// string is never echoed to the client.
const HIDDEN_DB = "external database (URL hidden)"

export async function GET() {
  const file = resolveDbFile()
  return NextResponse.json({
    mode: "web",
    database: file ?? HIDDEN_DB,
  })
}
