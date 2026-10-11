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

// PS-047 — self-heal FIRST: a SIGKILL / CI cancel between the rename and the
// restore used to leave the repo looking mutilated (src/app/api missing,
// .tauri-api-stash holding it) and the next run silently built without the
// API. If a stash exists while the live api dir is gone, restore it now.
if (!fs.existsSync(apiDir) && fs.existsSync(stashDir)) {
  fs.renameSync(stashDir, apiDir)
  console.log("[build-tauri] SELF-HEAL: restored src/app/api from a leftover .tauri-api-stash")
} else if (fs.existsSync(stashDir)) {
  // both exist — the stash is stale debris from an interrupted older run
  fs.rmSync(stashDir, { recursive: true, force: true })
  console.log("[build-tauri] removed stale .tauri-api-stash (live src/app/api intact)")
}

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

// PS-014 note — do NOT re-add script-src 'unsafe-inline' to tauri.conf.json.
// At compile time Tauri parses ALL frontend assets and injects sha256 hashes
// for every inline script into the served CSP (SecurityConfig documentation).
// The committed CSP is `script-src 'self'`; Tauri appends the hashes itself,
// so the release build is hash-strict with no build-time patching needed.
