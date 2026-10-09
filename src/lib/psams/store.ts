"use client"

// ============================================================
// PS-AMS :: Global SPA store — desktop-style view navigation,
// drawer state, and the isolated print pipeline.
// ============================================================

import { create } from "zustand"
import type { PrintPayload } from "@/lib/psams/types"

export type ViewKey = "dashboard" | "students" | "student-detail" | "fees" | "reports" | "attendance" | "settings"

interface AppState {
  view: ViewKey
  activeStudentId: string | null
  /** force-refresh token bumped after mutations */
  dataVersion: number
  printPayload: PrintPayload | null

  navigate: (view: ViewKey, studentId?: string | null) => void
  refresh: () => void
  setPrint: (p: PrintPayload | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: "dashboard",
  activeStudentId: null,
  dataVersion: 0,
  printPayload: null,

  navigate: (view, studentId = null) =>
    set((s) => ({
      view,
      activeStudentId: view === "student-detail" ? studentId : studentId === null ? null : studentId,
      dataVersion: s.dataVersion + (view === "student-detail" ? 1 : 0),
    })),
  refresh: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  setPrint: (printPayload) => set({ printPayload }),
}))
