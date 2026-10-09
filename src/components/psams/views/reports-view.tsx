"use client"

// ============================================================
// PS-AMS :: Smart Search, Multi-Parameter Filters & Reports
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { Search, Filter, Printer, FileSpreadsheet, FileText, Loader2, RotateCcw } from "lucide-react"
import { fetchStudents, fetchSettings, mediaUrl } from "@/lib/psams/api"
import { computeAge, computeBMI, CATEGORY_COLORS, formatINR } from "@/lib/psams/domain"
import { SPORTS, SPORT_POSITIONS, type Student, type AcademySettings } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { useToast } from "@/hooks/use-toast"
import { exportExcel, exportPDF } from "@/lib/psams/export"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

interface FilterState {
  q: string
  category: string
  minAge: string
  maxAge: string
  minHeight: string
  school: string
  position: string
  sport: string
  batch: string
}

const EMPTY: FilterState = { q: "", category: "all", minAge: "", maxAge: "", minHeight: "", school: "all", position: "all", sport: "all", batch: "all" }

export function ReportsView() {
  const [all, setAll] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(EMPTY)
  const [settings, setSettings] = useState<AcademySettings | null>(null)
  const { setPrint, navigate } = useAppStore()
  const { toast } = useToast()

  useEffect(() => {
    let alive = true
    Promise.all([fetchStudents({ status: "Active" }), fetchSettings()])
      .then(([s, st]) => {
        if (!alive) return
        setAll(s)
        setSettings(st)
        setLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        setLoading(false)
        toast({ title: "Could not load students", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
      })
    return () => {
      alive = false
    }
  }, [toast])

  // Excel/PDF generation can throw — surface it instead of failing silently
  async function runExport(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    }
  }

  // client-side multi-parameter engine (instant, offline)
  const rows = useMemo(() => {
    let out = all
    const f = filters
    const q = f.q.trim().toLowerCase()
    if (q) {
      out = out.filter((s) => s.fullName.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q) || s.mobile.includes(q) || (s.parentName || "").toLowerCase().includes(q))
    }
    if (f.category !== "all") out = out.filter((s) => s.ageCategory === f.category)
    if (f.minAge) out = out.filter((s) => computeAge(s.dateOfBirth) >= Number(f.minAge))
    if (f.maxAge) out = out.filter((s) => computeAge(s.dateOfBirth) <= Number(f.maxAge))
    if (f.minHeight) out = out.filter((s) => (s.heightCm ?? 0) >= Number(f.minHeight))
    if (f.school !== "all") out = out.filter((s) => s.schoolName === f.school)
    if (f.sport !== "all") out = out.filter((s) => s.primarySport === f.sport)
    if (f.position !== "all") out = out.filter((s) => s.playingPosition === f.position)
    if (f.batch !== "all") out = out.filter((s) => s.trainingBatch === f.batch)
    return out
  }, [all, filters])

  const schools = Array.from(new Set(all.map((s) => s.schoolName).filter(Boolean))) as string[]
  const positions = filters.sport !== "all" ? SPORT_POSITIONS[filters.sport] ?? [] : Array.from(new Set(all.map((s) => s.playingPosition).filter(Boolean))) as string[]

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== "q" && v !== "all" && v !== "").length

  const cols = [
    { header: "Sl", key: "sl", width: 6 },
    { header: "Admission No", key: "admission", width: 15 },
    { header: "Student Name", key: "name", width: 22 },
    { header: "Age", key: "age", width: 7 },
    { header: "Category", key: "category", width: 12 },
    { header: "Height (cm)", key: "height", width: 11 },
    { header: "Weight (kg)", key: "weight", width: 11 },
    { header: "BMI", key: "bmi", width: 7 },
    { header: "Sport / Position", key: "sport", width: 20 },
    { header: "School", key: "school", width: 22 },
    { header: "Parent Mobile", key: "mobile", width: 14 },
    { header: "Monthly Fee (₹)", key: "fee", width: 14 },
  ]

  const exportRows = rows.map((s, i) => ({
    sl: i + 1,
    admission: s.admissionNo,
    name: s.fullName,
    age: computeAge(s.dateOfBirth),
    category: s.ageCategory,
    height: s.heightCm ?? "",
    weight: s.weightKg ?? "",
    bmi: computeBMI(s.weightKg, s.heightCm)?.toFixed(1) ?? "",
    sport: `${s.primarySport}${s.playingPosition ? " - " + s.playingPosition : ""}`,
    school: s.schoolName || "—",
    mobile: s.mobile,
    fee: s.monthlyFee,
  }))

  function printReport() {
    setPrint({ kind: "report", title: "Student Registry Report", data: { rows, settings, filters: { ...filters, category: filters.category === "all" ? "" : filters.category } } })
  }

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      {/* filter deck */}
      <div className="rounded-xl border acrylic p-3">
        <div className="mb-2 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">Multi-Parameter Filtering Engine</span>
          {activeFilterCount > 0 && (
            <Badge className="rounded-full text-[15.5px]">{activeFilterCount} active</Badge>
          )}
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto h-6 gap-1 text-[15px]" onClick={() => setFilters(EMPTY)}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 rounded-lg border-border bg-card pl-8 text-xs placeholder:text-muted-foreground focus-visible:border-primary/50" placeholder="Real-time search — name, admission number, parent mobile…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
            <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All categories</SelectItem>
              {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Input type="number" placeholder="Min age" className="h-8 border-border bg-card text-xs" value={filters.minAge} onChange={(e) => setFilters({ ...filters, minAge: e.target.value })} />
            <Input type="number" placeholder="Max age" className="h-8 border-border bg-card text-xs" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} />
          </div>
          <Input type="number" placeholder="Height > (cm)" className="h-8 border-border bg-card text-xs" value={filters.minHeight} onChange={(e) => setFilters({ ...filters, minHeight: e.target.value })} />
          <Select value={filters.school} onValueChange={(v) => setFilters({ ...filters, school: v })}>
            <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue placeholder="School" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All schools</SelectItem>
              {schools.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.sport} onValueChange={(v) => setFilters({ ...filters, sport: v, position: "all" })}>
            <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue placeholder="Sport" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All sports</SelectItem>
              {SPORTS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.position} onValueChange={(v) => setFilters({ ...filters, position: v })}>
            <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue placeholder="Position" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All positions</SelectItem>
              {positions.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.batch} onValueChange={(v) => setFilters({ ...filters, batch: v })}>
            <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue placeholder="Batch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All batches</SelectItem>
              <SelectItem value="Morning" className="text-xs">Morning</SelectItem>
              <SelectItem value="Evening" className="text-xs">Evening</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* result toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          <b className="text-foreground">{rows.length}</b> student{rows.length === 1 ? "" : "s"} matched
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={printReport}><Printer className="h-3.5 w-3.5" /> A4 Print</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportPDF({ fileName: "PS-AMS-report", title: "Student Registry Report", subtitle: `${rows.length} records · generated ${new Date().toLocaleDateString("en-IN")}`, academy: settings ?? undefined, columns: cols.slice(1), rows: exportRows, orientation: "l" }))}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border bg-card text-xs hover:bg-muted" onClick={() => runExport(() => exportExcel({ sheetName: "Student Report", fileName: "PS-AMS-report", title: "Student Registry Report", subtitle: `${rows.length} records`, academy: settings ?? undefined, columns: cols, rows: exportRows }))}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {/* results table */}
      <div className="glass min-h-0 flex-1 overflow-y-auto rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b bg-[#0b0f18]/95 text-[15px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-3 py-2.5 font-medium">Age / Category</th>
              <th className="px-3 py-2.5 font-medium">Height / Weight / BMI</th>
              <th className="px-3 py-2.5 font-medium">Sport</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">School</th>
              <th className="px-3 py-2.5 text-right font-medium">Fee</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-10 text-center"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No students match these criteria.</td></tr>}
            {rows.map((s) => {
              const bmi = computeBMI(s.weightKg, s.heightCm)
              return (
                <tr key={s.id} className="cursor-pointer border-b border-border/40 hover:bg-accent/40" onClick={() => navigate("student-detail", s.id)}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 overflow-hidden rounded-full border bg-muted">
                        {s.photoPath ? (
                           
                          <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[15.5px] font-semibold text-muted-foreground">{s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{s.fullName}</div>
                        <div className="text-[14.5px] text-muted-foreground">{s.admissionNo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="tabular-nums">{computeAge(s.dateOfBirth)} yrs</div>
                    <span className={cn("mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[15.5px] font-medium", CATEGORY_COLORS[s.ageCategory] || "")}>{s.ageCategory}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {s.heightCm ?? "—"} cm · {s.weightKg ?? "—"} kg · <span className="font-medium">{bmi !== null ? bmi.toFixed(1) : "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{s.primarySport}</div>
                    <div className="text-[14.5px] text-muted-foreground">{s.playingPosition || "—"}</div>
                  </td>
                  <td className="hidden max-w-[180px] truncate px-3 py-2.5 lg:table-cell">{s.schoolName || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatINR(s.monthlyFee)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
