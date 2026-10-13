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
ok(mainWin && mainWin.maximized !== true && mainWin.visible === false, "main window boots hidden (no maximized flash before the splash)")
ok(mainWin && mainWin.visible === false, "main window hidden until splash finishes the handshake")
ok(splashWin && splashWin.transparent === false && splashWin.decorations === false && !!splashWin.backgroundColor, "splash window OPAQUE + frameless (no translucent box on Windows)")
ok(splashWin && splashWin.alwaysOnTop === true && splashWin.skipTaskbar === true, "splash floats centered above the desktop")
ok(!conf.bundle.externalBin, "no sidecar externalBin — the WhatsApp engine runs in-process (PS-055)")
const librs = readFileSync("src-tauri/src/lib.rs", "utf8")
ok(librs.includes("main_win.maximize()"), "Rust maximizes the still-hidden main window (full screen on first start)")
ok(librs.includes("fn finish_boot") && librs.includes("reveal_main"), "finish_boot command reveals main + closes splash")
ok(librs.includes("BOOT_REVEALED") && librs.includes("from_secs(30)"), "30s failsafe reveals main if splash never finishes")
ok(librs.includes("whatsapp::start_engine") && librs.includes("whatsapp::kill_sidecar"), "whatsapp engine auto-start + exit shutdown wired")
const shell = readFileSync("src/components/psams/app-shell.tsx", "utf8")
ok(shell.includes("data-tauri-drag-region"), "header is the drag region")
ok(shell.includes("win.minimize()") && shell.includes("win.toggleMaximize()") && shell.includes("onCloseRequested") && shell.includes("win?.destroy()") && !shell.includes("win.close()"), "custom window controls wired — close guarded by the PS-059 exit confirmation (onCloseRequested → destroy)")
ok(shell.includes("setExitAsk(true)"), "PS-059: X button opens the exit confirmation dialogue")
ok(shell.includes("Exit PS-AMS?"), "PS-059: exit dialogue present")
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
ok(/\.splash-overlay \{[^}]*background:\s*transparent/.test(css), "splash backdrop transparent (web overlay keeps the floating card)")
ok(css.includes("html.splash-window") && css.includes("background: #04222d"), "desktop splash window page OPAQUE (transparent box fixed)")
ok(css.includes("html.splash-window .splash") && /border-radius:\s*0/.test(css.slice(css.indexOf("html.splash-window .splash"))), "splash card fills the opaque window edge-to-edge")
ok(css.includes("@page") && /margin:\s*0/.test(css.slice(css.indexOf("@media print"))), "print @page margin 0 → no headers/footers")
const pdmod = readFileSync("src/lib/psams/print-desktop.ts", "utf8")
ok(pdmod.includes('"print_direct"') && page.includes("desktopDirectPrint"), "desktop print: native WebView2 silent print (no browser dialog)")
ok(pdmod.includes('"print_to_pdf"') && pdmod.includes("pick_save_path"), "desktop print: true-to-paper PDF via WebView2 + Rust-side save dialog (PS-014)")
ok(librs.includes("print_direct") && librs.includes("print_to_pdf"), "Rust print commands registered")
ok(librs.includes("check_update") && librs.includes("download_update") && librs.includes("install_update"), "in-app updater commands registered")

