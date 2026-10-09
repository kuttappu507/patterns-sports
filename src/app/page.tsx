"use client"

// ============================================================
// PS-AMS :: Pattern Sports Academy Management System
// Desktop-style SPA shell — single window, view-switched like a
// Tauri native app. All modules mount here.
// Includes: branded boot screen, boot-failure banner and a last-
// resort ErrorBoundary so a runtime error never white-screens.
// ============================================================

import { Component, useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, RotateCcw, Trophy } from "lucide-react"
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
            <p className="mt-1 text-xs text-muted-foreground">
              PS-AMS hit an unexpected error. Your data is safe — the local database was not touched.
            </p>
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted p-2.5 text-left text-[10.5px] text-rose-600 dark:text-rose-300">
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

/* ---------------------------- boot screen ---------------------------- */

function BootScreen({ error }: { error: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lime-300 to-emerald-500 shadow-[0_0_36px_rgba(163,230,53,0.4)]"
      >
        <Trophy className="h-8 w-8 text-[#0b0e14]" strokeWidth={2.2} />
        <motion.span
          animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
          className="absolute inset-0 rounded-2xl border-2 border-lime-300/60"
        />
      </motion.div>
      <div className="text-center">
        <p className="font-display text-lg font-extrabold tracking-tight">
          PS<span className="text-primary">-</span>AMS
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">Starting Pattern Sports Academy Suite…</p>
      </div>
      <div className="h-1 w-44 overflow-hidden rounded-full bg-foreground/10">
        <motion.div
          animate={{ x: ["-100%", "220%"] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-cyan-500"
        />
      </div>
      {error && (
        <div className="mt-2 w-[min(92vw,520px)] rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3 text-center">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Offline backend warning</p>
          <p className="mt-1 break-words text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">{error}</p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            The interface will still load — data operations may be unavailable.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------- app ------------------------------- */

export default function Home() {
  const { view, activeStudentId, printPayload } = useAppStore()
  const [booted, setBooted] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [minSplashDone, setMinSplashDone] = useState(false)

  // Boot the offline backend (SQLite + media dirs) before any view loads.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (isTauri()) await initBackend()
      } catch (e) {
        console.error("Backend boot failed", e)
        if (alive) setBootError(e instanceof Error ? e.message : String(e))
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
    const t = setTimeout(() => setMinSplashDone(true), 650)
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

  if (!booted || !minSplashDone) {
    return <BootScreen error={booted ? bootError : null} />
  }

  return (
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
  )
}
