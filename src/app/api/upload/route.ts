import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { sanitizeFileName, assertValidUpload } from "@/lib/psams/domain"

const MEDIA_ROOT = path.join(process.cwd(), "media")
const FOLDERS = ["photos", "documents", "certificates"]

// POST /api/upload — store a media file on disk (never a BLOB) and
// return its sanitized relative path for database storage.
// The rejects (10 MB cap, extension + MIME allowlist) come from the shared
// validator so the desktop upload path behaves identically.
export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get("file") as File | null
    const folder = String(fd.get("folder") || "photos")
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
    if (!FOLDERS.includes(folder)) return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
    try {
      assertValidUpload({ name: file.name, type: file.type, size: file.size })
    } catch (v) {
      return NextResponse.json({ error: v instanceof Error ? v.message : "Unsupported upload" }, { status: 415 })
    }

    const rel = `${folder}/${Date.now()}-${sanitizeFileName(file.name || "upload")}`
    const abs = path.join(MEDIA_ROOT, rel)
    if (!abs.startsWith(MEDIA_ROOT)) {
      return NextResponse.json({ error: "Invalid media path" }, { status: 400 })
    }
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, new Uint8Array(await file.arrayBuffer()))
    return NextResponse.json({ path: rel }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