console.log("— whatsapp linked device —")
const wamod = readFileSync("src/lib/psams/whatsapp.ts", "utf8")
ok(wamod.includes("wa://event") && wa.includes("initWaBridge"), "bridge listens for engine events")
ok(wamod.includes("dispatchWa") && wa.includes("waLink"), "dispatch: linked-device first, wa.me fallback")
ok(wamod.includes("wa_send") && wa.includes("wa_snapshot") && wa.includes("wa_start") && wa.includes("wa_logout"), "all four rust commands invoked")
ok(wamod.includes("renderQrDataUrl"), "QR payload rendered for pairing")
const settingsView = readFileSync("src/components/psams/views/settings-view.tsx", "utf8")
ok(settingsView.includes("WhatsApp Linked Device") && settingsView.includes("<WhatsAppCard />"), "settings pairing card mounted")
ok(settingsView.includes("Link a device"), "pairing CTA present")
const fees = readFileSync("src/components/psams/views/fees-view.tsx", "utf8")
ok(fees.includes("dispatchWa"), "receipt + reminder sends go through dispatchWa")
// PS-057 — the data card leads friendly, paths behind a disclosure
ok(settingsView.includes('"Show folder paths"') && settingsView.includes('"Hide folder paths"') && settingsView.includes("showPaths"), "PS-057: raw data paths collapsed behind a disclosure")
ok(settingsView.includes("Nothing is uploaded anywhere"), "PS-057: friendly data-location one-liner present")
// PS-055 — the engine is IN-PROCESS: the JSON session store + engine glue
// are audited directly (the whatsapp-bot crate is gone from the repo).
const wajson = readFileSync("src-tauri/src/wa_json_store.rs", "utf8")
ok(wajson.includes("struct JsonFileStore") && wajson.includes("import_legacy_sqlite"), "session store: JSON-file backend with legacy sidecar import (pairing survives the update)")
ok(wajson.includes("impl DeviceStore") && wajson.includes("impl SignalStore") && wajson.includes("impl AppSyncStore") && wajson.includes("impl ProtocolStore") && wajson.includes("impl MsgSecretStore"), "session store implements the full wacore Backend surface")
ok(wajson.includes("no such table"), "legacy import tolerates tables older sidecar builds never created")
const waengine = readFileSync("src-tauri/src/wa_engine.rs", "utf8")
ok(waengine.includes("whatsapp_rust::bot::Bot") && waengine.includes("fn shutdown"), "engine builds the in-process bot with a supervised run loop + shutdown")
ok(!waengine.includes("std::process"), "engine never spawns a separate process")
const wars = readFileSync("src-tauri/src/whatsapp.rs", "utf8")
ok(wars.includes("start_engine") && wars.includes("kill_sidecar"), "in-process engine start/exit shutdown wired")
ok(wars.includes("handle_logged_out") && wars.includes("auto_respawns"), "revoked-pairing wipe + capped auto-respawn kept from the sidecar era")
ok(wars.includes('wa://event'), "engine events keep the wa://event UI contract")

