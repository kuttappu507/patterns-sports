import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"
import { GET as dataInfoGET } from "@/app/api/data-info/route"

// ============================================================
// Phase 3B regression tests (PS-012 / PS-013).
//  - a configured token is REQUIRED on /api/* (header or HttpOnly cookie;
//    the ?token= query string of PS-012 is gone)
//  - cross-site state-changing requests are rejected (Origin/Host match)
//  - /api/data-info never echoes DATABASE_URL (credentials)
// The desktop (Tauri static) build ships no API routes — these guard the
// web/standalone posture. LAN binds are refused by scripts/start-server.mjs
// unless a token (or an explicit PSAMS_API_OPEN=1) is present.
// ============================================================

const ENV_KEYS = ["PSAMS_API_TOKEN", "NEXT_PUBLIC_PSAMS_API_TOKEN", "PSAMS_API_OPEN", "DATABASE_URL"]
let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function req(path: string, opts: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: opts.method ?? "GET",
    headers: opts.headers,
  })
}

describe("PS-012 · API token authentication", () => {
  it("denies an unauthenticated full-PII dump when a token is configured", async () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(req("/api/backup"))
    expect(res.status).toBe(401)
  })

  it("no longer accepts ?token= query strings (URLs leak into logs)", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(req("/api/backup?token=sekrit"))
    expect(res.status).toBe(401)
  })

  it("denies a wrong token and a wrong-length token", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    expect(proxy(req("/api/backup", { headers: { "x-psams-token": "wrong" } })).status).toBe(401)
    expect(proxy(req("/api/backup", { headers: { "x-psams-token": "s" } })).status).toBe(401)
    expect(proxy(req("/api/backup", { headers: { "x-psams-token": "sekrit-extra" } })).status).toBe(401)
  })

  it("accepts the correct header token", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(req("/api/backup", { headers: { "x-psams-token": "sekrit" } }))
    expect(res.status).toBe(200)
  })

  it("accepts the HttpOnly session cookie (header-less <img> media requests)", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(req("/api/media?path=photos/x.jpg", { headers: { cookie: "psams_token=sekrit" } }))
    expect(res.status).toBe(200)
  })

  it("hands the session cookie out on page loads", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(req("/"))
    const cookies = res.headers.getSetCookie?.() ?? []
    expect(cookies.some((c) => c.startsWith("psams_token=sekrit"))).toBe(true)
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true)
    expect(cookies.some((c) => /samesite=strict/i.test(c))).toBe(true)
  })

  it("stays open when NO token is configured (loopback-bind posture)", () => {
    const res = proxy(req("/api/backup"))
    expect(res.status).toBe(200)
  })
})

describe("PS-012 · cross-site request enforcement", () => {
  it("rejects a cross-origin POST on /api/*", () => {
    const res = proxy(
      req("/api/payments", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "https://evil.example" },
      })
    )
    expect(res.status).toBe(403)
  })

  it("rejects a cross-origin POST even with a valid token", () => {
    process.env.PSAMS_API_TOKEN = "sekrit"
    const res = proxy(
      req("/api/payments", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "https://evil.example", "x-psams-token": "sekrit" },
      })
    )
    expect(res.status).toBe(403)
  })

  it("rejects a hostile Referer when Origin is absent", () => {
    const res = proxy(
      req("/api/payments", {
        method: "POST",
        headers: { host: "localhost:3000", referer: "https://evil.example/form" },
      })
    )
    expect(res.status).toBe(403)
  })

  it("allows a same-origin POST", () => {
    const res = proxy(
      req("/api/payments", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      })
    )
    expect(res.status).toBe(200)
  })

  it("allows a loopback-to-loopback POST (same machine, other port)", () => {
    const res = proxy(
      req("/api/payments", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://127.0.0.1:9999" },
      })
    )
    expect(res.status).toBe(200)
  })

  it("allows POSTs without Origin/Referer (non-browser clients — CSRF is browser-only)", () => {
    const res = proxy(req("/api/payments", { method: "POST", headers: { host: "localhost:3000" } }))
    expect(res.status).toBe(200)
  })

  it("never origin-checks GETs", () => {
    const res = proxy(req("/api/students", { headers: { origin: "https://evil.example" } }))
    expect(res.status).toBe(200)
  })
})

describe("PS-013 · /api/data-info secret redaction", () => {
  it("hides a hosted DATABASE_URL (credentials never reach the client)", async () => {
    process.env.DATABASE_URL = "libsql://user:sekret@host.example/db"
    const res = await dataInfoGET()
    const body = JSON.stringify(await res.json())
    expect(body).not.toContain("sekret")
    expect(body).not.toContain("libsql://")
    expect(body).toContain("external database (URL hidden)")
  })

  it("still prints the local path for file-backed SQLite (the point of the endpoint)", async () => {
    process.env.DATABASE_URL = "file:../db/custom.db"
    const res = await dataInfoGET()
    const json = (await res.json()) as { database: string }
    expect(json.database.endsWith("custom.db")).toBe(true)
    expect(json.database).not.toContain("://")
  })

  it("returns the fixed string when DATABASE_URL is unset-but-non-file default", async () => {
    delete process.env.DATABASE_URL
    process.env.DATABASE_URL = "libsql://tok-only@host"
    const res = await dataInfoGET()
    const json = (await res.json()) as { database: string }
    expect(json.database).toBe("external database (URL hidden)")
  })
})
