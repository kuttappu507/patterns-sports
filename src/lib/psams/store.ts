"use client"

// ============================================================
// PS-AMS :: Global SPA store — desktop-style view navigation
// with URL-hash routing (#/students, #/students/<id>, …) so the
// browser back/forward buttons and refreshes keep the current
// module, plus globally-mounted popup form state and the
// isolated print pipeline.
// ============================================================

import { create } from "zustand"
import type { PrintPayload, Student } from "@/lib/psams/types"

export type ViewKey = "dashboard" | "students" | "student-detail" | "fees" | "reports" | "attendance" | "settings"

const VALID_VIEWS: ViewKey[] = ["dashboard", "students", "student-detail", "fees", "reports", "attendance", "settings"]

interface AppState {
  view: ViewKey
  activeStudentId: string | null
  /** force-refresh token bumped after mutations */
  dataVersion: number
  printPayload: PrintPayload | null
  /** set when the offline backend failed to boot — surfaced in the shell footer */
  bootError: string | null

  /* ---- global popup forms (mounted once, reachable from every view) ---- */
  /** register / edit player popup */
  studentFormOpen: boolean
  studentFormEditing: Student | null
  /** collect-fee popup (optionally pre-targeted at one student) */
  collectFeeOpen: boolean
  collectFeeStudentId: string | null

  navigate: (view: ViewKey, studentId?: string | null) => void
  refresh: () => void
  setPrint: (p: PrintPayload | null) => void
  setBootError: (e: string | null) => void

  openStudentForm: (editing?: Student | null) => void
  closeStudentForm: () => void
  openCollectFee: (studentId?: string | null) => void
  closeCollectFee: () => void
}

/* ------------------------- hash routing ------------------------- */

/** Map a view (+ optional student) to its URL hash. */
function viewToHash(view: ViewKey, studentId: string | null): string {
  switch (view) {
    case "students":
      return "#/students"
    case "student-detail":
      return studentId ? `#/students/${studentId}` : "#/students"
    case "fees":
      return "#/fees"
    case "attendance":
      return "#/attendance"
    case "reports":
      return "#/reports"
    case "settings":
      return "#/settings"
    default:
      return "#/dashboard"
  }
}

/** Parse a location hash back into view state (unknown hashes fall back to the dashboard). */
function parseHash(hash: string): { view: ViewKey; studentId: string | null } {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean)
  const head = parts[0]
  if (head === "students") {
    if (parts[1]) return { view: "student-detail", studentId: parts[1] }
    return { view: "students", studentId: null }
  }
  if (head && VALID_VIEWS.includes(head as ViewKey)) {
    return { view: head as ViewKey, studentId: null }
  }
  return { view: "dashboard", studentId: null }
}

/**
 * Apply a location hash to the store (single source of truth for routing).
 * Entering the detail view bumps dataVersion so the profile refetches.
 */
function applyHash(hash: string) {
  const { view, studentId } = parseHash(hash)
  const s = useAppStore.getState()
  if (s.view === view && s.activeStudentId === studentId) return
  useAppStore.setState({
    view,
    activeStudentId: studentId,
    dataVersion: s.dataVersion + (view === "student-detail" ? 1 : 0),
  })
}

/**
 * Wire hash routing to the store. Call once on app boot:
 * restores the current module from the URL and keeps the store in
 * sync when the user walks browser history (back / forward).
 */
export function initHashRouting() {
  if (typeof window === "undefined") return
  if (window.location.hash) applyHash(window.location.hash)
  window.addEventListener("hashchange", () => applyHash(window.location.hash))
}

/* ---------------------------- store ---------------------------- */

export const useAppStore = create<AppState>((set, get) => ({
  view: "dashboard",
  activeStudentId: null,
  dataVersion: 0,
  printPayload: null,
  bootError: null,

  studentFormOpen: false,
  studentFormEditing: null,
  collectFeeOpen: false,
  collectFeeStudentId: null,

  navigate: (view, studentId = null) => {
    const target = viewToHash(view, studentId)
    if (typeof window !== "undefined") {
      // Assigning the hash fires `hashchange` → applyHash keeps state in sync
      // (and the entry lands in browser history, enabling back/forward).
      if (window.location.hash === target) {
        applyHash(target) // same URL — make sure state still applies (e.g. re-open detail)
      } else {
        window.location.hash = target
        return
      }
    }
    // SSR / test fallback — apply directly
    const s = get()
    if (s.view === view && s.activeStudentId === studentId) return
    set({
      view,
      activeStudentId: studentId,
      dataVersion: s.dataVersion + (view === "student-detail" ? 1 : 0),
    })
  },

  refresh: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setPrint: (printPayload) => set({ printPayload }),
  setBootError: (bootError) => set({ bootError }),

  openStudentForm: (editing = null) => set({ studentFormOpen: true, studentFormEditing: editing ?? null }),
  closeStudentForm: () => set({ studentFormOpen: false, studentFormEditing: null }),
  openCollectFee: (studentId = null) => set({ collectFeeOpen: true, collectFeeStudentId: studentId ?? null }),
  closeCollectFee: () => set({ collectFeeOpen: false, collectFeeStudentId: null }),
}))