console.log("— v1.6.1 correctness pass —")
const tauriSrc = readFileSync("src/lib/psams/tauri-api.ts", "utf8")
const apiSrc = readFileSync("src/lib/psams/api.ts", "utf8")
const domainSrc = domain
ok(domainSrc.includes("function classifyFeeCycle"), "classifyFeeCycle lives in domain.ts (ONE fee-cycle rule)")
const dash = readFileSync("src/app/api/dashboard/route.ts", "utf8")
ok(dash.includes("classifyFeeCycle") && !dash.includes("st.paidMonths.includes(currentKey)"), "web dashboard no longer counts by paid-this-month")
ok(tauriSrc.includes("classifyFeeCycle"), "desktop dashboard uses the shared classifyFeeCycle rule")
const pageSrc = page
ok(pageSrc.includes("closeStudentForm()") && pageSrc.includes("closeCollectFee()"), "Register/Collect popups have their own error boundaries (close-and-continue reset)")
ok(domainSrc.includes("export function assertValidPayment"), "shared payment validator in domain.ts")
const payRoute = readFileSync("src/app/api/payments/route.ts", "utf8")
ok(payRoute.includes("assertValidPayment"), "web payments route enforces the shared validator (no double receipt, exact amount)")
ok(tauriSrc.includes("assertValidPayment("), "desktop collectPayment enforces the same validator")
const stuRoute = readFileSync("src/app/api/students/route.ts", "utf8")
ok(stuRoute.includes("assertValidStudentInput"), "web students route uses the shared student validator")
ok(tauriSrc.includes("assertValidStudentInput("), "desktop createStudent uses the same rejects")
ok(tauriSrc.includes("assertValidUpload("), "desktop upload enforces size cap + MIME (shared validator)")
ok(tauriSrc.includes("assertValidAttendanceRecords("), "desktop attendance validated as a whole batch")
ok(!/for \(const r of records\) \{\s*\n\s*await db\.execute/.test(tauriSrc), "desktop attendance writes ONE statement (all-or-nothing)")
ok(apiSrc.includes("isSafeMediaPath(path)"), "mediaUrl refuses unsafe stored paths on BOTH runtimes")
ok(domainSrc.includes("export const ACADEMY_ADDRESS"), "single shared letterhead address constant")
const settingsRoute = readFileSync("src/app/api/settings/route.ts", "utf8")
ok(settingsRoute.includes("DEFAULT_SETTINGS") && !settingsRoute.includes("Municipal Stadium"), "web letterhead defaults come from the shared constant")
const demoData = readFileSync("src/lib/psams/demo-data.ts", "utf8")
ok(demoData.includes("ACADEMY_ADDRESS") && !demoData.includes("Markaz Colony"), "demo letterhead uses the shared constant (no second copy)")
const demoSeed = readFileSync("src/lib/psams/demo-seed.ts", "utf8")
ok(demoSeed.includes("existingSettings"), "web demo loader skips already-saved settings keys")
ok(tauriSrc.includes("existingSettings"), "desktop demo loader skips already-saved settings keys")
ok(settingsView.includes('invoke<BackupOutcome>("backup_now")') && settingsView.includes("res.ok"), "Backup now invokes the Rust backup_now command and renders the verified outcome (PS-002: ok/dbBytes/media counts, failure shown)")
ok(settingsView.includes("Download JSON snapshot"), "JSON export is labeled as a snapshot, not the database backup")
ok(settingsView.includes("restore_backup") && settingsView.includes("restart_app"), "restore is a real staged restore + restart (no fake toast)")
ok(settingsView.includes("set_backup_target"), "backup target picker writes ps-ams-backup-target.txt next to the database")
ok(!settingsView.includes("%APPDATA%\\PS-AMS\\"), "no hardcoded %APPDATA%\\PS-AMS\\ on the Settings screen")
ok(settingsView.includes("dataInfo("), "Settings shows the real data location (data_paths / DATABASE_URL)")
ok(librs.includes("fn restore_backup") && librs.includes("apply_pending_restore"), "Rust stages the restore and applies it before the SQL plugin opens the db")
ok(librs.includes("fn set_backup_target"), "Rust set_backup_target command registered")
ok(librs.includes("VACUUM INTO") && librs.includes("PRAGMA quick_check") && librs.includes(".partial"), "PS-002: backup = VACUUM INTO snapshot + quick_check verification + .partial staging (no torn WAL pair)")
ok(librs.includes("fs::rename(&tmp, &db)") && librs.includes("with_extension(\"pre-restore.db\")"), "PS-003: restore swaps atomically via .tmp rename with a checkpointed pre-restore snapshot")
ok(librs.includes("fn restore_probe") && librs.includes("validate_pams_db") && librs.includes("'Student','FeePayment','Attendance'"), "PS-006: restore sources fully validated (quick_check + core tables) before any marker is written")
ok(librs.includes("fn restore_status") && settingsView.includes("restore_status"), "PS-003: restore failure record surfaces to the UI")
const paritySrc = readFileSync("scripts/check-parity.mjs", "utf8")
ok(paritySrc.includes("bootstrap.ts"), "check:parity guards the bootstrap.ts DDL copy")

console.log("— Phase 3B security pass —")
const packageJson = JSON.parse(readFileSync("package.json", "utf8"))
const printing_rs = readFileSync("src-tauri/src/printing.rs", "utf8")
const proxySrc = readFileSync("src/proxy.ts", "utf8")
ok(proxySrc.includes("timingSafeEqualStr") && proxySrc.includes("charCodeAt"), "PS-012: token compare is constant-time (timing-safe)")
ok(!proxySrc.includes('searchParams.get("token")'), "PS-012: ?token= query strings are no longer accepted")
ok(proxySrc.includes("Cross-origin request rejected"), "PS-012: Origin/Host mismatch on state-changing requests is rejected")
ok(proxySrc.includes('TOKEN_COOKIE') && proxySrc.includes('httpOnly: true'), "PS-012: HttpOnly session cookie authenticates header-less <img> media requests")
ok(proxySrc.includes('matcher: ["/", "/api/:path*"]'), "PS-012: proxy matcher covers page loads (cookie) + /api/*")
ok(apiSrc.includes("psams_token"), "PS-012: web client relies on the session cookie (no tokens in URLs)")
ok(!apiSrc.includes("tokenQs"), "PS-012: mediaUrl no longer appends ?token=")
const startServer = readFileSync("scripts/start-server.mjs", "utf8")
ok(startServer.includes('127.0.0.1') && startServer.includes("PSAMS_API_OPEN"), "PS-012: standalone launcher binds loopback by default; LAN requires a token or explicit opt-out")
ok(packageJson.scripts.start.includes("start-server.mjs"), "PS-012: npm start goes through the loopback launcher")
const dataInfoRoute = readFileSync("src/app/api/data-info/route.ts", "utf8")
ok(dataInfoRoute.includes("external database (URL hidden)") && !dataInfoRoute.includes("process.env.DATABASE_URL"), "PS-013: data-info never echoes DATABASE_URL (credentials)")
const capsB = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8"))
const capsStrB = JSON.stringify(capsB)
ok(!capsStrB.includes("$DESKTOP") && !capsStrB.includes("$DOCUMENT") && !capsStrB.includes("$DOWNLOAD"), "PS-014: fs capability scope no longer spans Desktop/Documents/Downloads")
ok(!capsStrB.includes("dialog:allow-open") && !capsStrB.includes("dialog:allow-save"), "PS-014: webview-side dialog permissions removed (picks run in Rust)")
const picksrs = readFileSync("src-tauri/src/picks.rs", "utf8")
ok(picksrs.includes("PickKind::RestoreSource") && picksrs.includes("allow_directory") && picksrs.includes("blocking_pick_file"), "PS-014: Rust-side dialog picks register session-whitelisted paths + extend the fs scope")
ok(librs.includes("picks::may_use_path") && picksrs.includes("may_use_path"), "PS-014: restore/backup-target commands verify the dialog-session whitelist")
ok(printing_rs.includes("picks::may_use_path"), "PS-014: print_to_pdf only accepts save-dialog destinations")
ok(!all.some(([f, s]) => f.endsWith(".ts") && s.includes("@tauri-apps/plugin-dialog")), "PS-014: no webview-side dialog plugin usage remains")
const confB = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
ok(confB.app.security.csp.includes("script-src 'self'") && !confB.app.security.csp.includes("unsafe-inline' ws:") && !confB.app.security.csp.includes("ws://localhost"), "PS-014: release CSP — script-src 'self' (Tauri injects asset hashes at compile time), no ws:// leftover")
const updatesrs = readFileSync("src-tauri/src/updates.rs", "utf8")
ok(updatesrs.includes("DOWNLOAD_BASE") && updatesrs.includes("url_allowed"), "PS-015: updater download origin is allowlisted")
ok(updatesrs.includes("Sha256") && updatesrs.includes("asset_digest"), "PS-015: installer sha256 verified against the GitHub release digest")
ok(updatesrs.includes("LAST_INSTALLER") && updatesrs.includes("verified == &p"), "PS-015: install_update only launches a verified download from this session")
ok(updatesrs.includes("remove_file(&dest)"), "PS-015: partial/tampered downloads are deleted, never left in Downloads")
ok(updatesrs.includes("received != total"), "PS-015: incomplete downloads are rejected (length verification)")
ok(settingsView.includes("pick_restore_source") && settingsView.includes("pick_backup_folder"), "PS-014: Settings restore/backup-folder flows use the Rust-side pickers")
ok(settingsView.includes("asset_digest"), "PS-015: Settings updater passes the release digest to download_update")

console.log(failures === 0 ? "\nAUDIT PASS — all wiring checks green" : `\nAUDIT FAILED — ${failures} check(s) red`)
process.exit(failures === 0 ? 0 : 1)
