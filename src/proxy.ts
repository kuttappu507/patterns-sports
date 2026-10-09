import { NextResponse, type NextRequest } from "next/server"

/**
 * PS-AMS web API guard (web/preview mode only — the Tauri static build has
 * no API routes, so this never runs in the desktop shell).
 *
 * Default posture is loopback-only with NO auth: the API is meant to be
 * reached from the same machine (see README → Security). Setting a token
 * opts into authentication for /api/*:
 *
 *   - `PSAMS_API_TOKEN`           — server-side only (verify token)
 *   - `NEXT_PUBLIC_PSAMS_API_TOKEN` — also inlined into the web client so
 *     it can send the token automatically (header `x-psams-token`, plus
 *     `?token=` for <img>/media URLs). Either variable enables the check;
 *     set both to keep the bundled client working.
 *
 * Accepted credentials: `x-psams-token` header, or `?token=` query param.
 */
export function proxy(req: NextRequest) {
  const token = process.env.PSAMS_API_TOKEN ?? process.env.NEXT_PUBLIC_PSAMS_API_TOKEN
  if (token) {
    const provided = req.headers.get("x-psams-token") ?? req.nextUrl.searchParams.get("token")
    if (provided !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*"],
}
