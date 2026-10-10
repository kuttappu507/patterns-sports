// PS-AMS client-side wiring audit — greps the SPA source and verifies that
// routing targets, store actions, print kinds, popup pairs and external
// links all resolve to real identifiers.
// Usage: node scripts/client-audit.mjs
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = "src"
const VIEWS = ["dashboard", "students", "student-detail", "fees", "reports", "attendance", "settings"]
const PRINT_KINDS = ["profile-a4", "receipt-a5", "receipt-thermal", "defaulters", "report", "attendance-sheet"]
const STORE_ACTIONS = [
  "navigate", "refresh", "setPrint", "setBootError",
  "openStudentForm", "closeStudentForm", "openCollectFee", "closeCollectFee",
]

let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`)
  if (!cond) failures++
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(/\.tsx?$/.test(f) ? f : f) && /\.tsx?$/.test(f) ? [p] : []
  })
}
const files = walk(ROOT).filter((f) => !f.includes(".d.ts"))
const all = files.map((f) => [f, readFileSync(f, "utf8")])

console.log("— routing targets —")
const navTargets = new Set()
for (const [, src] of all) {
  for (const m of src.matchAll(/navigate\(\s*"([a-z-]+)"/g)) navTargets.add(m[1])
}
ok(navTargets.size > 0 && [...navTargets].every((v) => VIEWS.includes(v)), `all navigate targets valid: ${[...navTargets].join(", ")}`)

const storeSrc = readFileSync("src/lib/psams/store.ts", "utf8")
ok(VIEWS.every((v) => storeSrc.includes(`"${v}"`)), "hash router recognises every ViewKey")
ok(/case "students":\s*\n\s*return "#\/students"/m.test(storeSrc) || storeSrc.includes("'#/students'") || storeSrc.includes("`#/students"), "hash mapping covers students")

console.log("— store actions —")
for (const [, src] of all) {
  for (const action of STORE_ACTIONS) {
    const used = new RegExp(`\\.${action}\\(`).test(src) || new RegExp(`s\\.${action}\\b`).test(src)
    if (used) ok(storeSrc.includes(action), `${action} exists in store`)
  }
}

console.log("— print pipeline —")
const produced = new Set()
for (const [, src] of all) {
  for (const m of src.matchAll(/setPrint\(\{\s*kind:\s*"([a-z0-9-]+)"/g)) produced.add(m[1])
}
ok([...produced].every((k) => PRINT_KINDS.includes(k)), `every produced kind is typed: ${[...produced].join(", ")}`)
const printRoot = readFileSync("src/components/psams/prints/print-root.tsx", "utf8")
for (const k of produced) ok(printRoot.includes(`case "${k}"`), `print-root renders "${k}"`)
ok(printRoot.includes('mode !== "direct"'), "direct payloads skip the preview overlay")

console.log("— global popups mounted once —")
const page = readFileSync("src/app/page.tsx", "utf8")
ok(/<StudentFormDialog \/>/.test(page), "StudentFormDialog mounted at app root")
ok(/<CollectFeeDialog \/>/.test(page), "CollectFeeDialog mounted at app root")
ok(/<PrintRoot \/>/.test(page), "PrintRoot mounted at app root")

console.log("— scrollability (collect fee dialog) —")
const collect = readFileSync("src/components/psams/collect-fee-dialog.tsx", "utf8")
ok(collect.includes("lg:grid-rows-[minmax(0,1fr)]"), "grid row capped so both columns scroll internally")
ok(/min-h-0 flex-col/.test(collect), "picker column has min-h-0")

console.log("— external links —")
const wa = readFileSync("src/lib/psams/whatsapp.ts", "utf8")
ok(wa.includes("https://wa.me/"), "wa.me deep-link builder present")
ok(wa.includes("plugin:shell|open"), "Tauri shell open used for external URLs")
for (const [, src] of all) {
  for (const m of src.matchAll(/window\.open\(/g)) {
    // window.open must only appear as fallback next to openExternal
    ok(src.includes("openExternal"), "window.open guarded by openExternal fallback")
    break
  }
}
const domain = readFileSync("src/lib/psams/domain.ts", "utf8")
ok(domain.includes("maps.app.goo.gl/yUGoSNRdvcN4qKdu6"), "academy Google Maps link registered")

console.log("— frameless window —")
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
ok(conf.app.windows[0].decorations === false, "decorations:false (frameless)")
ok(conf.app.windows[0].maximized === true, "window starts maximized (full screen on first start)")
ok(conf.app.windows[0].visible === false, "window hidden until splash paints")
const shell = readFileSync("src/components/psams/app-shell.tsx", "utf8")
ok(shell.includes("data-tauri-drag-region"), "header is the drag region")
ok(shell.includes("win.minimize()") && shell.includes("win.toggleMaximize()") && shell.includes("win.close()"), "custom window controls wired")
const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"))
const perm = JSON.stringify(caps)
for (const p of ["core:window:allow-minimize", "core:window:allow-toggle-maximize", "core:window:allow-close", "core:window:allow-start-dragging", "shell:allow-open"]) {
  ok(perm.includes(p), `capability granted: ${p}`)
}

console.log("— splash gating —")
ok(page.includes("setMinSplashDone(true), 2200"), "splash stays ≥ 2.2 s")
const css = readFileSync("src/app/globals.css", "utf8")
ok(/\.splash-overlay \{[^}]*background:\s*transparent/.test(css), "splash backdrop transparent")
ok(css.includes("@page") && /margin:\s*0/.test(css.slice(css.indexOf("@media print"))), "print @page margin 0 → no headers/footers")

console.log(failures === 0 ? "\nAUDIT PASS — all wiring checks green" : `\nAUDIT FAILED — ${failures} check(s) red`)
process.exit(failures === 0 ? 0 : 1)
