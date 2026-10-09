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

const NAV: { key: ViewKey; label: string; icon: typeof LayoutDashboard; title: string; subtitle: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, title: "Executive Dashboard", subtitle: "Academy at a glance — enrolment, fee cycle and leadership" },
  { key: "students", label: "Students", icon: Users, title: "Student Profiles", subtitle: "Bio-data, athletic metrics, documents & achievements" },
  { key: "fees", label: "Fees & Receipts", icon: ReceiptIndianRupee, title: "Fee Management", subtitle: "Collections, multi-month settle, POS receipts & defaulters" },
  { key: "attendance", label: "Attendance", icon: ClipboardCheck, title: "Court-Side Attendance", subtitle: "Daily session register by batch and age category" },
  { key: "reports", label: "Search & Reports", icon: FileSearch, title: "Smart Search & Reports", subtitle: "Multi-parameter filtering with formal export pipelines" },
  { key: "settings", label: "Administration", icon: Settings2, title: "Committee & Administration", subtitle: "Executive committee, academy profile and data safety" },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { view, navigate } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [clock, setClock] = useState("")

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  const active = NAV.find((n) => n.key === view) ?? NAV[0]
  const isDetail = view === "student-detail"

  return (
    <TooltipProvider delayDuration={200}>
      <div id="psams-root" className="flex h-screen w-screen overflow-hidden">
        {/* ---------------- Sidebar (Windows 11 NavigationView) ---------------- */}
        <motion.aside
          animate={{ width: collapsed ? 60 : 236 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="relative z-20 flex h-full shrink-0 flex-col border-r border-sidebar-border"
          style={{ background: "var(--sidebar)", backdropFilter: "blur(24px)" }}
        >
          <div className={cn("flex items-center gap-2.5 px-3 pb-3 pt-4", collapsed && "justify-center px-0")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0f7ad6] to-[#005fb8] shadow-sm">
              <Trophy className="h-4.5 w-4.5 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-tight">PS-AMS</div>
                <div className="truncate text-[10.5px] text-muted-foreground leading-tight">Sports Academy Suite</div>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
            {NAV.map((item) => {
              const Icon = item.icon
              const isActive = view === item.key || (isDetail && item.key === "students")
              const button = (
                <button
                  key={item.key}
                  onClick={() => navigate(item.key)}
                  className={cn(
                    "reveal-item group relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      : "text-foreground/80 hover:bg-black/[0.045]"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              )
              return collapsed ? (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                button
              )
            })}
          </nav>

          <div className="space-y-1 px-2 pb-3">
            {!collapsed && (
              <div className="mx-1 mb-2 rounded-lg border bg-white/50 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                  <Database className="h-3 w-3" /> Local SQLite · Connected
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <WifiOff className="h-3 w-3" /> Offline-first ready
                </div>
              </div>
            )}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.045]"
            >
              <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </motion.aside>

        {/* ---------------- Main column ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header strip */}
          <header className="acrylic-dark-strip z-10 flex items-center gap-4 border-b px-5 py-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.key + (isDetail ? "-detail" : "")}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="min-w-0"
              >
                <h1 className="truncate text-[15px] font-semibold leading-tight">
                  {isDetail ? "Player Profile" : active.title}
                </h1>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {isDetail ? "Bio-data, athletic parameters, documents and career milestones" : active.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate("students")}>
                <Plus className="h-3.5 w-3.5" /> Add New Student
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 bg-white/60 text-xs"
                onClick={() => navigate("fees")}
              >
                <BadgeIndianRupee className="h-3.5 w-3.5" /> Collect Fee
              </Button>
              <div className="hidden items-center rounded-md border bg-white/50 px-2.5 py-1.5 text-[11.5px] text-muted-foreground lg:flex">
                {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {clock}
              </div>
            </div>
          </header>

          {/* View container with choreographed transitions */}
          <main className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view + String(useAppStore.getState().activeStudentId ?? "")}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: [0.25, 0.6, 0.35, 1] }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Status bar */}
          <footer className="flex items-center gap-3 border-t bg-white/55 px-4 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
            <span className="font-medium text-foreground/70">Pattern Sports Academy Management System</span>
            <span>·</span>
            <span>PS-AMS v1.0</span>
            <span className="ml-auto hidden sm:inline">Print pipelines: A4 profile · A5 receipt · 80 mm thermal</span>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  )
}
