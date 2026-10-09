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
  WifiOff,
  ChevronLeft,
  Plus,
  BadgeIndianRupee,
  Trophy,
} from "lucide-react"
import { useAppStore, type ViewKey } from "@/lib/psams/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRevealMouse } from "@/components/psams/fx"

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard; title: string; subtitle: string; hint: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Alt+1", title: "Executive Dashboard", subtitle: "Academy at a glance — enrolment, fee cycle and leadership" },
  { key: "students", label: "Students", icon: Users, hint: "Alt+2", title: "Student Profiles", subtitle: "Bio-data, athletic metrics, documents & achievements" },
  { key: "fees", label: "Fees & Receipts", icon: ReceiptIndianRupee, hint: "Alt+3", title: "Fee Management", subtitle: "Collections, multi-month settle, POS receipts & defaulters" },
  { key: "attendance", label: "Attendance", icon: ClipboardCheck, hint: "Alt+4", title: "Court-Side Attendance", subtitle: "Daily session register by batch and age category" },
  { key: "reports", label: "Search & Reports", icon: FileSearch, hint: "Alt+5", title: "Smart Search & Reports", subtitle: "Multi-parameter filtering with formal export pipelines" },
  { key: "settings", label: "Administration", icon: Settings2, hint: "Alt+6", title: "Committee & Administration", subtitle: "Executive committee, academy profile and data safety" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, navigate } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [clock, setClock] = useState("")
  const onMouseMove = useRevealMouse()

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
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
      <div id="psams-root" className="flex h-screen w-screen overflow-hidden">
        {/* ---------------- Sidebar (dark glass NavigationView) ---------------- */}
        <motion.aside
          animate={{ width: collapsed ? 64 : 244 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="relative z-20 flex h-full shrink-0 flex-col border-r border-white/[0.06] backdrop-blur-2xl"
          style={{ background: "var(--sidebar)" }}
        >
          {/* brand */}
          <div className={cn("flex items-center gap-2.5 px-3 pb-4 pt-5", collapsed && "justify-center px-0")}>
            <motion.div
              whileHover={{ rotate: -8, scale: 1.06 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-300 to-emerald-500 shadow-[0_0_22px_rgba(163,230,53,0.35)]"
            >
              <Trophy className="h-5 w-5 text-[#0b0e14]" strokeWidth={2.4} />
            </motion.div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-display text-[15px] font-extrabold leading-tight tracking-tight">
                  PS<span className="text-lime-400">-</span>AMS
                </div>
                <div className="truncate text-[10.5px] font-medium leading-tight text-muted-foreground">
                  Pattern Sports Academy
                </div>
              </div>
            )}
          </div>

          {/* nav */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-1 no-scrollbar">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = view === item.key || (isDetail && item.key === "students")
              const button = (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  onMouseMove={onMouseMove}
                  className={cn(
                    "reveal-item group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200",
                    isActive
                      ? "text-lime-200"
                      : "text-slate-400 hover:translate-x-0.5 hover:text-slate-100"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="absolute inset-0 rounded-xl border border-lime-400/25 bg-lime-400/[0.09] shadow-[0_0_18px_-4px_rgba(163,230,53,0.35)]"
                    />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="nav-rail"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="absolute -left-2.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-lime-300 to-cyan-400 shadow-[0_0_10px_rgba(163,230,53,0.7)]"
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative z-10 h-[18px] w-[18px] shrink-0 transition-all duration-200",
                      isActive
                        ? "text-lime-300 drop-shadow-[0_0_6px_rgba(163,230,53,0.55)]"
                        : "text-slate-500 group-hover:text-slate-200 group-hover:scale-110"
                    )}
                    strokeWidth={isActive ? 2.3 : 2}
                  />
                  {!collapsed && <span className="relative z-10 truncate">{item.label}</span>}
                  {!collapsed && (
                    <span
                      className={cn(
                        "relative z-10 ml-auto text-[9.5px] font-semibold tracking-wider text-slate-600 transition-colors group-hover:text-slate-500",
                        isActive && "text-lime-700"
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
                  <TooltipContent side="right" className="border border-white/10 bg-popover text-popover-foreground">
                    {item.label} <span className="ml-1 text-muted-foreground">{item.hint}</span>
                  </TooltipContent>
                </Tooltip>
              ) : (
                button
              )
            })}
          </nav>

          {/* footer block */}
          <div className="space-y-1 px-2.5 pb-4">
            {!collapsed && (
              <div className="mx-1 mb-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Local SQLite · Connected
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                  <WifiOff className="h-3 w-3" /> Offline-first · data stays on this PC
                </div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")} />
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </motion.aside>

        {/* ---------------- Main column ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header strip */}
          <header className="z-10 flex items-center gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-3 backdrop-blur-xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.key + (isDetail ? "-detail" : "")}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                <h1 className="truncate font-display text-[16px] font-bold leading-tight">
                  {isDetail ? "Player Profile" : active.title}
                </h1>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {isDetail ? "Bio-data, athletic parameters, documents and career milestones" : active.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                className="btn-sheen h-8 gap-1.5 rounded-lg bg-lime-400 text-[12px] font-semibold text-[#0b0e14] shadow-[0_0_16px_-4px_rgba(163,230,53,0.5)] transition-all hover:bg-lime-300 hover:shadow-[0_0_22px_-4px_rgba(163,230,53,0.7)] active:scale-[0.97]"
                onClick={() => navigate("students")}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add New Student
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-lg border-white/12 bg-white/[0.04] text-[12px] font-medium text-slate-200 transition-all hover:border-lime-400/40 hover:bg-white/[0.07] hover:text-lime-200 active:scale-[0.97]"
                onClick={() => navigate("fees")}
              >
                <BadgeIndianRupee className="h-3.5 w-3.5" /> Collect Fee
              </Button>
              <div className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-muted-foreground lg:flex">
                <Database className="h-3 w-3 text-lime-400/80" />
                {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {clock}
              </div>
            </div>
          </header>

          {/* View container with choreographed transitions */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + String(useAppStore.getState().activeStudentId ?? "")}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.24, ease: [0.25, 0.6, 0.35, 1] }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Status bar */}
          <footer className="flex items-center gap-3 border-t border-white/[0.06] bg-white/[0.02] px-4 py-1.5 text-[10.5px] text-muted-foreground backdrop-blur">
            <span className="font-semibold text-slate-400">Pattern Sports Academy Management System</span>
            <span className="text-slate-700">·</span>
            <span className="tnum">PS-AMS v1.1</span>
            <span className="ml-auto hidden items-center gap-1.5 sm:inline-flex">
              <kbd className="rounded border border-white/10 bg-white/[0.05] px-1 py-px font-sans text-[9px] text-slate-500">Alt</kbd>
              <span>+ 1-6 to switch modules</span>
            </span>
            <span className="hidden lg:inline">Print: A4 profile · A5 receipt · 80 mm thermal</span>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  )
}
