import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { sanitizeFileName } from "@/lib/psams/domain"

const MEDIA_ROOT = path.join(process.cwd(), "media")
const FOLDERS = ["photos", "documents", "certificates"]

// Extension allowlist — the media endpoint serves files same-origin, so only
// formats the app actually displays may be stored (images + PDF). This blocks
// HTML/SVG (stored XSS via same-origin serving) and executables.
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"])
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"])

// POST /api/upload — store a media file on disk (never a BLOB) and
// return its sanitized relative path for database storage.
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get("file") as File | null
    const folder = String(fd.get("folder") || "photos")
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
    if (!FOLDERS.includes(folder)) return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 400 })
    }

    const ext = path.extname(sanitizeFileName(file.name || "upload")).toLowerCase()
    if (!ALLOWED_EXT.has(ext) || (file.type && !ALLOWED_MIME.has(file.type))) {
      return NextResponse.json({ error: "Unsupported file type — allowed: PNG, JPG, WEBP or PDF" }, { status: 415 })
    }

    const dir = path.join(MEDIA_ROOT, folder)
    await mkdir(dir, { recursive: true })
    const rel = `${folder}/${Date.now()}-${sanitizeFileName(file.name || "upload")}`
    const abs = path.join(MEDIA_ROOT, rel)
    if (!abs.startsWith(MEDIA_ROOT)) {
      return NextResponse.json({ error: "Invalid media path" }, { status: 400 })
    }
    await writeFile(abs, new Uint8Array(await file.arrayBuffer()))
    return NextResponse.json({ path: rel }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
