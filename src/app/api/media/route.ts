import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"
import { isSafeMediaPath } from "@/lib/psams/domain"

const MEDIA_ROOT = path.join(process.cwd(), "media")

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
}

// GET /api/media?path=photos/xxx.png — serve stored media (path traversal guarded)
export async function GET(req: NextRequest) {
  const rel = req.nextUrl.searchParams.get("path") || ""
  if (!isSafeMediaPath(rel)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 })
  }
  try {
    const abs = path.join(MEDIA_ROOT, rel)
    if (!abs.startsWith(MEDIA_ROOT)) throw new Error("Traversal blocked")
    const data = await readFile(abs)
    const ext = path.extname(rel).toLowerCase()
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}
