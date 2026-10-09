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
  Loader2,
  ClipboardCheck,
} from "lucide-react"
import { fetchDashboard } from "@/lib/psams/api"
import { formatINR, formatDate, CATEGORY_COLORS } from "@/lib/psams/domain"
import type { DashboardStats } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { CountUp } from "@/components/psams/count-up"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { mediaUrl } from "@/lib/psams/api"

const stagger = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.3, ease: "easeOut" as const } }),
}

export function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { navigate, dataVersion } = useAppStore()

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
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Unable to load dashboard statistics. Is the local database running?
      </div>
    )
  }

  const maxCat = Math.max(...stats.categoryBreakdown.map((c) => c.count), 1)

  return (
    <div className="space-y-5 p-5">
      {/* -------- Quick actions bar -------- */}
      <motion.div variants={stagger} custom={0} initial="hidden" animate="show"
        className="flex flex-wrap items-center gap-2 rounded-xl border acrylic p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</span>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => navigate("students")}>
          <UserPlus className="h-3.5 w-3.5" /> Add New Student
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => navigate("fees")}>
          <Receipt className="h-3.5 w-3.5" /> Collect Fee
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => navigate("reports")}>
          <FileSearch className="h-3.5 w-3.5" /> Search & Reports
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => navigate("attendance")}>
          <ClipboardCheck className="h-3.5 w-3.5" /> Mark Attendance
        </Button>
        <div className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          Collection rate this cycle:
          <span className="font-semibold text-emerald-700">{stats.feeCycle.collectionRate}%</span>
        </div>
      </motion.div>

      {/* -------- Metric cards -------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index={0}
          icon={<Users className="h-4 w-4" />}
          tint="bg-sky-100 text-sky-700"
          label="Active Enrolled Students"
          value={stats.totalActive}
          format={(n) => String(Math.round(n))}
          footer={`${stats.attendanceToday.present} present at today's session`}
          onClick={() => navigate("students")}
        />
        <MetricCard
          index={1}
          icon={<BadgeIndianRupee className="h-4 w-4" />}
          tint="bg-emerald-100 text-emerald-700"
          label="Revenue — Current Month"
          value={stats.monthRevenue}
          format={(n) => formatINR(Math.round(n))}
          footer={`Collected today: ${formatINR(stats.todayRevenue)}`}
          onClick={() => navigate("fees")}
        />
        <MetricCard
          index={2}
          icon={<Receipt className="h-4 w-4" />}
          tint="bg-violet-100 text-violet-700"
          label="Fees Settled — Current Cycle"
          value={stats.feeCycle.paidCount}
          format={(n) => String(Math.round(n))}
          footer={`${stats.feeCycle.collectionRate}% of active roster`}
          onClick={() => navigate("fees")}
        />
        <MetricCard
          index={3}
          icon={<AlertTriangle className="h-4 w-4" />}
          tint="bg-rose-100 text-rose-700"
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
        <motion.div variants={stagger} custom={1} initial="hidden" animate="show">
          <Card className="h-full rounded-xl border-border/70 shadow-sm backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category Distribution</CardTitle>
              <p className="text-xs text-muted-foreground">Active roster across five age brackets</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {stats.categoryBreakdown.map((c) => (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[c.category]}`}>
                      {c.category}
                    </span>
                    <span className="font-semibold tabular-nums">{c.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(c.count / maxCat) * 100}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full bg-primary/70"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* -------- Committee showcase -------- */}
        <motion.div variants={stagger} custom={2} initial="hidden" animate="show" className="xl:col-span-2">
          <Card className="h-full rounded-xl border-border/70 shadow-sm backdrop-blur">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-sm font-semibold">Executive Committee</CardTitle>
                <p className="text-xs text-muted-foreground">Academy leadership & administration</p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("settings")}>
                Manage
              </Button>
            </CardHeader>
            <CardContent className="pt-1">
              {stats.committee.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No committee members yet — add them from Administration.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {stats.committee.slice(0, 8).map((m, i) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -3 }}
                      className="rounded-xl border bg-white/70 p-3 text-center shadow-sm"
                    >
                      <div className="mx-auto h-14 w-14 overflow-hidden rounded-full border-2 border-white bg-gradient-to-br from-primary/15 to-primary/5 shadow-inner">
                        {m.photoPath ? (
                           
                          <img src={mediaUrl(m.photoPath)} alt={m.fullName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-primary/70">
                            {m.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold" title={m.fullName}>{m.fullName}</div>
                      <div className="truncate text-[10.5px] font-medium text-primary">{m.role}</div>
                      {m.phone && (
                        <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                          <Phone className="h-2.5 w-2.5" /> {m.phone}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* -------- Recent collections -------- */}
        <motion.div variants={stagger} custom={3} initial="hidden" animate="show">
          <Card className="h-full rounded-xl border-border/70 shadow-sm backdrop-blur">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Recent Fee Collections</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("fees")}>
                View all
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 pt-1">
              {stats.recentPayments.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No collections recorded this month yet.</p>
              ) : (
                stats.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-white/60 px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Receipt className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{p.studentName}</div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {p.receiptNo} · {p.paymentMode} · {formatDate(p.paymentDate)}
                      </div>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-emerald-700">{formatINR(p.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* -------- Birthdays -------- */}
        <motion.div variants={stagger} custom={4} initial="hidden" animate="show">
          <Card className="h-full rounded-xl border-border/70 shadow-sm backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Upcoming Birthdays</CardTitle>
              <p className="text-xs text-muted-foreground">Next 30 days across the active roster</p>
            </CardHeader>
            <CardContent className="space-y-2 pt-1">
              {stats.upcomingBirthdays.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No birthdays in the coming month.</p>
              ) : (
                stats.upcomingBirthdays.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => navigate("student-detail", b.id)}
                    className="flex w-full items-center gap-3 rounded-lg border bg-white/60 px-3 py-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <Cake className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{b.fullName}</div>
                      <div className="text-[10.5px] text-muted-foreground">{formatDate(b.dateOfBirth)}</div>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700">
                      {b.daysAway === 0 ? "Today 🎉" : `in ${b.daysAway} day${b.daysAway === 1 ? "" : "s"}`}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
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
  return (
    <motion.button
      variants={stagger}
      custom={index}
      initial="hidden"
      animate="show"
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      onClick={onClick}
      className="reveal-item rounded-xl border border-border/70 acrylic p-4 text-left shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-3 text-[26px] font-bold leading-none tracking-tight ${danger ? "text-rose-600" : ""}`}>
        <CountUp value={value} format={format} />
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        {danger && <AlertTriangle className="h-3 w-3 text-rose-500" />}
        {footer}
      </div>
      {danger && <Progress value={Math.min(value * 20, 100)} className="mt-2 h-1" />}
    </motion.button>
  )
}
