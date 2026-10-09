"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Users,
  BadgeIndianRupee,
  AlertTriangle,
  TrendingUp,
  UserPlus,
  Receipt,
  FileSearch,
  Cake,
  Phone,
  ClipboardCheck,
  Volleyball,
} from "lucide-react"
import { fetchDashboard, mediaUrl } from "@/lib/psams/api"
import { formatINR, formatDate, CATEGORY_COLORS, CATEGORY_GRADIENTS } from "@/lib/psams/domain"
import type { DashboardStats } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { CountUp } from "@/components/psams/count-up"
import { Button } from "@/components/ui/button"
import { Shimmer, Stagger, StaggerItem, useRevealMouse, EmptyState } from "@/components/psams/fx"

const stagger = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" as const } }),
}

export function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { navigate, dataVersion, openStudentForm, openCollectFee } = useAppStore()
  const onMouseMove = useRevealMouse()

  useEffect(() => {
    let alive = true
    fetchDashboard()
      .then((s) => {
        if (!alive) return
        setStats(s)
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setStats(null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [dataVersion])

  if (loading && !stats) {
    return (
      <div className="space-y-4 p-5">
        <Shimmer className="h-28 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Shimmer className="h-72 rounded-2xl" />
          <Shimmer className="h-72 rounded-2xl xl:col-span-2" />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6 text-rose-500 dark:text-rose-300" />}
        title="Dashboard is offline"
        hint="Could not read local statistics. Check that the embedded SQLite database is reachable, then press Alt+1 to retry."
        action={
          <Button size="sm" variant="outline" className="border-border bg-card hover:bg-muted" onClick={() => useAppStore.getState().refresh()}>
            Retry
          </Button>
        }
      />
    )
  }

  const maxCat = Math.max(...stats.categoryBreakdown.map((c) => c.count), 1)

  return (
    <Stagger className="space-y-5 p-5">
      {/* -------- Hero band — court graphic wash -------- */}
      <StaggerItem>
        <div
          onMouseMove={onMouseMove}
          className="hero-band hero-court reveal-item relative overflow-hidden rounded-2xl p-6"
        >
          <Volleyball className="float-slow absolute right-[290px] top-4 hidden h-24 w-24 text-primary/[0.07] dark:text-primary/10 lg:block" strokeWidth={1} />
          <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.22em] text-primary/80">This cycle · live</p>
              <div className="mt-1.5 flex items-baseline gap-3">
                <span className="font-display text-[52px] font-extrabold leading-none tracking-tight text-gradient tnum">
                  {stats.feeCycle.collectionRate}%
                </span>
                <span className="text-[15px] font-semibold text-foreground/70">collection rate</span>
              </div>
              <p className="mt-1.5 text-[14px] text-muted-foreground">
                {stats.feeCycle.paidCount} settled · {stats.feeCycle.dueSoonCount} due · {stats.feeCycle.defaulterCount} overdue
              </p>
            </div>


            <div className="h-14 w-px bg-border" />

            <div className="flex items-center gap-6">
              <div>
                <p className="text-[15px] font-medium uppercase tracking-wide text-muted-foreground">Month revenue</p>
                <p className="mt-0.5 font-display text-[30px] font-extrabold tnum text-amber-600 dark:text-amber-300">
                  <CountUp value={stats.monthRevenue} format={(n) => formatINR(Math.round(n))} />
                </p>
              </div>
              <div>
                <p className="text-[15px] font-medium uppercase tracking-wide text-muted-foreground">Roster</p>
                <p className="mt-0.5 font-display text-[30px] font-extrabold tnum text-teal-600 dark:text-teal-300">
                  <CountUp value={stats.totalActive} />
                </p>
              </div>
              <div>
                <p className="text-[15px] font-medium uppercase tracking-wide text-muted-foreground">Present today</p>
                <p className="mt-0.5 font-display text-[30px] font-extrabold tnum text-violet-600 dark:text-violet-300">
                  <CountUp value={stats.attendanceToday.present} />
                  <span className="text-base font-semibold text-muted-foreground">/{stats.attendanceToday.totalActive}</span>
                </p>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" className="btn-sheen h-8 gap-1.5 rounded-lg bg-primary text-[14px] font-semibold text-primary-foreground shadow-[0_8px_18px_-8px_rgba(99, 102, 241,0.6)] transition-all hover:brightness-110 active:scale-[0.97] dark:shadow-[0_0_16px_-4px_rgba(129, 140, 248,0.55)]" onClick={() => openStudentForm(null)}>
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2.6} /> Add New Student
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-border bg-card text-[14px] text-foreground transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]" onClick={() => openCollectFee()}>
                <Receipt className="h-3.5 w-3.5" /> Collect Fee
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-border bg-card text-[14px] text-foreground transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]" onClick={() => navigate("reports")}>
                <FileSearch className="h-3.5 w-3.5" /> Reports
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-border bg-card text-[14px] text-foreground transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]" onClick={() => navigate("attendance")}>
                <ClipboardCheck className="h-3.5 w-3.5" /> Attendance
              </Button>
            </div>
          </div>
        </div>
      </StaggerItem>

      {/* -------- Metric cards -------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index={0}
          icon={<Users className="h-4 w-4" />}
          tint="bg-teal-500/10 text-teal-600 shadow-[0_0_14px_-4px_rgba(20, 184, 166,0.4)] dark:bg-teal-400/10 dark:text-teal-300 dark:shadow-[0_0_14px_-4px_rgba(45, 212, 191,0.5)]"
          label="Active Enrolled Students"
          value={stats.totalActive}
          format={(n) => String(Math.round(n))}
          footer={`${stats.attendanceToday.present} present at today's session`}
          onClick={() => navigate("students")}
        />
        <MetricCard
          index={1}
          icon={<BadgeIndianRupee className="h-4 w-4" />}
          tint="bg-indigo-500/10 text-indigo-600 shadow-[0_0_14px_-4px_rgba(99, 102, 241,0.45)] dark:bg-indigo-400/10 dark:text-indigo-300 dark:shadow-[0_0_14px_-4px_rgba(129, 140, 248,0.5)]"
          label="Revenue — Current Month"
          value={stats.monthRevenue}
          format={(n) => formatINR(Math.round(n))}
          footer={`Collected today: ${formatINR(stats.todayRevenue)}`}
          onClick={() => navigate("fees")}
        />
        <MetricCard
          index={2}
          icon={<Receipt className="h-4 w-4" />}
          tint="bg-violet-500/10 text-violet-600 shadow-[0_0_14px_-4px_rgba(124,58,237,0.4)] dark:bg-violet-400/10 dark:text-violet-300 dark:shadow-[0_0_14px_-4px_rgba(167,139,250,0.5)]"
          label="Fees Settled — Current Cycle"
          value={stats.feeCycle.paidCount}
          format={(n) => String(Math.round(n))}
          footer={`${stats.feeCycle.collectionRate}% of active roster`}
          onClick={() => navigate("fees")}
        />
        <MetricCard
          index={3}
          icon={<AlertTriangle className="h-4 w-4" />}
          tint="bg-rose-500/10 text-rose-600 shadow-[0_0_14px_-4px_rgba(225,29,72,0.4)] dark:bg-rose-400/10 dark:text-rose-300 dark:shadow-[0_0_14px_-4px_rgba(251,113,133,0.5)]"
          label="Overdue Defaulters (>1 month)"
          value={stats.feeCycle.defaulterCount}
          format={(n) => String(Math.round(n))}
          footer={`${stats.feeCycle.dueSoonCount} due for the current month`}
          onClick={() => navigate("fees", null)}
          danger={stats.feeCycle.defaulterCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* -------- Category distribution -------- */}
        <StaggerItem className="h-full">
          <div onMouseMove={onMouseMove} className="reveal-item hover-lift glass h-full rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Category Distribution</h3>
              <TrendingUp className="h-3.5 w-3.5 text-primary/70" />
            </div>
            <p className="mt-0.5 text-[15.5px] text-muted-foreground">Active roster across five age brackets</p>
            <div className="mt-4 space-y-3.5">
              {stats.categoryBreakdown.map((c) => (
                <div key={c.category} className="group">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full border px-2 py-0.5 text-[14.5px] font-semibold transition-transform duration-200 group-hover:scale-105 ${CATEGORY_COLORS[c.category]}`}>
                      {c.category}
                    </span>
                    <span className="tnum text-[14px] font-bold">{c.count}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/[0.07]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(c.count / maxCat) * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 0.68, 0.31, 1], delay: 0.15 }}
                      className={`h-full rounded-full bg-gradient-to-r ${CATEGORY_GRADIENTS[c.category] ?? "from-primary to-amber-400"} shadow-[0_0_10px_-2px_rgba(99, 102, 241,0.5)] dark:shadow-[0_0_10px_-2px_rgba(129, 140, 248,0.65)]`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </StaggerItem>

        {/* -------- Committee showcase -------- */}
        <StaggerItem className="h-full xl:col-span-2">
          <div onMouseMove={onMouseMove} className="reveal-item hover-lift glass flex h-full flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Executive Committee</h3>
                <p className="mt-0.5 text-[15.5px] text-muted-foreground">Academy leadership & administration</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 rounded-lg text-[15.5px] text-muted-foreground hover:bg-muted hover:text-primary" onClick={() => navigate("settings")}>
                Manage →
              </Button>
            </div>
            <div className="mt-3 flex-1">
              {stats.committee.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title="No committee members yet"
                  hint="Add your office bearers from the Administration module."
                  className="py-8"
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {stats.committee.slice(0, 8).map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                      whileHover={{ y: -4 }}
                      className="group rounded-xl border border-border bg-card/60 p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/60 hover:shadow-[0_10px_24px_-12px_rgba(99, 102, 241,0.45)] dark:hover:shadow-[0_0_20px_-8px_rgba(129, 140, 248,0.45)]"
                    >
                      <div className="mx-auto h-14 w-14 overflow-hidden rounded-full border-2 border-border bg-gradient-to-br from-primary/15 to-amber-500/10 shadow-inner transition-all duration-200 group-hover:border-primary/40">
                        {m.photoPath ? (
                          <img src={mediaUrl(m.photoPath)} alt={m.fullName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-primary/70">
                            {m.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold" title={m.fullName}>{m.fullName}</div>
                      <div className="truncate text-[14.5px] font-medium text-primary/80">{m.role}</div>
                      {m.phone && (
                        <div className="mt-0.5 flex items-center justify-center gap-1 text-[15.5px] text-muted-foreground">
                          <Phone className="h-2.5 w-2.5" /> {m.phone}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </StaggerItem>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* -------- Recent collections -------- */}
        <StaggerItem className="h-full">
          <div onMouseMove={onMouseMove} className="reveal-item hover-lift glass flex h-full flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Recent Fee Collections</h3>
              <Button size="sm" variant="ghost" className="h-7 rounded-lg text-[15.5px] text-muted-foreground hover:bg-muted hover:text-primary" onClick={() => navigate("fees")}>
                View all →
              </Button>
            </div>
            <div className="mt-3 flex-1 space-y-2">
              {stats.recentPayments.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-5 w-5" />}
                  title="No collections this month"
                  hint="Fee receipts will appear here the moment you collect one."
                  className="py-8"
                />
              ) : (
                stats.recentPayments.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.05 }}
                    className="row-hover flex items-center gap-3 rounded-xl border border-border bg-card/50 pl-4 pr-3 py-2"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 shadow-[0_0_12px_-4px_rgba(245, 158, 11,0.5)] dark:bg-amber-400/10 dark:text-amber-300 dark:shadow-[0_0_12px_-4px_rgba(251, 191, 36,0.6)]">
                      <Receipt className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{p.studentName}</div>
                      <div className="tnum text-[14.5px] text-muted-foreground">
                        {p.receiptNo} · {p.paymentMode} · {formatDate(p.paymentDate)}
                      </div>
                    </div>
                    <span className="tnum text-xs font-bold text-amber-600 dark:text-amber-300">{formatINR(p.amount)}</span>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </StaggerItem>

        {/* -------- Birthdays -------- */}
        <StaggerItem className="h-full">
          <div onMouseMove={onMouseMove} className="reveal-item hover-lift glass flex h-full flex-col rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Upcoming Birthdays</h3>
              <Cake className="h-3.5 w-3.5 text-amber-500/80 dark:text-amber-300/70" />
            </div>
            <p className="mt-0.5 text-[15.5px] text-muted-foreground">Next 30 days across the active roster</p>
            <div className="mt-3 flex-1 space-y-2">
              {stats.upcomingBirthdays.length === 0 ? (
                <EmptyState
                  icon={<Cake className="h-5 w-5" />}
                  title="No birthdays in the coming month"
                  hint="Player birthdays will show up here 30 days ahead."
                  className="py-8"
                />
              ) : (
                stats.upcomingBirthdays.map((b, i) => (
                  <motion.button
                    key={b.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.05 }}
                    onClick={() => navigate("student-detail", b.id)}
                    className="row-hover flex w-full items-center gap-3 rounded-xl border border-border bg-card/50 pl-4 pr-3 py-2 text-left"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 shadow-[0_0_12px_-4px_rgba(217,119,6,0.5)] dark:bg-amber-400/10 dark:text-amber-300 dark:shadow-[0_0_12px_-4px_rgba(251,191,36,0.6)]">
                      <Cake className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{b.fullName}</div>
                      <div className="tnum text-[14.5px] text-muted-foreground">{formatDate(b.dateOfBirth)}</div>
                    </div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[14.5px] font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                      {b.daysAway === 0 ? "Today 🎉" : `in ${b.daysAway} day${b.daysAway === 1 ? "" : "s"}`}
                    </span>
                  </motion.button>
                ))
              )}
            </div>
          </div>
        </StaggerItem>
      </div>
    </Stagger>
  )
}

function MetricCard({
  index,
  icon,
  tint,
  label,
  value,
  format,
  footer,
  onClick,
  danger,
}: {
  index: number
  icon: React.ReactNode
  tint: string
  label: string
  value: number
  format: (n: number) => string
  footer: string
  onClick?: () => void
  danger?: boolean
}) {
  const onMouseMove = useRevealMouse()
  return (
    <motion.button
      variants={stagger}
      custom={index}
      initial="hidden"
      animate="show"
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onMouseMove={onMouseMove}
      className="reveal-item hover-lift glass rounded-2xl p-4 text-left"
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>{icon}</span>
        <span className="text-[15.5px] font-semibold leading-snug text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-3 font-display text-[28px] font-extrabold leading-none tracking-tight tnum ${danger ? "text-rose-600 dark:text-rose-300" : ""}`}>
        <CountUp value={value} format={format} />
      </div>
      <div className="mt-2 flex items-center gap-1 text-[15px] text-muted-foreground">
        {danger && <AlertTriangle className="h-3 w-3 text-rose-500 dark:text-rose-400" />}
        {footer}
      </div>
      {danger && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(value * 20, 100)}%` }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-300"
          />
        </div>
      )}
    </motion.button>
  )
}
