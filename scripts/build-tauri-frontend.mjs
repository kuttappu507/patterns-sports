// ============================================================
// PS-AMS :: Tauri desktop frontend build
// Produces a fully static export (out/) for the Tauri shell.
// Next.js cannot statically export dynamic route handlers, and the
// desktop build does not need them (the offline SQL backend in
// src/lib/psams/tauri-api.ts replaces the HTTP API), so the API
// routes are stashed away for the duration of the build.
// ============================================================

import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const apiDir = path.join(root, "src", "app", "api")
const stashDir = path.join(root, ".tauri-api-stash")

let stashed = false
if (fs.existsSync(apiDir)) {
  fs.rmSync(stashDir, { recursive: true, force: true })
  fs.renameSync(apiDir, stashDir)
  stashed = true
  console.log("[build-tauri] stashed src/app/api for static export")
}

try {
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, TAURI_STATIC: "1" },
  })
} finally {
  if (stashed) {
    fs.rmSync(apiDir, { recursive: true, force: true })
    fs.renameSync(stashDir, apiDir)
    console.log("[build-tauri] restored src/app/api")
  }
}

if (!fs.existsSync(path.join(root, "out", "index.html"))) {
  console.error("[build-tauri] ERROR: static export did not produce out/index.html")
  process.exit(1)
}

console.log("[build-tauri] static export ready: out/")
