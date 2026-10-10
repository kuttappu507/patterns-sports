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
  for (const _m of src.matchAll(/window\.open\(/g)) {
    // window.open must only appear as fallback next to openExternal
    ok(src.includes("openExternal"), "window.open guarded by openExternal fallback")
    break
  }
}
const domain = readFileSync("src/lib/psams/domain.ts", "utf8")
ok(domain.includes("maps.app.goo.gl/yUGoSNRdvcN4qKdu6"), "academy Google Maps link registered")

console.log("— frameless window —")
const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
const mainWin = conf.app.windows.find((w) => w.label === "main")
const splashWin = conf.app.windows.find((w) => w.label === "splash")
ok(!!mainWin && !!splashWin, "two-window boot: dedicated splash + main app window")
ok(mainWin && mainWin.decorations === false, "decorations:false (frameless)")
ok(mainWin && mainWin.maximized === true, "window starts maximized (full screen on first start)")
ok(mainWin && mainWin.visible === false, "main window hidden until splash finishes the handshake")
ok(splashWin && splashWin.transparent === true && splashWin.decorations === false, "splash window transparent + frameless")
ok(splashWin && splashWin.alwaysOnTop === true && splashWin.skipTaskbar === true, "splash floats centered above the desktop")
ok(conf.bundle.externalBin && conf.bundle.externalBin.includes("binaries/whatsapp-bot"), "whatsapp-bot sidecar bundled with installers")
const librs = readFileSync("src-tauri/src/lib.rs", "utf8")
ok(librs.includes("fn finish_boot") && librs.includes("reveal_main"), "finish_boot command reveals main + closes splash")
ok(librs.includes("BOOT_REVEALED") && librs.includes("from_secs(30)"), "30s failsafe reveals main if splash never finishes")
ok(librs.includes("whatsapp::spawn_sidecar") && librs.includes("whatsapp::kill_sidecar"), "whatsapp sidecar auto-start + exit kill wired")
const shell = readFileSync("src/components/psams/app-shell.tsx", "utf8")
ok(shell.includes("data-tauri-drag-region"), "header is the drag region")
ok(shell.includes("win.minimize()") && shell.includes("win.toggleMaximize()") && shell.includes("win.close()"), "custom window controls wired")
ok(shell.includes("initWaBridge()"), "whatsapp bridge initialized in app shell")
const caps = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"))
const perm = JSON.stringify(caps)
ok(caps.windows.includes("splash"), "capability covers the splash window")
for (const p of ["core:window:allow-minimize", "core:window:allow-toggle-maximize", "core:window:allow-close", "core:window:allow-start-dragging", "shell:allow-open"]) {
  ok(perm.includes(p), `capability granted: ${p}`)
}

console.log("— splash gating —")
ok(page.includes("setMinSplashDone(true), 2200"), "web splash stays ≥ 2.2 s")
const splashWinComp = readFileSync("src/components/psams/splash-window.tsx", "utf8")
ok(splashWinComp.includes("2200") && splashWinComp.includes("finish_boot"), "desktop splash: ≥ 2.2 s gate then finish_boot")
ok(splashWinComp.includes("psams://booted"), "splash waits for the main window booted event")
ok(page.includes('emit("psams://booted"'), "main window broadcasts boot result")
const css = readFileSync("src/app/globals.css", "utf8")
ok(/\.splash-overlay \{[^}]*background:\s*transparent/.test(css), "splash backdrop transparent")
ok(css.includes("html.splash-window") && css.includes("background: transparent !important"), "splash window page is see-through")
ok(css.includes("@page") && /margin:\s*0/.test(css.slice(css.indexOf("@media print"))), "print @page margin 0 → no headers/footers")

console.log("— whatsapp linked device —")
const wamod = readFileSync("src/lib/psams/whatsapp.ts", "utf8")
ok(wamod.includes("wa://event") && wa.includes("initWaBridge"), "bridge listens for sidecar events")
ok(wamod.includes("dispatchWa") && wa.includes("waLink"), "dispatch: linked-device first, wa.me fallback")
ok(wamod.includes("wa_send") && wa.includes("wa_snapshot") && wa.includes("wa_start") && wa.includes("wa_logout"), "all four rust commands invoked")
ok(wamod.includes("renderQrDataUrl"), "QR payload rendered for pairing")
const settingsView = readFileSync("src/components/psams/views/settings-view.tsx", "utf8")
ok(settingsView.includes("WhatsApp Linked Device") && settingsView.includes("<WhatsAppCard />"), "settings pairing card mounted")
ok(settingsView.includes("Link a device"), "pairing CTA present")
const fees = readFileSync("src/components/psams/views/fees-view.tsx", "utf8")
ok(fees.includes("dispatchWa"), "receipt + reminder sends go through dispatchWa")
const sidecar = readFileSync("src-tauri/sidecar/whatsapp-bot/index.ts", "utf8")
ok(sidecar.includes("useMultiFileAuthState") && sidecar.includes("--auth-dir"), "sidecar persists pairing session (scan once)")
ok(sidecar.includes("makeWASocket"), "sidecar runs the Baileys socket")

console.log(failures === 0 ? "\nAUDIT PASS — all wiring checks green" : `\nAUDIT FAILED — ${failures} check(s) red`)
process.exit(failures === 0 ? 0 : 1)
