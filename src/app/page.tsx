"use client"

// ============================================================
// PS-AMS :: Pattern Sports Volleyball Academy Management System
// Desktop-style SPA shell — single window, view-switched like a
// Tauri native app. All modules mount here.
// Includes: branded volleyball splash screen, boot-failure
// banner and a last-resort ErrorBoundary so a runtime error
// never white-screens.
// ============================================================

import { Component, useEffect, useState, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { useAppStore, initHashRouting } from "@/lib/psams/store"
import { AppShell } from "@/components/psams/app-shell"
import { Splash } from "@/components/psams/splash"
import { PrintRoot } from "@/components/psams/prints/print-root"
import { StudentFormDialog } from "@/components/psams/student-form-dialog"
import { CollectFeeDialog } from "@/components/psams/collect-fee-dialog"
import { DashboardView } from "@/components/psams/views/dashboard-view"
import { StudentsView } from "@/components/psams/views/students-view"
import { StudentDetailView } from "@/components/psams/views/student-detail-view"
import { FeesView } from "@/components/psams/views/fees-view"
import { ReportsView } from "@/components/psams/views/reports-view"
import { AttendanceView } from "@/components/psams/views/attendance-view"
import { SettingsView } from "@/components/psams/views/settings-view"
import { initBackend, isTauri } from "@/lib/psams/api"
import { Button } from "@/components/ui/button"

/* ---------- last-resort error boundary (no white screens) ---------- */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("PS-AMS render error:", error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
          <div className="glass w-full max-w-lg rounded-2xl p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-3 font-display text-lg font-bold">Something went wrong</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              PS-AMS hit an unexpected error. Your data is safe — the local database was not touched.
            </p>
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-2.5 text-left text-xs text-rose-600 dark:text-rose-300">
              {this.state.error.message}
            </pre>
            <Button
              size="sm"
              className="mt-4 rounded-lg bg-primary font-semibold text-primary-foreground hover:brightness-110"
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reload interface
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/* ------------------------------- app ------------------------------- */

export default function Home() {
  const { view, activeStudentId, printPayload } = useAppStore()
  const [booted, setBooted] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [minSplashDone, setMinSplashDone] = useState(false)
  const [splashGone, setSplashGone] = useState(false)

  // Boot the offline backend (SQLite + media dirs) before any view loads,
  // and wire hash routing (#/students, #/fees, …) so refresh + browser
  // back/forward keep the current module.
  useEffect(() => {
    initHashRouting()
    let alive = true
    ;(async () => {
      try {
        if (isTauri()) await initBackend()
      } catch (e) {
        console.error("Backend boot failed", e)
        if (alive) {
          const msg = e instanceof Error ? e.message : String(e)
          setBootError(msg)
          // also surface it in the shell footer — the splash disappears, the error must not
          useAppStore.getState().setBootError(msg)
        }
      } finally {
        if (alive) setBooted(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // keep the branded splash visible just long enough to feel intentional
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 2200)
    return () => clearTimeout(t)
  }, [])

  // Guard: escape hatch from a stuck print payload
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && printPayload) useAppStore.getState().setPrint(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [printPayload])

  const splashVisible = !booted || !minSplashDone

  return (
    <>
      <ErrorBoundary>
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
      </ErrorBoundary>

      {/* app-wide popup forms — reachable from every module via the store */}
      <StudentFormDialog />
      <CollectFeeDialog />

      {/* branded volleyball splash — rides above the app, exits with a flourish */}
      {!splashGone && (
        <AnimatePresence onExitComplete={() => setSplashGone(true)}>
          {splashVisible && <Splash error={booted ? bootError : null} />}
        </AnimatePresence>
      )}
    </>
  )
}
