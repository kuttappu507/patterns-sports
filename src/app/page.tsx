"use client"

// ============================================================
// PS-AMS :: Pattern Sports Academy Management System
// Desktop-style SPA shell — single window, view-switched like a
// Tauri native app. All modules mount here.
// ============================================================

import { useEffect, useState } from "react"
import { useAppStore } from "@/lib/psams/store"
import { AppShell } from "@/components/psams/app-shell"
import { PrintRoot } from "@/components/psams/prints/print-root"
import { DashboardView } from "@/components/psams/views/dashboard-view"
import { StudentsView } from "@/components/psams/views/students-view"
import { StudentDetailView } from "@/components/psams/views/student-detail-view"
import { FeesView } from "@/components/psams/views/fees-view"
import { ReportsView } from "@/components/psams/views/reports-view"
import { AttendanceView } from "@/components/psams/views/attendance-view"
import { SettingsView } from "@/components/psams/views/settings-view"
import { initBackend, isTauri } from "@/lib/psams/api"

export default function Home() {
  const { view, activeStudentId, printPayload } = useAppStore()
  const [booted, setBooted] = useState(false)

  // Boot the offline backend (SQLite + media dirs) before any view loads.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (isTauri()) await initBackend()
      } catch (e) {
        console.error("Backend boot failed", e)
      } finally {
        if (alive) setBooted(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Guard: escape hatch from a stuck print payload
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && printPayload) useAppStore.getState().setPrint(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [printPayload])

  if (!booted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Starting PS-AMS…</p>
      </div>
    )
  }

  return (
    <>
      <AppShell>
        {view === "dashboard" && <DashboardView />}
        {view === "students" && <StudentsView />}
        {view === "student-detail" && (activeStudentId ? <StudentDetailView studentId={activeStudentId} /> : <StudentsView />)}
        {view === "fees" && <FeesView />}
        {view === "reports" && <ReportsView />}
        {view === "attendance" && <AttendanceView />}
        {view === "settings" && <SettingsView />}
      </AppShell>
      <PrintRoot />
    </>
  )
}
