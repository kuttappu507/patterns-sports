// ============================================================
// PS-AMS :: WhatsApp dispatch
//
// Two delivery paths, chosen automatically per message:
//
//  1. LINKED DEVICE (desktop, preferred) — the bundled whatsapp-bot
//     sidecar (Baileys) holds a "linked device" session with the
//     academy's WhatsApp (scan the QR once in Settings). Messages go
//     straight to the recipient's chat with one click — no WhatsApp
//     Web, no phone in hand.
//  2. DEEP LINK (fallback) — wa.me link via the OS handler, opening
//     the installed WhatsApp app (or web.whatsapp.com in a browser).
//
// Templates and phone normalization are shared by both paths.
// ===========================================================

import { create } from "zustand"
import { isTauri } from "@/lib/psams/api"
import type { AcademySettings, FeePayment } from "@/lib/psams/types"

/** Strip formatting from a stored mobile number. */
export function normalizePhone(mobile?: string | null): string {
  return (mobile || "").replace(/\D/g, "")
}

/** Convert a local 10-digit Indian mobile to an international wa.me target. */
export function toIntlPhone(mobile?: string | null): string {
  const phone = normalizePhone(mobile)
  if (phone.length === 10) return `91${phone}`
  if (phone.length === 12 && phone.startsWith("91")) return phone
  return phone
}

/**
 * Open an external URL with the OS default handler.
 * - Tauri: shell plugin `open` (capability `shell:allow-open` is granted)
 * - Web: classic new tab
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("plugin:shell|open", { path: url, with: null })
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

/** Build a wa.me deep link with a pre-filled message. */
export function waLink(intlPhone: string, message: string): string {
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`
}

/* ---------------- message templates ---------------- */

export function receiptWaMessage(
  receipt: FeePayment & { studentName?: string; admissionNo?: string },
  settings: AcademySettings | null,
  periodsLabel: string
): string {
  const lines = [
    `*${settings?.academyName || "Pattern Sports Academy"}*`,
    `Fee Receipt`,
    ``,
    `Receipt No: ${receipt.receiptNo}`,
    `Date: ${new Date(receipt.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`,
    `Student: ${receipt.studentName || ""}${receipt.admissionNo ? ` (${receipt.admissionNo})` : ""}`,
    `Period: ${periodsLabel}`,
    `Amount Paid: ₹${Number(receipt.amount).toLocaleString("en-IN")}`,
    `Mode: ${receipt.paymentMode}`,
    ``,
    `Thank you! Keep supporting our champions. 🏐`,
  ]
  return lines.join("\n")
}

/** Friendly dues reminder for a parent (defaulters monitor). */
export function reminderWaMessage(opts: {
  studentName: string
  academyName?: string
  periodsLabel: string
  dueAmount: number
}): string {
  const lines = [
    `*${opts.academyName || "Pattern Sports Academy"}*`,
    `Fee Reminder`,
    ``,
    `Dear Parent,`,
    `The academy fee for ${opts.periodsLabel} of ${opts.studentName} is pending.`,
    `Outstanding: ₹${Number(opts.dueAmount).toLocaleString("en-IN")}`,
    ``,
    `Kindly clear the dues at your earliest convenience. Thank you! 🏐`,
  ]
  return lines.join("\n")
}

/* ============ linked-device bridge (Baileys sidecar) ============ */

export type WaStatus =
  | "unsupported" // web build — sidecar path does not exist
  | "stopped" // sidecar not running / not yet paired
  | "starting" // process spawned, handshake in progress
  | "pairing" // socket connecting
  | "waiting_scan" // QR issued — waiting for the phone to scan
  | "connected" // linked and ready
  | "reconnecting" // transient drop, session persists
  | "logged_out" // pairing revoked on the phone

interface WaStore {
  status: WaStatus
  qr: string | null
  me: string | null // linked account's phone number, when connected
  refresh: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  send: (to: string, text: string) => Promise<{ ok: boolean; error?: string }>
  sendDocument: (to: string, dataBase64: string, fileName: string, caption?: string) => Promise<{ ok: boolean; error?: string }>
}

export const useWaStore = create<WaStore>(() => ({
  status: "stopped",
  qr: null,
  me: null,
  refresh: async () => {
    if (!isTauri()) {
      useWaStore.setState({ status: "unsupported" })
      return
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const snap = await invoke<{ status: WaStatus; qr: string | null; me: string | null }>("wa_snapshot")
      useWaStore.setState({
        status: snap.status,
        qr: snap.qr,
        me: snap.me ? snap.me.split(":")[0] : null,
      })
    } catch {
      /* bridge not ready — stay on current state */
    }
  },
  connect: async () => {
    if (!isTauri()) return
    const { invoke } = await import("@tauri-apps/api/core")
    const snap = await invoke<{ status: WaStatus; qr: string | null; me: string | null }>("wa_start")
    useWaStore.setState({ status: snap.status, qr: snap.qr })
  },
  disconnect: async () => {
    if (!isTauri()) return
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("wa_logout")
    useWaStore.setState({ status: "stopped", qr: null, me: null })
  },
  send: async (to, text) => {
    if (!isTauri()) return { ok: false, error: "WhatsApp linked-device sending is desktop-only" }
    const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ack = waitWaAck(id, 25000)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("wa_send", { to, text, id })
    } catch (e) {
      pendingAcks.delete(id)
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    return ack
  },
  sendDocument: async (to, dataBase64, fileName, caption) => {
    if (!isTauri()) return { ok: false, error: "WhatsApp linked-device sending is desktop-only" }
    const id = `wa-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ack = waitWaAck(id, 60000) // uploads take longer than text sends
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("wa_send_document", { to, dataBase64, fileName, caption: caption ?? null, id })
    } catch (e) {
      pendingAcks.delete(id)
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    return ack
  },
}))

