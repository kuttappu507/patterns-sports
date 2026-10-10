"use client"

// ============================================================
// PS-AMS :: desktop (Tauri) print bridge.
// On the desktop the app never opens the browser-style print
// dialog: `print_direct` drives the WebView2 print pipeline with
// an in-app paper preset (default A6 for receipts) straight to
// the DEFAULT printer, and `print_to_pdf` writes a TRUE
// single-page PDF at the preset size. The web preview keeps the
// regular window.print() flow.
// ============================================================

export type PrintPaper = "A6" | "A5" | "A4" | "Thermal80"

const RECEIPT_PAPER_KEY = "psams-receipt-paper"

/** Saved receipt paper preset — A6 by default (the academy's receipt stock). */
export function getReceiptPaper(): "A6" | "A5" {
  if (typeof window === "undefined") return "A6"
  return window.localStorage.getItem(RECEIPT_PAPER_KEY) === "A5" ? "A5" : "A6"
}

export function setReceiptPaper(p: "A6" | "A5") {
  try {
    window.localStorage.setItem(RECEIPT_PAPER_KEY, p)
  } catch {
    /* storage unavailable — session-only choice */
  }
}

/** Paper preset for a document kind. Receipts follow the saved preset. */
export function paperForKind(kind: string): PrintPaper {
  switch (kind) {
    case "receipt-a5":
      return getReceiptPaper()
    case "receipt-thermal":
      return "Thermal80"
    default:
      return "A4"
  }
}

export function paperLabel(paper: PrintPaper): string {
  switch (paper) {
    case "A6":
      return "A6 · 105 × 148 mm"
    case "A5":
      return "A5 · 148 × 210 mm"
    case "Thermal80":
      return "80 mm roll"
    default:
      return "A4 · 210 × 297 mm"
  }
}

/** Silent print at the preset — resolves after the printer accepted the job. */
export async function desktopDirectPrint(paper: PrintPaper): Promise<{ ok: boolean; message: string }> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const message = await invoke<string>("print_direct", { paper })
    return { ok: true, message }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Ask where to save the PDF, then render it at the preset size. */
export async function desktopSavePdf(
  paper: PrintPaper,
  defaultName: string,
): Promise<{ saved: boolean; path?: string; message?: string }> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const path = await save({
      defaultPath: defaultName.replace(/[\\/:*?"<>|]/g, "-") + ".pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    })
    if (!path) return { saved: false }
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("print_to_pdf", { paper, path })
    return { saved: true, path }
  } catch (e) {
    return { saved: false, message: e instanceof Error ? e.message : String(e) }
  }
}
