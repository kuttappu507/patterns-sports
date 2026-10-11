// ============================================================
// PS-AMS :: standalone server launcher (PS-012).
//
// The Next.js standalone server binds 0.0.0.0 unless HOSTNAME says
// otherwise — previously loopback-only operation was a property of
// the `start` script, not of the app. This launcher makes it a
// property of the app:
//
//   1. Default bind is 127.0.0.1. An explicit HOSTNAME is honoured
//      ONLY when it looks like a bind address (localhost / IP) and
//      is not just the shell-inherited machine name. `PSAMS_BIND`
//      wins over everything when set.
//   2. Non-loopback binds (LAN exposure) REQUIRE an API token
//      (PSAMS_API_TOKEN / NEXT_PUBLIC_PSAMS_API_TOKEN) unless the
//      operator sets PSAMS_API_OPEN=1 explicitly — the academy's
//      database must never answer unauthenticated LAN requests by
//      accident. This is the §6 Q5(a) posture.
//   3. Spawns .next/standalone/server.js with the resolved bind.
//
// Usage: bun scripts/start-server.mjs  (after `npm run build`)
// ============================================================
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const ADDR_RE = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|\[::1\]|::|[0-9a-fA-F:.]+)$/
const LOOPBACK_RE = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/

function resolveBind() {
  const explicit = process.env.PSAMS_BIND?.trim()
  if (explicit) return explicit
  const host = process.env.HOSTNAME?.trim() ?? ""
  // HOSTNAME is inherited from the shell on most systems (the machine
  // name) — only treat it as an explicit bind choice when it is a valid
  // address AND not simply this machine's own hostname.
  if (host && host !== os.hostname() && ADDR_RE.test(host)) return host
  return "127.0.0.1"
}

const bind = resolveBind()
const loopback = LOOPBACK_RE.test(bind)
const token =
  process.env.PSAMS_API_TOKEN?.trim() || process.env.NEXT_PUBLIC_PSAMS_API_TOKEN?.trim() || ""
const open = ["1", "true"].includes(process.env.PSAMS_API_OPEN?.trim().toLowerCase() ?? "")

if (!loopback && !token && !open) {
  console.error(
    `[PS-AMS] refusing to bind ${bind} (non-loopback) without an API token.\n` +
      `         Set PSAMS_API_TOKEN (and NEXT_PUBLIC_PSAMS_API_TOKEN for the client),\n` +
      `         or set PSAMS_API_OPEN=1 to accept the risk explicitly,\n` +
      `         or drop HOSTNAME/PSAMS_BIND to stay on 127.0.0.1.`
  )
  process.exit(1)
}

const serverJs = path.resolve(process.cwd(), ".next/standalone/server.js")
if (!fs.existsSync(serverJs)) {
  console.error("[PS-AMS] .next/standalone/server.js not found — run `npm run build` first.")
  process.exit(1)
}

console.warn(
  `[PS-AMS] starting standalone server on http://${bind}:${process.env.PORT ?? "3000"}` +
    (loopback ? " (loopback)" : token ? " (LAN — token required)" : " (LAN — AUTH DISABLED by PSAMS_API_OPEN=1)")
)

const child = spawn(process.execPath, [serverJs], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: bind, NODE_ENV: process.env.NODE_ENV ?? "production" },
})
child.on("exit", (code) => process.exit(code ?? 0))
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig))
}