/* pending send acknowledgements, resolved by "sent"/"send_error" events */
const pendingAcks = new Map<string, (ok: boolean, error?: string) => void>()

function waitWaAck(id: string, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingAcks.delete(id)) resolve({ ok: false, error: "WhatsApp did not acknowledge in time" })
    }, timeoutMs)
    pendingAcks.set(id, (ok, error) => {
      clearTimeout(timer)
      pendingAcks.delete(id)
      resolve(ok ? { ok: true } : { ok: false, error })
    })
  })
}

let bridgeReady = false

/** Listen for sidecar events and seed the store. Call once (AppShell). */
export function initWaBridge(): void {
  if (bridgeReady) return
  if (!isTauri()) {
    // web build — no sidecar path; the Settings card explains desktop-only
    useWaStore.setState({ status: "unsupported" })
    return
  }
  bridgeReady = true
  void (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event")
      await listen<Record<string, unknown>>("wa://event", (e) => {
        const p = (e.payload ?? {}) as { type?: string; value?: unknown; id?: unknown; error?: unknown }
        switch (p.type) {
          case "status":
            useWaStore.setState({ status: (p.value as WaStatus) || "stopped" })
            break
          case "qr":
            useWaStore.setState({ status: "waiting_scan", qr: (p.value as string) ?? null })
            break
          case "connected": {
            const jid = String(p.value ?? "")
            const me = jid.split("@")[0]?.split(":")[0] || null
            useWaStore.setState({ status: "connected", me, qr: null })
            break
          }
          case "sent": {
            pendingAcks.get(String(p.id ?? ""))?.(true)
            break
          }
          case "send_error": {
            pendingAcks.get(String(p.id ?? ""))?.(false, String(p.error ?? "send failed"))
            break
          }
        }
      })
      await useWaStore.getState().refresh()
    } catch (e) {
      console.warn("wa bridge init failed", e)
      bridgeReady = false
    }
  })()
}

/**
 * One-click WhatsApp dispatch.
 * Desktop + linked  → through the native engine (no window ever opens).
 * Otherwise        → wa.me deep link via the OS handler (graceful fallback).
 */
export async function dispatchWa(
  phone: string,
  message: string,
): Promise<{ via: "linked" | "link"; ok: boolean; error?: string }> {
  if (isTauri()) {
    const { status, send } = useWaStore.getState()
    if (status === "connected") {
      const res = await send(toIntlPhone(phone), message)
      return { via: "linked", ...res }
    }
  }
  await openExternal(waLink(toIntlPhone(phone), message))
  return { via: "link", ok: true }
}

/**
 * One-click receipt dispatch WITH the PDF receipt attached.
 *  Desktop + linked → the message text first, then the A5 receipt PDF as a
 *                     WhatsApp document (caption repeats the receipt number).
 *  Otherwise        → wa.me deep link with the itemised message (the parent
 *                     still gets every receipt detail, just no attachment).
 */
export async function dispatchWaReceipt(
  phone: string,
  message: string,
  pdf: { blob: Blob; fileName: string } | null,
): Promise<{ via: "linked" | "link"; ok: boolean; error?: string; attachment?: boolean }> {
  if (isTauri()) {
    const { status, send, sendDocument } = useWaStore.getState()
    if (status === "connected") {
      const intl = toIntlPhone(phone)
      const text = await send(intl, message)
      if (!text.ok) return { via: "linked", ...text }
      if (!pdf) return { via: "linked", ok: true }
      const base64 = await blobToBase64(pdf.blob)
      const receiptNoMatch = pdf.fileName.match(/(PS-AMS-Receipt-[A-Za-z0-9-]+)/)
      const doc = await sendDocument(
        intl,
        base64,
        pdf.fileName,
        receiptNoMatch ? `Fee receipt ${receiptNoMatch[1].replace("PS-AMS-Receipt-", "")} — PDF attached` : "Fee receipt PDF attached",
      )
      if (!doc.ok) return { via: "linked", ok: true, error: doc.error, attachment: false }
      return { via: "linked", ok: true, attachment: true }
    }
  }
  await openExternal(waLink(toIntlPhone(phone), message))
  return { via: "link", ok: true }
}

/** Blob → raw base64 (no data: prefix) for the IPC document payload. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Render a raw QR payload into a data URL for the pairing card. */
export async function renderQrDataUrl(text: string): Promise<string> {
  const QR = (await import("qrcode")).default
  return QR.toDataURL(text, {
    margin: 1,
    width: 264,
    color: { dark: "#073b4c", light: "#ffffff" },
  })
}
