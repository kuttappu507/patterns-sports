// ============================================================
// PS-AMS :: assemble the standalone server output (cross-platform).
// PS-048 — `npm run build` previously ended with POSIX-only `cp -r`,
// which Windows contributors could not run. Node's fs is portable.
// ============================================================

import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function copyRecursive(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.copyFileSync(src, dest)
  }
}

const staticSrc = path.join(root, ".next", "static")
const staticDest = path.join(root, ".next", "standalone", ".next", "static")
if (fs.existsSync(staticSrc)) {
  fs.rmSync(staticDest, { recursive: true, force: true })
  copyRecursive(staticSrc, staticDest)
  console.log("[assemble] .next/static → .next/standalone/.next/static")
} else {
  console.error("[assemble] ERROR: .next/static missing — did next build succeed?")
  process.exit(1)
}

const publicSrc = path.join(root, "public")
const publicDest = path.join(root, ".next", "standalone", "public")
if (fs.existsSync(publicSrc)) {
  fs.rmSync(publicDest, { recursive: true, force: true })
  copyRecursive(publicSrc, publicDest)
  console.log("[assemble] public → .next/standalone/public")
}

console.log("[assemble] standalone server ready: .next/standalone/")
