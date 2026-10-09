"use client"

// ============================================================
// PS-AMS :: Court-Side Attendance Tracker — daily checklist by
// batch / age category with rapid toggle controls.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, CheckCheck, Loader2, Printer, CalendarDays, Users } from "lucide-react"
import { fetchStudents, fetchAttendance, markAttendance, fetchSettings, mediaUrl } from "@/lib/psams/api"
import { computeAge, todayKey, CATEGORY_COLORS } from "@/lib/psams/domain"
import type { Student, AttendanceRecord, AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

type Mode = { kind: "batch"; value: string } | { kind: "category"; value: string }

export function AttendanceView() {
  const [students, setStudents] = useState<Student[]>([])
  const [date, setDate] = useState(todayKey())
  const [segment, setSegment] = useState<string>("all")
  const [records, setRecords] = useState<Record<string, string>>({}) // studentId -> status
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const { setPrint, refresh } = useAppStore()

  const loadStudents = useCallback(async () => {
    setLoading(true)
    const [s, st] = await Promise.all([fetchStudents({ status: "Active" }), fetchSettings()])
    setStudents(s)
    setSettings(st)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border acrylic p-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <Input type="date" className="h-8 w-[150px] bg-white/70 text-xs" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="h-8 w-[190px] bg-white/70 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Whole academy ({students.length})</SelectItem>
            <SelectItem value="Morning" className="text-xs">Morning batch</SelectItem>
            <SelectItem value="Evening" className="text-xs">Evening batch</SelectItem>
            {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c} category</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {roster.length} in session
          <Badge className="rounded-full bg-emerald-100 text-[10.5px] text-emerald-700 hover:bg-emerald-100">{present} P</Badge>
          <Badge className="rounded-full bg-rose-100 text-[10.5px] text-rose-700 hover:bg-rose-100">{absent} A</Badge>
          {marked < roster.length && <Badge variant="secondary" className="rounded-full text-[10.5px]">{roster.length - marked} unmarked</Badge>}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={() => markAll("Present")}>
            <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> All present
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-white/70 text-xs" onClick={printSheet}>
            <Printer className="h-3.5 w-3.5" /> Print sheet
          </Button>
        </div>
      </div>

      {/* checklist */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-white/70 backdrop-blur">
        {loading && <div className="py-12 text-center text-xs text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading roster…</div>}
        {!loading && roster.length === 0 && <div className="py-12 text-center text-xs text-muted-foreground">No active students in this segment.</div>}
        <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-y-0 md:gap-px md:bg-border/40 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {roster.map((s) => {
              const status = records[s.id]
              const busy = savingIds.has(s.id)
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 bg-white/85 px-4 py-2.5">
                  <div className="h-9 w-9 overflow-hidden rounded-full border bg-secondary">
                    {s.photoPath ? (
                       
                      <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-muted-foreground">{s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{s.fullName}</div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      {s.admissionNo} · {computeAge(s.dateOfBirth)} yrs
                      <span className={cn("rounded-full border px-1.5 text-[9px] font-medium", CATEGORY_COLORS[s.ageCategory] || "")}>{s.ageCategory}</span>
                      {s.trainingBatch && <span className="text-[9px]">{s.trainingBatch}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggle(s, "Present")}
                      disabled={busy}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all active:scale-90",
                        status === "Present" ? "border-emerald-500 bg-emerald-500 text-white shadow-sm" : "bg-white text-muted-foreground hover:border-emerald-400 hover:text-emerald-600"
                      )}
                      title="Mark present"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggle(s, "Absent")}
                      disabled={busy}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg border transition-all active:scale-90",
                        status === "Absent" ? "border-rose-500 bg-rose-500 text-white shadow-sm" : "bg-white text-muted-foreground hover:border-rose-400 hover:text-rose-600"
                      )}
                      title="Mark absent"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
