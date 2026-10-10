"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  LayoutDashboard,
  Users,
  ReceiptIndianRupee,
  ClipboardCheck,
  FileSearch,
  Settings2,
  Database,
  ChevronLeft,
  Plus,
  BadgeIndianRupee,
  Volleyball,
  Minus,
  Square,
  X,
  TriangleAlert,
  MapPin,
} from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useAppStore, type ViewKey } from "@/lib/psams/store"
import { isTauri } from "@/lib/psams/api"
import { openExternal, initWaBridge } from "@/lib/psams/whatsapp"
import { ACADEMY_MAPS_URL } from "@/lib/psams/domain"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRevealMouse } from "@/components/psams/fx"
import { ThemeToggle } from "@/components/psams/theme"

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard; title: string; subtitle: string; hint: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Alt+1", title: "Executive Dashboard", subtitle: "The academy at a glance — enrolment, fee cycle and court leadership" },
  { key: "students", label: "Players", icon: Users, hint: "Alt+2", title: "Player Profiles", subtitle: "Bio-data, athletic metrics, documents & career achievements" },
  { key: "fees", label: "Fees & Receipts", icon: ReceiptIndianRupee, hint: "Alt+3", title: "Fee Management", subtitle: "Collections, multi-month settle, POS receipts & defaulters" },
  { key: "attendance", label: "Attendance", icon: ClipboardCheck, hint: "Alt+4", title: "Court-Side Attendance", subtitle: "Daily session register by batch and age category" },
  { key: "reports", label: "Search & Reports", icon: FileSearch, hint: "Alt+5", title: "Smart Search & Reports", subtitle: "Multi-parameter filtering with formal export pipelines" },
  { key: "settings", label: "Administration", icon: Settings2, hint: "Alt+6", title: "Committee & Administration", subtitle: "Executive committee, academy profile and data safety" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, navigate, bootError, openStudentForm, openCollectFee } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [clock, setClock] = useState("")
  const onMouseMove = useRevealMouse()
  // Frameless window chrome — only inside the Tauri desktop shell.
  // getCurrentWindow() reads Tauri-injected internals and would throw on
  // the web, hence the isTauri() guard before touching it.
  const [win] = useState(() => (isTauri() ? getCurrentWindow() : null))

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  // WhatsApp linked-device bridge — listen for sidecar events (status,
  // QR, connected, send acks) and seed the store from the Rust snapshot.
  // Desktop only; the sidecar itself auto-connects at boot (lib.rs setup).
  useEffect(() => {
    initWaBridge()
  }, [])

  // Alt+1..6 module shortcuts — desktop-app muscle memory
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < NAV.length) {
        e.preventDefault()
        navigate(NAV[idx].key)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate])

  const active = NAV.find((n) => n.key === view) ?? NAV[0]
  const isDetail = view === "student-detail"

  return (
    <TooltipProvider delayDuration={150}>
      <div id="psams-root" className="relative flex h-screen w-screen overflow-hidden">
        {/* ---------------- Sidebar — always-dark "club room" with court patterns ---------------- */}
        <motion.aside
          animate={{ width: collapsed ? 72 : 268 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="sidebar-court relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.06]"
        >
          {/* spike line across the top edge */}
          <div className="absolute inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-[#ef476f] via-[#ff6b8d]/70 to-[#ffd166]" />

          {/* brand — volleyball tile with spin-on-hover ball */}
          <div className={cn("relative z-10 flex items-center gap-3 px-4 pb-5 pt-6", collapsed && "justify-center px-0")}>
            <motion.div
              whileHover={{ y: -4, scale: 1.08 }}
              transition={{ type: "spring", stiffness: 380, damping: 15 }}
              className="brand-tile group relative flex h-11 w-11 shrink-0 cursor-default items-center justify-center rounded-2xl"
            >
              <Volleyball className="spin-on-hover h-6 w-6 text-white" strokeWidth={2.2} />
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#073b4c] bg-[#ffd166] shadow-[0_0_10px_rgba(255,209,102,0.9)]" />
            </motion.div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-white">
                  Pattern Sports
                </div>
                <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-rose-200/60">
                  Volleyball Academy
                </div>
              </div>
            )}
          </div>

          {/* nav */}
          <nav className="relative z-10 flex-1 space-y-1.5 overflow-y-auto px-3 py-1 no-scrollbar">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = view === item.key || (isDetail && item.key === "students")
              const button = (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  onMouseMove={onMouseMove}
                  className={cn(
                    "reveal-item group relative flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-[14.5px] font-medium transition-colors duration-150",
                    isActive
                      ? "text-white"
                      : "text-sky-100/60 hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="nav-pill absolute inset-0 rounded-xl"
                    />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="nav-rail"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="nav-rail absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative z-10 h-5 w-5 shrink-0 transition-all duration-200",
                      isActive
                        ? "text-white drop-shadow-[0_0_8px_rgba(255,159,179,0.8)]"
                        : "text-sky-200/50 group-hover:scale-110 group-hover:text-white"
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                  {!collapsed && (
                    <span
                      className={cn(
                        "relative z-10 ml-auto text-[10px] font-semibold tracking-wider text-sky-200/30 transition-colors group-hover:text-sky-100/70",
                        isActive && "text-sky-100/80"
                      )}
                    >
                      {item.hint}
                    </span>
                  )}
                </button>
              )
              return collapsed ? (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right" className="border border-border bg-popover text-popover-foreground">
                    {item.label} <span className="ml-1 text-muted-foreground">{item.hint}</span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                button
              )
            })}
          </nav>

          {/* footer — version marker only (status text intentionally removed) */}
          <div className="relative z-10 pb-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/30">
              {collapsed ? "v1.6.0" : "PS-AMS · v1.6.0"}
            </span>
          </div>
        </motion.aside>

        {/* ---- Protruding collapse handle — vertically centered on the sidebar edge ---- */}
        <motion.button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
          animate={{ left: collapsed ? 72 : 268 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          className="absolute top-1/2 z-30 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-[0_6px_18px_-4px_rgba(7,59,76,0.35)] transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_8px_22px_-6px_rgba(239,71,111,0.65)] dark:shadow-[0_0_16px_-4px_rgba(0,0,0,0.8)] dark:hover:shadow-[0_0_20px_-4px_rgba(255,107,141,0.7)]"
        >
          <ChevronLeft className={cn("h-4.5 w-4.5 transition-transform duration-300", collapsed && "rotate-180")} />
        </motion.button>

        {/* ---------------- Main column ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header strip — doubles as the frameless window drag region */}
          <header
            data-tauri-drag-region
            className="z-10 flex items-center gap-4 border-b border-border bg-card px-6 py-3.5 select-none"
            style={win ? { paddingTop: 10, paddingBottom: 10 } : undefined}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active.key + (isDetail ? "-detail" : "")}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                data-tauri-drag-region
                className="min-w-0"
              >
                <h1 className="truncate font-display text-[21px] font-extrabold leading-tight">
                  {isDetail ? "Player Profile" : active.title}
                </h1>
                <p className="truncate text-[13px] text-muted-foreground">
                  {isDetail ? "Bio-data, athletic parameters, documents and career milestones" : active.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="ml-auto flex items-center gap-2.5">
              <ThemeToggle className="h-9 w-9 rounded-xl" />
              <Button
                size="sm"
                className="btn-sheen h-9 gap-2 rounded-xl bg-primary px-3.5 text-[13.5px] font-semibold text-primary-foreground shadow-[0_10px_22px_-10px_rgba(239,71,111,0.65)] transition-all hover:brightness-110 hover:shadow-[0_12px_26px_-10px_rgba(239,71,111,0.75)] active:scale-[0.97] dark:shadow-[0_0_18px_-4px_rgba(255,107,141,0.55)] dark:hover:shadow-[0_0_24px_-4px_rgba(255,107,141,0.75)]"
                onClick={() => openStudentForm(null)}
              >
                <Plus className="h-4 w-4" strokeWidth={2.6} /> Add New Player
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-2 rounded-xl border-border bg-card px-3.5 text-[13.5px] font-medium text-foreground transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]"
                onClick={() => openCollectFee()}
              >
                <BadgeIndianRupee className="h-4 w-4" /> Collect Fee
              </Button>
              <div className="hidden items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-[12.5px] text-muted-foreground lg:flex">
                <Database className="h-3.5 w-3.5 text-primary/80" />
                {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {clock}
              </div>

              {/* ---- Frameless window controls (desktop shell only) ---- */}
              {win && (
                <div className="ml-1 flex items-center gap-0.5 pl-1.5">
                  <button
                    title="Minimize"
                    aria-label="Minimize window"
                    onClick={() => void win.minimize()}
                    className="flex h-9 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    title="Maximize / Restore"
                    aria-label="Maximize or restore window"
                    onClick={() => void win.toggleMaximize()}
                    className="flex h-9 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
                  >
                    <Square className="h-3 w-3" />
                  </button>
                  <button
                    title="Close"
                    aria-label="Close window"
                    onClick={() => void win.close()}
                    className="flex h-9 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500 hover:text-white active:scale-95"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* View container with choreographed transitions (transform+opacity only — GPU-cheap) */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + String(useAppStore.getState().activeStudentId ?? "")}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="h-full transform-gpu"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Status bar */}
          <footer className="court-net flex items-center gap-3 border-t border-border bg-card px-5 py-2 text-[12px] text-muted-foreground">
            {bootError ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300" title={bootError}>
                <TriangleAlert className="h-3.5 w-3.5" /> Local database degraded — restart the app
              </span>
            ) : null}
            <span className="font-semibold text-muted-foreground">Pattern Sports Volleyball Academy</span>
            <span className="text-border">·</span>
            <span className="tnum">PS-AMS v1.6.0</span>
            <button
              type="button"
              className="hidden items-center gap-1 rounded-full border border-border bg-card/60 px-2.5 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
              title="Open the academy location in Google Maps"
              onClick={() => {
                void openExternal(ACADEMY_MAPS_URL).catch(() => window.open(ACADEMY_MAPS_URL, "_blank", "noopener,noreferrer"))
              }}
            >
              <MapPin className="h-3 w-3 text-primary/80" /> Karanthur, Kozhikode · Map
            </button>
            <span className="ml-auto hidden items-center gap-1.5 sm:inline-flex">
              <kbd className="rounded border border-border bg-muted px-1.5 py-px font-sans text-[10px] text-muted-foreground">Alt</kbd>
              <span>+ 1-6 to switch modules</span>
            </span>
            <span className="hidden lg:inline">Print: A4 profile · A5 receipt · 80 mm thermal</span>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  )
}
