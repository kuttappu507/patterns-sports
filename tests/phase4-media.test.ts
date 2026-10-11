import { describe, expect, it, afterAll } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { NextRequest } from "next/server"

// ===========================================================================
// Phase 4 · §4 API-security media battery (TEST_MATRIX T-A6 / T-A7) — the
// REAL upload + media routes. Files land in the repo's git-ignored media/
// dir and are cleaned up after the suite.
//
//   T-A6  oversized / wrong-ext / wrong-MIME → 4xx; hostile filename is
//         sanitized; the stored path ALWAYS stays inside media/
//   T-A7  media GET traversal set (.., %2e%2e, backslash, absolute) → 400
// ===========================================================================

const MEDIA_ROOT = path.join(process.cwd(), "media")
const createdFiles: string[] = []

/** 1×1 transparent PNG — a real, decodable image for the happy path. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
)

function multipart(fields: { name: string; filename?: string; type?: string; value: Buffer | string }[]): {
  body: Buffer
  contentType: string
} {
  const boundary = `----psamsphase4${Date.now()}${Math.random().toString(36).slice(2)}`
  const parts: Buffer[] = []
  for (const f of fields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"`))
    if (f.filename) {
      parts.push(Buffer.from(`; filename="${f.filename}"`))
    }
    parts.push(Buffer.from(`\r\n`))
    if (f.type) parts.push(Buffer.from(`Content-Type: ${f.type}\r\n`))
    parts.push(Buffer.from(`\r\n`))
    parts.push(typeof f.value === "string" ? Buffer.from(f.value) : f.value)
    parts.push(Buffer.from(`\r\n`))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

async function uploadPost(opts: { filename: string; type: string; bytes: Buffer; folder?: string }) {
  const { POST } = await import("@/app/api/upload/route")
  const { body, contentType } = multipart([
    { name: "file", filename: opts.filename, type: opts.type, value: opts.bytes },
    { name: "folder", value: opts.folder ?? "photos" },
  ])
  const req = new NextRequest("http://localhost:3000/api/upload", {
    method: "POST",
    body: new Uint8Array(body),
    headers: { "content-type": contentType },
  })
  const res = await POST(req)
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json }
}

afterAll(() => {
  for (const rel of createdFiles) {
    try {
      fs.rmSync(path.join(MEDIA_ROOT, rel), { force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
})

describe("T-A6 · upload allowlist (web route)", () => {
  it("valid PNG → 201, sanitized path inside photos/, file on disk", async () => {
    const res = await uploadPost({ filename: "player photo.png", type: "image/png", bytes: PNG_BYTES })
    expect(res.status).toBe(201)
    const rel = String(res.json.path)
    expect(rel).toMatch(/^photos\/\d+-player_photo\.png$/) // spaces → underscores
    createdFiles.push(rel)
    expect(fs.existsSync(path.join(MEDIA_ROOT, rel))).toBe(true)
  })

  it("oversized (>10 MB) → 415, nothing written", async () => {
    const before = new Set(fs.existsSync(MEDIA_ROOT) ? fs.readdirSync(path.join(MEDIA_ROOT, "photos")) : [])
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 7)
    const res = await uploadPost({ filename: "big.png", type: "image/png", bytes: big })
    expect(res.status).toBe(415)
    expect(String(res.json.error)).toMatch(/10 MB/i)
    const after = fs.existsSync(MEDIA_ROOT) ? fs.readdirSync(path.join(MEDIA_ROOT, "photos")) : []
    expect(after.filter((f) => !before.has(f))).toEqual([])
  })

  it("wrong extension (.exe) → 415", async () => {
    const res = await uploadPost({ filename: "payload.exe", type: "application/octet-stream", bytes: PNG_BYTES })
    expect(res.status).toBe(415)
    expect(String(res.json.error)).toMatch(/Unsupported file type/i)
  })

  it("wrong MIME (text/html masquerading as .png) → 415", async () => {
    const res = await uploadPost({ filename: "trap.png", type: "text/html", bytes: PNG_BYTES })
    expect(res.status).toBe(415)
  })

  it("hostile filename (traversal) is neutralized — stored path stays flat in photos/", async () => {
    const res = await uploadPost({ filename: "../../evil.png", type: "image/png", bytes: PNG_BYTES })
    expect(res.status).toBe(201)
    const rel = String(res.json.path)
    createdFiles.push(rel)
    // sanitizeFileName turns slashes into underscores: the stored name is a
    // FLAT file inside photos/ — no directory component can survive
    const segments = rel.split("/")
    expect(segments).toHaveLength(2)
    expect(segments[0]).toBe("photos")
    expect(segments[1]).not.toMatch(/^\.{1,2}$/) // never a bare dot segment
    const abs = path.join(MEDIA_ROOT, rel)
    expect(abs.startsWith(MEDIA_ROOT)).toBe(true)
    expect(fs.existsSync(abs)).toBe(true)
  })

  it("invalid folder → 400", async () => {
    const res = await uploadPost({ filename: "x.png", type: "image/png", bytes: PNG_BYTES, folder: "../../" })
    expect(res.status).toBe(400)
    expect(String(res.json.error)).toMatch(/Invalid folder/i)
  })
})

describe("T-A7 · media GET traversal guard", () => {
  it("the full traversal set → 400 by the guard (never serves a file)", async () => {
    const { GET } = await import("@/app/api/media/route")
    const hostile = [
      "../schema.db",
      "../../.env",
      "%2e%2e%2fschema.db",
      "..%2F..%2Fschema.db",
      "..\\schema.db",
      "photos/../../../prisma/schema.prisma",
      "/etc/passwd",
      "C:/Windows/win.ini",
      "./../schema.db",
    ]
    for (const p of hostile) {
      const req = new NextRequest(`http://localhost:3000/api/media?path=${encodeURIComponent(p)}`)
      const res = await GET(req)
      expect(res.status, `path=${p}`).toBe(400)
    }
  })

  it("regex-shaped but dot-segment paths (photos/..) never serve content (404)", async () => {
    const { GET } = await import("@/app/api/media/route")
    // "photos/.." passes the strict shape regex (dots are legal in filenames)
    // but resolves INSIDE media/ and reads a directory → the route answers
    // 404. The security contract is: NEVER 200 with bytes from outside.
    const req = new NextRequest(`http://localhost:3000/api/media?path=${encodeURIComponent("photos/..")}`)
    const res = await GET(req)
    expect(res.status).toBe(404)
  })

  it("a stored file round-trips through the media route with hardening headers", async () => {
    const rel = createdFiles.find((p) => /^photos\//.test(p) && fs.existsSync(path.join(MEDIA_ROOT, p)))
    expect(rel, "an uploaded fixture from the T-A6 suite").toBeDefined()
    const { GET } = await import("@/app/api/media/route")
    const req = new NextRequest(`http://localhost:3000/api/media?path=${encodeURIComponent(rel!)}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-type")).toBe("image/png")
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.equals(PNG_BYTES)).toBe(true)
  })

  it("missing file inside media/ → 404 (not an error leak)", async () => {
    const { GET } = await import("@/app/api/media/route")
    const req = new NextRequest(`http://localhost:3000/api/media?path=${encodeURIComponent("photos/nope-missing.png")}`)
    const res = await GET(req)
    expect(res.status).toBe(404)
  })
})
