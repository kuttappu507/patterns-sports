"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, UserPlus, GraduationCap, Eye, Pencil, Trash2, Users, Sparkles } from "lucide-react"
import { fetchStudents, deleteStudent, mediaUrl } from "@/lib/psams/api"
import { CATEGORY_COLORS, computeAge, formatINR } from "@/lib/psams/domain"
import type { Student } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { StudentDrawer } from "@/components/psams/student-drawer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Shimmer, Stagger, StaggerItem, EmptyState } from "@/components/psams/fx"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

const FILTER_TRIGGER =
  "h-8 rounded-lg border-white/10 bg-white/[0.04] text-xs text-slate-200 hover:bg-white/[0.07] hover:border-lime-400/30 transition-all data-[placeholder]:text-slate-400"

export function StudentsView() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("Active")
  const [batch, setBatch] = useState("all")
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const { navigate, refresh, dataVersion } = useAppStore()
  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchStudents({
        q,
        category: category === "all" ? undefined : category,
        status: status === "all" ? undefined : status,
        batch: batch === "all" ? undefined : batch,
      })
      setStudents(rows)
    } finally {
      setLoading(false)
    }
  }, [q, category, status, batch])

  useEffect(() => {
    const t = setTimeout(load, 180) // debounced live search
    return () => clearTimeout(t)
  }, [load, dataVersion])

  async function confirmDelete() {
    if (!deleting) return
    await deleteStudent(deleting.id)
    toast({ title: "Student removed", description: `${deleting.fullName} and all linked records were deleted.` })
    setDeleting(null)
    refresh()
  }

  return (
    <div className="flex h-full flex-col p-5">
      {/* toolbar */}
      <StaggerItem className="mb-4">
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 transition-colors peer-focus:text-lime-300" />
            <Input
              className="h-9 rounded-lg border-white/10 bg-white/[0.04] pl-9 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:border-lime-400/50 focus-visible:ring-lime-400/20"
              placeholder="Search name, admission no. or parent mobile…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[140px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/10 bg-popover">
              <SelectItem value="all" className="text-xs">All categories</SelectItem>
              {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={batch} onValueChange={setBatch}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[130px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/10 bg-popover">
              <SelectItem value="all" className="text-xs">All batches</SelectItem>
              <SelectItem value="Morning" className="text-xs">Morning</SelectItem>
              <SelectItem value="Evening" className="text-xs">Evening</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[120px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-white/10 bg-popover">
              {["Active", "Inactive", "Alumni", "all"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All statuses" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="tnum rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
              {students.length} record{students.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              className="btn-sheen h-8 gap-1.5 rounded-lg bg-lime-400 text-xs font-semibold text-[#0b0e14] shadow-[0_0_16px_-4px_rgba(163,230,53,0.5)] transition-all hover:bg-lime-300 active:scale-[0.97]"
              onClick={() => {
                setEditing(null)
                setDrawerOpen(true)
              }}
            >
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2.6} /> Register Student
            </Button>
          </div>
        </div>
      </StaggerItem>

      {/* table */}
      <StaggerItem className="min-h-0 flex-1">
        <div className="glass h-full overflow-hidden rounded-2xl">
          <div className="h-full overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#0b0f18]/95 text-[10.5px] uppercase tracking-[0.14em] text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Age</th>
                  <th className="px-3 py-3 font-semibold">Sport / Position</th>
                  <th className="hidden px-3 py-3 font-semibold lg:table-cell">Height</th>
                  <th className="hidden px-3 py-3 font-semibold xl:table-cell">School</th>
                  <th className="hidden px-3 py-3 font-semibold xl:table-cell">Monthly fee</th>
                  <th className="px-3 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`} className="border-b border-white/[0.04]">
                      <td colSpan={8} className="px-4 py-2.5">
                        <Shimmer className="h-9 rounded-lg" />
                      </td>
                    </tr>
                  ))
                )}
                {!loading && students.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={<Users className="h-6 w-6" />}
                        title="No students match the current filters"
                        hint="Try clearing the search or switching the category / batch filters."
                      />
                    </td>
                  </tr>
                )}
                <AnimatePresence initial={false}>
                  {!loading && students.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.03, 0.4) } }}
                      exit={{ opacity: 0 }}
                      className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.035]"
                    >
                      <td className="row-hover px-4 py-2.5">
                        <button className="flex items-center gap-2.5 text-left" onClick={() => navigate("student-detail", s.id)}>
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br from-lime-400/15 to-cyan-400/10 transition-all duration-200 group-hover:border-lime-400/40 group-hover:shadow-[0_0_12px_-2px_rgba(163,230,53,0.5)]">
                            {s.photoPath ? (
                              <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-lime-300/70">
                                {s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground transition-colors group-hover:text-lime-200">{s.fullName}</div>
                            <div className="tnum text-[10.5px] text-muted-foreground">{s.admissionNo} · {s.mobile}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${CATEGORY_COLORS[s.ageCategory] || ""}`}>{s.ageCategory}</span>
                      </td>
                      <td className="tnum px-3 py-2.5">{computeAge(s.dateOfBirth)} yrs</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{s.primarySport}</div>
                        <div className="text-[10.5px] text-muted-foreground">{s.playingPosition || "—"}</div>
                      </td>
                      <td className="tnum hidden px-3 py-2.5 lg:table-cell">{s.heightCm ? `${s.heightCm} cm` : "—"}</td>
                      <td className="hidden max-w-[160px] truncate px-3 py-2.5 xl:table-cell">
                        {s.schoolName ? (
                          <span className="inline-flex items-center gap-1 text-slate-300"><GraduationCap className="h-3 w-3 text-slate-500" />{s.schoolName}</span>
                        ) : "—"}
                      </td>
                      <td className="tnum hidden px-3 py-2.5 xl:table-cell">{formatINR(s.monthlyFee)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-300" title="Open profile" onClick={() => navigate("student-detail", s.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-lime-400/10 hover:text-lime-300" title="Edit" onClick={() => { setEditing(s); setDrawerOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-rose-400/10 hover:text-rose-300" title="Delete" onClick={() => setDeleting(s)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </StaggerItem>

      <StudentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        editing={editing}
        onSaved={() => refresh()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="border-white/10 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-rose-300" /> Remove {deleting?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the student along with achievements, payment history and attendance records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-white/10 bg-transparent text-xs hover:bg-white/[0.06]">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg bg-rose-500/90 text-xs text-white hover:bg-rose-500" onClick={confirmDelete}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
