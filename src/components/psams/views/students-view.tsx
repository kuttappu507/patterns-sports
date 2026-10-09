"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, UserPlus, GraduationCap, Eye, Pencil, Trash2, Users, Sparkles } from "lucide-react"
import { fetchStudents, deleteStudent, mediaUrl } from "@/lib/psams/api"
import { CATEGORY_COLORS, computeAge, formatINR } from "@/lib/psams/domain"
import type { Student } from "@/lib/psams/types"
import { useAppStore } from "@/lib/psams/store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Shimmer, StaggerItem, EmptyState } from "@/components/psams/fx"

const AGE_CATEGORIES = ["Mini", "Sub-Junior", "Junior", "Youth", "Senior"]

const FILTER_TRIGGER =
  "h-8 rounded-lg border-border bg-card text-xs text-foreground hover:bg-muted hover:border-primary/30 transition-all data-[placeholder]:text-muted-foreground"

export function StudentsView() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("all")
  const [status, setStatus] = useState("Active")
  const [batch, setBatch] = useState("all")
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const { navigate, refresh, dataVersion, openStudentForm } = useAppStore()
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
    } catch (e) {
      toast({ title: "Could not load students", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [q, category, status, batch, toast])

  useEffect(() => {
    const t = setTimeout(load, 180) // debounced live search
    return () => clearTimeout(t)
  }, [load, dataVersion])

  async function confirmDelete() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deleteStudent(deleting.id)
      toast({ title: "Student removed", description: `${deleting.fullName} and all linked records were deleted.` })
      setDeleting(null)
      refresh()
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" })
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      {/* toolbar */}
      <StaggerItem className="mb-4">
        <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors peer-focus:text-primary" />
            <Input
              className="h-9 rounded-lg border-border bg-card pl-9 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-primary/20"
              placeholder="Search name, admission no. or parent mobile…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[140px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all" className="text-xs">All categories</SelectItem>
              {AGE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={batch} onValueChange={setBatch}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[130px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value="all" className="text-xs">All batches</SelectItem>
              <SelectItem value="Morning" className="text-xs">Morning</SelectItem>
              <SelectItem value="Evening" className="text-xs">Evening</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={`${FILTER_TRIGGER} w-[120px]`}><SelectValue /></SelectTrigger>
            <SelectContent className="border-border bg-popover">
              {["Active", "Inactive", "Alumni", "all"].map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All statuses" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="tnum rounded-full border border-border bg-card/60 px-2.5 py-1 text-[15px] font-semibold text-muted-foreground">
              {students.length} record{students.length === 1 ? "" : "s"}
            </span>
            <Button
              size="sm"
              className="btn-sheen h-8 gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-[0_8px_18px_-8px_rgba(99, 102, 241,0.6)] transition-all hover:brightness-110 active:scale-[0.97] dark:shadow-[0_0_16px_-4px_rgba(129, 140, 248,0.55)]"
              onClick={() => openStudentForm(null)}
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
              <thead className="sticky top-0 z-10 border-b border-border bg-background/95 text-[14.5px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
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
                    <tr key={`sk-${i}`} className="border-b border-border/60">
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
                      className="group border-b border-border/60 transition-colors hover:bg-muted/40"
                    >
                      <td className="row-hover px-4 py-2.5">
                        <button className="flex items-center gap-2.5 text-left" onClick={() => navigate("student-detail", s.id)}>
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-gradient-to-br from-primary/15 to-amber-500/10 transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-[0_0_12px_-2px_rgba(99, 102, 241,0.45)] dark:group-hover:shadow-[0_0_12px_-2px_rgba(129, 140, 248,0.55)]">
                            {s.photoPath ? (
                              <img src={mediaUrl(s.photoPath)} alt={s.fullName} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[15.5px] font-bold text-primary/70">
                                {s.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">{s.fullName}</div>
                            <div className="tnum text-[14.5px] text-muted-foreground">{s.admissionNo} · {s.mobile}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[14.5px] font-semibold ${CATEGORY_COLORS[s.ageCategory] || ""}`}>{s.ageCategory}</span>
                      </td>
                      <td className="tnum px-3 py-2.5">{computeAge(s.dateOfBirth)} yrs</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{s.primarySport}</div>
                        <div className="text-[14.5px] text-muted-foreground">{s.playingPosition || "—"}</div>
                      </td>
                      <td className="tnum hidden px-3 py-2.5 lg:table-cell">{s.heightCm ? `${s.heightCm} cm` : "—"}</td>
                      <td className="hidden max-w-[160px] truncate px-3 py-2.5 xl:table-cell">
                        {s.schoolName ? (
                          <span className="inline-flex items-center gap-1 text-foreground/80"><GraduationCap className="h-3 w-3 text-muted-foreground" />{s.schoolName}</span>
                        ) : "—"}
                      </td>
                      <td className="tnum hidden px-3 py-2.5 xl:table-cell">{formatINR(s.monthlyFee)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity duration-200 group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-teal-500/10 hover:text-teal-600 dark:hover:text-teal-300" title="Open profile" onClick={() => navigate("student-detail", s.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary" title="Edit" onClick={() => openStudentForm(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300" title="Delete" onClick={() => setDeleting(s)}>
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

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="border-border bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-rose-500 dark:text-rose-300" /> Remove {deleting?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the student along with achievements, payment history and attendance records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg border-border bg-transparent text-xs hover:bg-muted">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg bg-rose-500/90 text-xs text-white hover:bg-rose-500" onClick={confirmDelete}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
