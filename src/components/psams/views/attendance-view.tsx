"use client"

// ============================================================
// PS-AMS :: Court-Side Attendance Tracker — daily checklist by
// batch / age category with rapid toggle controls.
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Check, X, CheckCheck, Printer, CalendarDays, Users } from "lucide-react"
import { fetchStudents, fetchAttendance, markAttendance, fetchSettings, mediaUrl } from "@/lib/psams/api"
import { computeAge, todayKey, CATEGORY_COLORS } from "@/lib/psams/domain"
import type { Student, AttendanceRecord, AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Shimmer, Stagger, StaggerItem, EmptyState } from "@/components/psams/fx"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

export function AttendanceView() {
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate] = useState(todayKey())
  const [segment, setSegment] = useState<string>("all")
  const [records, setRecords] = useState<Record<string, string>>({}) // studentId -> status
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const { setPrint } = useAppStore()

  useEffect(() => {
    // Async data fetch: setState only after the await (no cascading renders).
    void (async () => {
      const [s, st] = await Promise.all([fetchStudents({ status: "Active" }), fetchSettings()])
      setStudents(s)
      setSettings(st)
      setLoading(false)
    })()
  }, [])

  // load existing attendance when the session date changes
  useEffect(() => {
    fetchAttendance(date).then((rows: AttendanceRecord[]) => {
      const map: Record<string, string> = {}
      rows.forEach((r) => (map[r.studentId] = r.status))
      setRecords(map)
    })
  }, [date])

  const roster = useMemo(() => {
    if (segment === "all") return students
    if (segment === "Morning" || segment === "Evening") return students.filter((s) => s.trainingBatch === segment)
    return students.filter((s) => s.ageCategory === segment)
  }, [students, segment])

  const present = roster.filter((s) => records[s.id] === "Present").length
  const absent = roster.filter((s) => records[s.id] === "Absent").length
  const marked = present + absent

  async function toggle(s: Student, status: "Present" | "Absent") {
    setSavingIds((prev) => new Set(prev).add(s.id))
    setRecords((prev) => ({ ...prev, [s.id]: status }))
    try {
      await markAttendance([{ studentId: s.id, date, batch: s.trainingBatch || s.ageCategory, status }])
    } finally {
      setSavingIds((prev) => {
        const n = new Set(prev)
        n.delete(s.id)
        return n
      })
    }
  }

  async function markAll(status: "Present" | "Absent") {
    const batch = roster.map((s) => ({ studentId: s.id, date, batch: s.trainingBatch || s.ageCategory, status }))
    setRecords((prev) => {
      const n = { ...prev }
      roster.forEach((s) => (n[s.id] = status))
      return n
    })
    if (batch.length) await markAttendance(batch)
  }

  function printSheet() {
    setPrint({
      kind: "attendance-sheet",
      title: "Attendance Sheet",
      data: { date, roster, records, present, absent, total: roster.length, settings },
    })
  }

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      {/* session toolbar */}
      <StaggerItem className="shrink-0">
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <Input
              type="date"
              className="h-8 w-[150px] rounded-lg border-border bg-card text-xs text-foreground focus-visible:border-primary/50"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="h-8 w-[190px] rounded-lg border-border bg-card text-xs hover:border-primary/30"><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all" className="text-xs">Whole academy ({students.length})</SelectItem>
              <SelectItem value="Morning" className="text-xs">Morning batch</SelectItem>
              <SelectItem value="Evening" className="text-xs">Evening batch</SelectItem>
              {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c} category</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="tnum flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {roster.length} in session
            <Badge className="rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10.5px] font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">{present} P</Badge>
            <Badge className="rounded-full border border-rose-500/30 bg-rose-500/10 text-[10.5px] font-semibold text-rose-700 hover:bg-rose-500/15 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300">{absent} A</Badge>
            {marked < roster.length && <Badge variant="secondary" className="rounded-full text-[10.5px]">{roster.length - marked} unmarked</Badge>}
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-700 transition-all hover:bg-emerald-500/20 active:scale-[0.97] dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" onClick={() => markAll("Present")}>
              <CheckCheck className="h-3.5 w-3.5" /> All present
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-border bg-card text-xs hover:bg-muted active:scale-[0.97]" onClick={printSheet}>
              <Printer className="h-3.5 w-3.5" /> Print sheet
            </Button>
          </div>
        </div>
      </StaggerItem>

      {/* checklist */}
      <div className="glass min-h-0 flex-1 overflow-y-auto rounded-2xl">
        {loading && (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => <Shimmer key={i} className="h-14 rounded-xl" />)}
          </div>
        )}
        {!loading && roster.length === 0 && (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No active students in this segment"
            hint="Switch the segment filter or register new players to start marking attendance."
          />
        )}
        {!loading && roster.length > 0 && (
          <Stagger className="grid grid-cols-1 gap-2.5 p-3 md:grid-cols-2 lg:grid-cols-3">
            {roster.map((s) => {
              const status = records[s.id]
              const busy = savingIds.has(s.id)
              return (
                <StaggerItem key={s.id}>
                  <motion.div
                    layout
                    className={cn(
                      "row-hover flex items-center gap-3 rounded-xl border border-border bg-card/50 px-3.5 py-2.5",
                      status === "Present" && "border-emerald-400/25 bg-emerald-400/[0.05]",
                      status === "Absent" && "border-rose-400/25 bg-rose-400/[0.04]"
                    )}
                  >
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-gradient-to-br from-primary/15 to-cyan-500/10">
                      {s.photoPath ? (
                        <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-primary/70">
                          {s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{s.fullName}</div>
                      <div className="tnum flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {s.admissionNo} · {computeAge(s.dateOfBirth)} yrs
                        <span className={cn("rounded-full border px-1.5 text-[9px] font-semibold", CATEGORY_COLORS[s.ageCategory] || "")}>{s.ageCategory}</span>
                        {s.trainingBatch && <span className="text-[9px]">{s.trainingBatch}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <motion.button
                        whileTap={{ scale: 0.82 }}
                        whileHover={{ scale: 1.08 }}
                        onClick={() => toggle(s, "Present")}
                        disabled={busy}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                          status === "Present"
                            ? "border-emerald-400 bg-emerald-500 text-white shadow-[0_0_12px_-2px_rgba(52,211,153,0.7)]"
                            : "bg-muted text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-300"
                        )}
                        title="Mark present"
                      >
                        <Check className="h-4 w-4" strokeWidth={2.6} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.82 }}
                        whileHover={{ scale: 1.08 }}
                        onClick={() => toggle(s, "Absent")}
                        disabled={busy}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                          status === "Absent"
                            ? "border-rose-400 bg-rose-500 text-white shadow-[0_0_12px_-2px_rgba(251,113,133,0.7)]"
                            : "bg-muted text-muted-foreground hover:border-rose-500 hover:text-rose-600 dark:hover:text-rose-300"
                        )}
                        title="Mark absent"
                      >
                        <X className="h-4 w-4" strokeWidth={2.6} />
                      </motion.button>
                    </div>
                  </motion.div>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
      </div>
    </div>
  )
}
