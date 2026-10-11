import { NextResponse, type NextRequest } from "next/server"

/**
 * PS-AMS web API guard (web/preview mode only — the Tauri static build has
 * no API routes, so this never runs in the desktop shell).
 *
 * Posture (PS-012, §6 Q5a):
 *  1. Same-origin enforcement — every state-changing request (non-GET/HEAD/
 *     OPTIONS) must carry an Origin/Referer that matches the Host the server
 *     is bound to. Requests without Origin/Referer (curl, scripts, <form>
 *     from some non-browser agents) pass — cross-site request forgery is a
 *     browser attack, and browsers always attach Origin on cross-site POSTs.
 *     Loopback-to-loopback (different port) is treated as same machine.
 *  2. Token authentication — enabled whenever a token is configured:
 *       - `PSAMS_API_TOKEN`             — server-side verify token
 *       - `NEXT_PUBLIC_PSAMS_API_TOKEN` — also inlined into the web client
 *         so fetches can send it automatically (header `x-psams-token`).
 *     Accepted credentials: the `x-psams-token` header OR the `psams_token`
 *     HttpOnly cookie that this guard hands out on page loads (that is what
 *     authenticates header-less <img> media requests). `?token=` query
 *     strings are no longer accepted anywhere — URLs leak into logs.
 *     Timing-safe comparison (constant-time, length-independent).
 *  3. The server binds 127.0.0.1 by default (scripts/start-server.mjs);
 *     binding a LAN address REQUIRES a token unless `PSAMS_API_OPEN=1` is
 *     set explicitly. See README → Security for the full threat model.
 */

const TOKEN_COOKIE = "psams_token"
const TOKEN_HEADER = "x-psams-token"

function configuredToken(): string | null {
  return process.env.PSAMS_API_TOKEN ?? process.env.NEXT_PUBLIC_PSAMS_API_TOKEN ?? null
}

/** Constant-time string equality (works on the edge runtime too). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** "localhost:3000" / "[::1]:3000" → "localhost" / "[::1]" */
function hostOnly(h: string): string {
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1).toLowerCase()
  const i = h.lastIndexOf(":")
  return (i === -1 ? h : h.slice(0, i)).toLowerCase()
}

function isLoopbackHost(h: string): boolean {
  const host = hostOnly(h).replace(/^\[|\]$/g, "")
  return host === "localhost" || host.startsWith("127.") || host === "::1"
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null
  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

/** Origin/Host match for state-changing requests (PS-012). */
function sameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("host")
  if (!host) return false
  const origin = req.headers.get("origin") ?? refererOrigin(req.headers.get("referer"))
  // No Origin/Referer → not a browser navigation/fetch → not CSRF-able.
  if (!origin) return true
  try {
    const o = new URL(origin)
    if (o.host === host) return true
    // Same machine, different local port (dev tooling on 127.0.0.1).
    return isLoopbackHost(o.host) && isLoopbackHost(host)
  } catch {
    return false
  }
}

export function proxy(req: NextRequest) {
  const token = configuredToken()
  const { pathname } = req.nextUrl

  // ---- 1. Cross-site state-changing requests are rejected outright ----
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method)
  if (mutating && !sameOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 })
  }

  if (token) {
    // ---- 2a. Page load: hand out the HttpOnly session cookie ----
    // Same-origin <img> and fetch requests then authenticate without the
    // token ever appearing in a URL.
    if (pathname === "/" && req.method === "GET") {
      const res = NextResponse.next()
      res.cookies.set(TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 12,
        secure: false, // loopback http — the standalone server has no TLS
      })
      return res
    }
    // ---- 2b. API requests: header or cookie, timing-safe ----
    const provided = req.headers.get(TOKEN_HEADER) ?? req.cookies.get(TOKEN_COOKIE)?.value
    if (!provided || !timingSafeEqualStr(provided, token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/api/:path*"],
}
