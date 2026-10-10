// ============================================================
// PS-AMS :: whatsapp-bot sidecar (Baileys linked-device client)
//
// A standalone binary (Bun-compiled) that pairs with the academy's
// WhatsApp as a "linked device" — exactly like WhatsApp Web, but
// invisible: no browser, no window. The PS-AMS desktop app spawns
// this process and talks NDJSON over stdio.
//
//   stdout (frames, one JSON per line):
//     {"type":"status","value":"pairing|reconnecting|..."}
//     {"type":"qr","value":"<raw QR payload for the app to render>"}
//     {"type":"connected","value":"<jid>"}
//     {"type":"sent","id":"..","to":".."}
//     {"type":"send_error","id":"..","error":".."}
//     {"type":"log","value":".."}
//
//   stdin (frames):
//     {"type":"send","id":"..","to":"9194..","text":".."}
//     {"type":"logout"}
//     {"type":"ping"}
//
// Pairing session persists in --auth-dir, so the QR scan is a
// one-time setup; later launches reconnect silently.
// ============================================================

import baileysDefault, * as baileysNS from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import pino from "pino"
import * as fs from "node:fs"
import * as path from "node:path"

/* ---- module interop -------------------------------------------------
 * Bun's runtime loader and the --compile bundler interop CJS packages
 * differently: under `bun run` the default export IS the baileys
 * namespace/function, under compile it may wrap it in { default }.
 * Resolve the real module shape once, at runtime, for both worlds.
 * ------------------------------------------------------------------- */
type BaileysModule = typeof import("@whiskeysockets/baileys")

function resolveBaileys(): BaileysModule {
  const candidates: unknown[] = [baileysNS, (baileysDefault as unknown as Record<string, unknown>)?.default, baileysDefault]
  for (const c of candidates) {
    const obj = c as Record<string, unknown> | undefined
    if (obj && typeof obj.makeWASocket === "function") return obj as unknown as BaileysModule
  }
  throw new Error("@whiskeysockets/baileys module could not be resolved")
}

const B = resolveBaileys()
const makeWASocket = B.makeWASocket
const useMultiFileAuthState = B.useMultiFileAuthState
const makeCacheableSignalKeyStore = B.makeCacheableSignalKeyStore
const fetchLatestBaileysVersion = B.fetchLatestBaileysVersion
const DisconnectReason = B.DisconnectReason

/* ---------------- stdio frame helpers ---------------- */

function emit(type: string, value?: unknown, extra?: Record<string, unknown>) {
  const frame = { type, ...(value === undefined ? {} : { value }), ...(extra ?? {}) }
  try {
    process.stdout.write(JSON.stringify(frame) + "\n")
  } catch {
    /* parent gone — ignore */
  }
}

function logToParent(msg: string) {
  emit("log", msg)
}

/* ---------------- args & auth ---------------- */

function argValue(flag: string): string | null {
  const argv = process.argv
  const i = argv.indexOf(flag)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}

const authDir = argValue("--auth-dir") || path.join(process.cwd(), "whatsapp-session")
try {
  fs.mkdirSync(authDir, { recursive: true })
} catch (e) {
  logToParent(`auth dir create failed: ${e}`)
}

/* ---------------- socket lifecycle ---------------- */

let sock: ReturnType<typeof makeWASocket> | null = null
let reconnects = 0
let closedForGood = false

// Baileys internals log via pino — keep stdout strictly NDJSON; when
// WA_DEBUG=1 is set, surface Baileys' own diagnostics on stderr instead.
const silent = process.env.WA_DEBUG
  ? pino({ level: "debug" }, pino.destination(2))
  : pino({ level: "silent" })

async function startConnect() {
  if (closedForGood) return
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    // version check must NEVER block boot (no axios timeout upstream) —
    // race it against 4s; on loss Baileys uses its baked-in version
    const version = (await Promise.race([
      fetchLatestBaileysVersion()
        .then((v) => v.version)
        .catch(() => undefined),
      new Promise<number[] | undefined>((resolve) => setTimeout(() => resolve(undefined), 4000)),
    ])) as [number, number, number] | undefined

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silent),
      },
      logger: silent,
      // web-style browser triple → QR linking (multi-device)
      browser: ["PS-AMS Desktop", "Chrome", "1.5.0"],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (u) => {
      const { connection, lastDisconnect, qr } = u as {
        connection?: string
        lastDisconnect?: { error?: unknown }
        qr?: string
      }

      if (qr) {
        reconnects = 0
        emit("qr", qr)
      }
      if (connection === "connecting") emit("status", "pairing")
      if (connection === "open") {
        reconnects = 0
        const jid = sock?.user?.id ?? ""
        emit("connected", jid)
        logToParent(`linked as ${jid}`)
      }
      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        logToParent(`connection closed (code ${code ?? "?"})`)
        if (code === DisconnectReason.loggedOut) {
          // pairing revoked (phone logout / unlink) — wipe session, re-pair
          try {
            fs.rmSync(authDir, { recursive: true, force: true })
          } catch {}
          emit("status", "logged_out")
          setTimeout(() => process.exit(0), 300)
          return
        }
        if (closedForGood) return
        // transient drop — gentle backoff, session survives
        reconnects += 1
        const delay = Math.min(15000, 1200 * reconnects)
        emit("status", "reconnecting")
        setTimeout(() => void startConnect(), delay)
      }
    })
  } catch (e) {
    logToParent(`connect failed: ${e instanceof Error ? e.message : e}`)
    emit("status", "reconnecting")
    setTimeout(() => void startConnect(), 4000)
  }
}

/* ---------------- outbound sends ---------------- */

function jidFor(to: string): string {
  const digits = (to || "").replace(/\D/g, "")
  if (!digits || digits.length < 8) throw new Error("invalid phone number")
  const intl = digits.length === 10 ? `91${digits}` : digits
  return `${intl}@s.whatsapp.net`
}

async function handleSend(id: string, to: string, text: string) {
  if (!sock || !sock.user) {
    emit("send_error", undefined, { id, to, error: "WhatsApp is not linked yet" })
    return
  }
  try {
    const jid = jidFor(to)
    await sock.sendMessage(jid, { text })
    emit("sent", undefined, { id, to })
  } catch (e) {
    emit("send_error", undefined, { id, to, error: e instanceof Error ? e.message : String(e) })
  }
}

async function handleLogout() {
  closedForGood = true
  try {
    await sock?.logout()
  } catch {}
  try {
    sock?.end(undefined)
  } catch {}
  try {
    fs.rmSync(authDir, { recursive: true, force: true })
  } catch {}
  emit("status", "logged_out")
  setTimeout(() => process.exit(0), 300)
}

/* ---------------- stdin command loop ---------------- */

let buffer = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk: string) => {
  buffer += chunk
  let idx: number
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line) as { type?: string; id?: string; to?: string; text?: string }
      if (msg.type === "send" && msg.to) {
        void handleSend(msg.id ?? "", msg.to, msg.text ?? "")
      } else if (msg.type === "logout") {
        void handleLogout()
      } else if (msg.type === "ping") {
        emit("log", "pong")
      }
    } catch (e) {
      logToParent(`bad frame: ${e instanceof Error ? e.message : e}`)
    }
  }
})
process.stdin.on("end", () => {
  // parent closed the pipe (app quitting) — exit quietly
  closedForGood = true
  setTimeout(() => process.exit(0), 50)
})

/* ---------------- go ---------------- */

emit("status", "starting")
logToParent(`sidecar up · auth dir: ${authDir}`)
void startConnect()
