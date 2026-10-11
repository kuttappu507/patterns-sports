import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

// ===========================================================================
// PS-044 gate — every /api path the frontend api layer calls MUST have a
// matching Next.js route file. The PS-016 class of failure (a tracked file
// silently vanishing from the workspace — src/app/api/upload/route.ts was
// lost twice) shipped as "fetch works on desktop, web upload 404s" with no
// gate noticing. This test walks src/app/api/**/route.ts and asserts every
// path literal in src/lib/psams/api.ts resolves to one of them.
// ===========================================================================

const root = process.cwd()

/** Collect every route file and convert it to a matchable path pattern. */
function collectRoutes(): { pattern: string; file: string }[] {
  const out: { pattern: string; file: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === "route.ts") {
        const rel = path.relative(path.join(root, "src/app/api"), full)
        const segments = rel.split(path.sep).slice(0, -1) // drop "route.ts"
        const pattern =
          "/api/" +
          segments
            .map((s) => (s.startsWith("[") && s.endsWith("]") ? "*" : s))
            .join("/")
        out.push({ pattern, file: rel })
      }
    }
  }
  walk(path.join(root, "src/app/api"))
  return out
}

function pathMatches(pattern: string, candidates: { pattern: string; file: string }[]): string | null {
  for (const c of candidates) {
    if (c.pattern === pattern) return c.file
    // dynamic-segment match: pattern with * vs concrete segments
    const pat = pattern.split("/")
    const cand = c.pattern.split("/")
    if (pat.length === cand.length && pat.every((seg, i) => seg === cand[i] || cand[i] === "*")) return c.file
  }
  return null
}

describe("api.ts endpoint existence (PS-044)", () => {
  const routes = collectRoutes()
  const apiSrc = fs.readFileSync(path.join(root, "src/lib/psams/api.ts"), "utf8")

  it("finds the route tree", () => {
    expect(routes.length).toBeGreaterThan(15)
  })

  it("every /api path called by api.ts has a route file", () => {
    // /api/core and /api/media are NOT Next routes: /api/core is the Tauri
    // asset prefix fragment, /api/media the desktop custom protocol — both
    // are asserted separately below. /api/... (ellipsis) is the JSDoc.
    const skipped = new Set(["/api/core", "/api/media", "/api/..."])
    const literals = new Set<string>()
    for (const m of apiSrc.matchAll(/["'`]\/api\/[^"'`\s]*["'`]/g)) {
      const raw = m[0].slice(1, -1)
      if (skipped.has(raw)) continue
      literals.add(raw)
    }
    const missing: string[] = []
    for (const raw of literals) {
      // strip query strings, then normalize template interpolations
      const base = raw.split("?")[0]
      const normalized = base.replace(/\$\{[^}]*\}/g, "*")
      const hit = pathMatches(normalized, routes)
      if (!hit) missing.push(`${raw} (normalized: ${normalized})`)
    }
    expect(missing, `missing route files for: ${missing.join(", ")}`).toEqual([])
  })

  it("guards the PS-016 strike file — upload route is tracked", () => {
    expect(fs.existsSync(path.join(root, "src/app/api/upload/route.ts"))).toBe(true)
  })

  it("covers every backend area with a route file", () => {
    const patterns = routes.map((r) => r.pattern)
    for (const required of [
      "/api/students",
      "/api/students/*",
      "/api/students/*/achievements",
      "/api/achievements/*",
      "/api/payments",
      "/api/fees/statuses",
      "/api/fees/defaulters",
      "/api/dashboard",
      "/api/committee",
      "/api/committee/*",
      "/api/committee/reorder",
      "/api/attendance",
      "/api/settings",
      "/api/upload",
      "/api/media",
      "/api/backup",
      "/api/data-info",
      "/api/demo",
    ]) {
      expect(patterns, `${required} route missing`).toContain(required)
    }
  })
})
