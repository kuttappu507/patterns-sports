// ============================================================
// PS-AMS :: WhatsApp one-click dispatch
// Builds wa.me deep links (open the installed WhatsApp Desktop /
// mobile app directly, falling back to WhatsApp Web) and opens
// them through the OS default handler — inside Tauri via the
// shell plugin (already registered + permitted), on the web via
// a plain new tab.
// ============================================================

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
