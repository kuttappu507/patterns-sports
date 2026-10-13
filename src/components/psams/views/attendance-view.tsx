"use client"
import { SafeImg } from "@/components/psams/safe-img"

// ============================================================
// PS-AMS :: Court-Side Attendance Tracker — daily checklist by
// batch / age category with rapid toggle controls.
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Check, X, CheckCheck, Printer, CalendarDays, Users, FileDown, Search } from "lucide-react"
import { fetchStudents, fetchAttendance, markAttendance, fetchSettings, mediaUrl } from "@/lib/psams/api"
import { computeAge, todayKey, CATEGORY_COLORS, formatDate } from "@/lib/psams/domain"
import type { Student, AttendanceRecord, AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { useToast } from "@/hooks/use-toast"
import { exportPDF } from "@/lib/psams/export"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Shimmer, StaggerItem, EmptyState } from "@/components/psams/fx"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

export function AttendanceView() {
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate] = useState(todayKey())
  const [segment, setSegment] = useState<string>("all")
  const [records, setRecords] = useState<Record<string, string>>({}) // studentId -> status
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const [loadError, setLoadError] = useState(false)
  // PS-061 — find one player instantly in a long session roster
  const [q, setQ] = useState("")
  const [pdfBusy, setPdfBusy] = useState(false)
  const { setPrint } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    // Async data fetch: setState only after the await (no cascading renders).
    void (async () => {
      try {
        const [s, st] = await Promise.all([fetchStudents({ status: "Active" }), fetchSettings()])
        setStudents(s)
        setSettings(st)
        setLoadError(false)
      } catch (e) {
        console.error(e)
        setLoadError(true)
        toast({ title: "Could not load attendance", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // load existing attendance when the session date changes
  // (sequence token guards against out-of-order responses on rapid date changes)
  useEffect(() => {
    let alive = true
    fetchAttendance(date)
      .then((rows: AttendanceRecord[]) => {
        if (!alive) return
        const map: Record<string, string> = {}
        rows.forEach((r) => (map[r.studentId] = r.status))
        setRecords(map)
      })
      .catch((e) => {
        if (alive) toast({ title: "Could not load register", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      })
    return () => {
      alive = false
    }
  }, [date, toast])

  const roster = useMemo(() => {
    if (segment === "all") return students
    if (segment === "Morning" || segment === "Evening") return students.filter((s) => s.trainingBatch === segment)
    return students.filter((s) => s.ageCategory === segment)
  }, [students, segment])

  // search view — narrows the visible rows only; counters and bulk actions
  // keep operating on the FULL session roster so a filter can never cause a
  // partial "all present" or lie about the marked totals.
  const visibleRoster = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return roster
    return roster.filter(
      (s) =>
        s.fullName.toLowerCase().includes(needle) ||
        s.admissionNo.toLowerCase().includes(needle) ||
        s.mobile.includes(needle)
    )
  }, [roster, q])

  const present = roster.filter((s) => records[s.id] === "Present").length
  const absent = roster.filter((s) => records[s.id] === "Absent").length
  const marked = present + absent

  async function toggle(s: Student, status: "Present" | "Absent") {
    setSavingIds((prev) => new Set(prev).add(s.id))
    const previous = records[s.id]
    setRecords((prev) => ({ ...prev, [s.id]: status }))
    try {
      await markAttendance([{ studentId: s.id, date, batch: s.trainingBatch || s.ageCategory, status }])
    } catch (e) {
      // roll the optimistic toggle back so the UI never lies about saved state
      setRecords((prev) => {
        const n = { ...prev }
        if (previous === undefined) delete n[s.id]
        else n[s.id] = previous
        return n
      })
      toast({ title: "Attendance not saved", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setSavingIds((prev) => {
        const n = new Set(prev)
        n.delete(s.id)
        return n
      })
    }
  }

  const [markAllBusy, setMarkAllBusy] = useState(false)

  async function markAll(status: "Present" | "Absent") {
    if (markAllBusy) return
    // PS-042 — the bulk buttons silently OVERWROTE an already-marked day
    // (a history rewrite with one tap). Confirm when anything is already
    // recorded for this date.
    const alreadyMarked = roster.filter((s) => records[s.id] && records[s.id] !== status).length
    if (alreadyMarked > 0 && !window.confirm(`This will overwrite ${alreadyMarked} already-marked record(s) for ${date} with "${status}". Continue?`)) {
      return
    }
    const snapshot = { ...records }
    const batch = roster.map((s) => ({ studentId: s.id, date, batch: s.trainingBatch || s.ageCategory, status }))
    setRecords((prev) => {
      const n = { ...prev }
      roster.forEach((s) => (n[s.id] = status))
      return n
    })
    if (!batch.length) return
    setMarkAllBusy(true)
    try {
      await markAttendance(batch)
    } catch (e) {
      setRecords(snapshot) // restore pre-bulk state
      toast({ title: "Bulk mark failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setMarkAllBusy(false)
    }
  }

  function printSheet() {
    setPrint({
      kind: "attendance-sheet",
      title: "Attendance Sheet",
      data: { date, roster, records, present, absent, total: roster.length, settings },
    })
  }

  /** PS-061 — blank per-day marking sheet as a PDF file: hand it to the
   *  field coach, collect it back, then mark the register in the app. */
  async function downloadMarkingSheet() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const segmentLabel =
        segment === "all" ? "Whole academy" : segment === "Morning" || segment === "Evening" ? `${segment} batch` : `${segment} category`
      const out = await exportPDF({
        fileName: "PS-AMS-attendance-sheet",
        title: "Daily Attendance Sheet",
        subtitle: `${formatDate(date)} · ${segmentLabel} · roster of ${roster.length} — tick Present / Absent in the blank column`,
        academy: settings ?? undefined,
        columns: [
          { header: "Sl", key: "sl", width: 8 },
          { header: "Admission No", key: "admission", width: 22 },
          { header: "Student Name", key: "name", width: 52 },
          { header: "Category", key: "category", width: 24 },
          { header: "Batch", key: "batch", width: 20 },
          { header: "P / A", key: "pa", width: 16 },
          { header: "Signature", key: "sig", width: 30 },
        ],
        rows: roster.map((s, i) => ({
          sl: i + 1,
          admission: s.admissionNo,
          name: s.fullName,
          category: s.ageCategory,
          batch: s.trainingBatch || "—",
          pa: "",
          sig: "",
        })),
        rowMinHeight: 10, // tall rows — room to hand-write a tick and sign
        footnote: "Field attendance sheet — mark, sign and hand back to the academy office",
      })
      if (!out.saved) {
        toast({ title: "Sheet not saved", description: "The save was cancelled — no file was written." })
      } else {
        toast({ title: "Attendance sheet downloaded", description: "Blank P/A columns and a signature line — ready for the field." })
      }
    } catch (e) {
      toast({ title: "PDF export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setPdfBusy(false)
    }
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
            <SelectTrigger className="h-8 min-w-[176px] rounded-lg border-border bg-card text-xs hover:border-primary/30"><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all" className="text-xs">Whole academy ({students.length})</SelectItem>
              <SelectItem value="Morning" className="text-xs">Morning batch</SelectItem>
              <SelectItem value="Evening" className="text-xs">Evening batch</SelectItem>
              {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c} category</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="tnum flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {roster.length} in session
            <Badge className="rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[14.5px] font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">{present} P</Badge>
            <Badge className="rounded-full border border-rose-500/30 bg-rose-500/10 text-[14.5px] font-semibold text-rose-700 hover:bg-rose-500/15 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300">{absent} A</Badge>
            {marked < roster.length && <Badge variant="secondary" className="rounded-full text-[14.5px]">{roster.length - marked} unmarked</Badge>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* PS-061 — quick find inside a long roster */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-[190px] rounded-lg border-border bg-card pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary/50"
                placeholder="Find player in roster…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" disabled={markAllBusy} className="h-8 gap-1.5 rounded-lg border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-700 transition-all hover:bg-emerald-500/20 active:scale-[0.97] disabled:opacity-50 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300" onClick={() => markAll("Present")}>
              <CheckCheck className="h-3.5 w-3.5" /> All present
            </Button>
            <Button size="sm" variant="outline" disabled={pdfBusy} className="h-8 gap-1.5 rounded-lg border-border bg-card text-xs hover:bg-muted active:scale-[0.97] disabled:opacity-50" onClick={downloadMarkingSheet} title="Save a blank per-day marking sheet as a PDF — hand it to the field coach, then transfer the ticks into the register">
              <FileDown className="h-3.5 w-3.5" /> {pdfBusy ? "Preparing…" : "Marking sheet PDF"}
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
        {!loading && loadError && (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Attendance data unavailable"
            hint="The backend could not be reached. Check the connection and reopen this module."
          />
        )}
        {!loading && !loadError && roster.length === 0 && (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No active students in this segment"
            hint="Switch the segment filter or register new players to start marking attendance."
          />
        )}
        {!loading && !loadError && roster.length > 0 && visibleRoster.length === 0 && (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={`No roster player matches “${q.trim()}”`}
            hint="Search matches name, admission number or parent mobile."
          />
        )}
        {!loading && visibleRoster.length > 0 && (
          /* PS-061 — dense session LIST: one player per line scans straight
             down the register, sized for 100+ rosters (the old 3-column card
             grid made long sessions hard to walk). No per-row entrance
             animation — a 200-row stagger delays the register needlessly. */
          <div className="divide-y divide-border/60">
            {visibleRoster.map((s, i) => {
              const status = records[s.id]
              const busy = savingIds.has(s.id)
              return (
                <div
                  key={s.id}
                  className={cn(
                    "row-hover flex items-center gap-3 px-4 py-1.5",
                    status === "Present" && "bg-emerald-400/[0.06]",
                    status === "Absent" && "bg-rose-400/[0.05]"
                  )}
                >
                  <span className="tnum w-6 shrink-0 text-right text-[14.5px] text-muted-foreground">{i + 1}</span>
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-gradient-to-br from-primary/15 to-cyan-500/10">
                    <SafeImg
                      src={mediaUrl(s.photoPath)}
                      alt={s.fullName}
                      className="h-full w-full object-cover"
                      fallback={
                        <div className="flex h-full w-full items-center justify-center text-[14px] font-bold text-primary/70">
                          {s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold" title={s.fullName}>{s.fullName}</div>
                    <div className="tnum flex items-center gap-1.5 truncate text-[14.5px] text-muted-foreground">
                      {s.admissionNo} · {computeAge(s.dateOfBirth)} yrs
                      <span className={cn("rounded-full border px-1.5 text-[14.5px] font-semibold", CATEGORY_COLORS[s.ageCategory] || "")}>{s.ageCategory}</span>
                      {s.trainingBatch && <span className="text-[14.5px]">{s.trainingBatch}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <motion.button
                      whileTap={{ scale: 0.86 }}
                      onClick={() => toggle(s, "Present")}
                      disabled={busy}
                      className={cn(
                        "flex h-9 w-12 items-center justify-center gap-1 rounded-lg border transition-colors",
                        status === "Present"
                          ? "border-emerald-400 bg-emerald-500 text-white shadow-[0_0_12px_-2px_rgba(52,211,153,0.7)]"
                          : "bg-muted text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-300"
                      )}
                      title="Mark present"
                    >
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                      <span className="text-[13px] font-semibold">P</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.86 }}
                      onClick={() => toggle(s, "Absent")}
                      disabled={busy}
                      className={cn(
                        "flex h-9 w-12 items-center justify-center gap-1 rounded-lg border transition-colors",
                        status === "Absent"
                          ? "border-rose-400 bg-rose-500 text-white shadow-[0_0_12px_-2px_rgba(251,113,133,0.7)]"
                          : "bg-muted text-muted-foreground hover:border-rose-500 hover:text-rose-600 dark:hover:text-rose-300"
                      )}
                      title="Mark absent"
                    >
                      <X className="h-4 w-4" strokeWidth={2.6} />
                      <span className="text-[13px] font-semibold">A</span>
                    </motion.button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
